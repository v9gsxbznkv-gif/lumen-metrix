/**
 * Auto-process demographics data — address fetch + geocoding
 *
 * Called by the heartbeat every 30 minutes to chip away at the backlog.
 * Processes a limited batch each run to avoid timeouts and rate limits.
 *
 * Strategy:
 * - Fetch 50 addresses from PCO per heartbeat (250ms delay between = ~15s)
 * - Geocode 100 addresses per heartbeat (50ms delay between = ~10s)
 * - Total time per heartbeat: ~25s (well within timeout)
 * - At 2 batches/hour, clears 2,178 backlog in ~22 hours
 */
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { pcoPeople } from "../../drizzle/schema";
import { PcoClient, getValidAccessToken } from "../pco/client";
import { makeRequest, type GeocodingResult } from "../_core/map";

const ADDRESS_BATCH_SIZE = 50;
const GEOCODE_BATCH_SIZE = 100;
const PCO_DELAY_MS = 250; // 250ms between PCO API calls
const GEOCODE_DELAY_MS = 50; // 50ms between geocode calls

export interface AutoProcessResult {
  addressesFetched: number;
  addressesNoData: number;
  addressErrors: number;
  addressRemaining: number;
  geocoded: number;
  geocodeFailed: number;
  geocodeRemaining: number;
  durationMs: number;
}

/**
 * Fetch addresses from PCO for people who don't have them yet.
 * Returns count of processed + remaining.
 */
async function fetchAddressBatch(): Promise<{
  synced: number;
  noAddress: number;
  errors: number;
  remaining: number;
}> {
  const db = await getDb();
  if (!db) return { synced: 0, noAddress: 0, errors: 0, remaining: 0 };

  const accessToken = await getValidAccessToken();
  if (!accessToken) return { synced: 0, noAddress: 0, errors: 0, remaining: -1 };

  const client = new PcoClient(accessToken);

  // Get people who need addresses (zip IS NULL = never fetched)
  const people = await db
    .select({ id: pcoPeople.id, pcoId: pcoPeople.pcoId })
    .from(pcoPeople)
    .where(
      and(
        eq(pcoPeople.status, "active"),
        isNull(pcoPeople.zip)
      )
    )
    .limit(ADDRESS_BATCH_SIZE);

  if (people.length === 0) {
    return { synced: 0, noAddress: 0, errors: 0, remaining: 0 };
  }

  let synced = 0;
  let noAddress = 0;
  let errors = 0;

  for (const person of people) {
    try {
      const addrResult = await client.get<any>(
        `/people/v2/people/${person.pcoId}/addresses`
      );

      const addresses = Array.isArray(addrResult.data) ? addrResult.data : [];
      const primary = addresses.find(
        (a: any) => a.attributes?.primary === true
      ) || addresses[0];

      if (primary?.attributes) {
        const attrs = primary.attributes;
        const streetParts = [attrs.street_line_1, attrs.street_line_2].filter(Boolean);
        const street = streetParts.join(", ") || null;
        await db
          .update(pcoPeople)
          .set({
            street,
            city: attrs.city || null,
            state: attrs.state?.trim() || null,
            zip: attrs.zip || null,
          })
          .where(eq(pcoPeople.id, person.id));
        synced++;
      } else {
        // No address on file — mark with empty zip so we don't keep retrying
        await db
          .update(pcoPeople)
          .set({ zip: "" })
          .where(eq(pcoPeople.id, person.id));
        noAddress++;
      }
    } catch (err: any) {
      console.warn(`[AutoProcess] Address fetch failed for ${person.pcoId}: ${err.message}`);
      errors++;
      // If we get a rate limit (429) or auth error, stop early
      if (err.message?.includes("429") || err.message?.includes("401")) {
        console.warn(`[AutoProcess] Stopping address batch early due to ${err.message}`);
        break;
      }
    }

    // Rate limit delay
    await new Promise((r) => setTimeout(r, PCO_DELAY_MS));
  }

  // Count remaining
  const [rem] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(pcoPeople)
    .where(
      and(
        eq(pcoPeople.status, "active"),
        isNull(pcoPeople.zip)
      )
    );

  return {
    synced,
    noAddress,
    errors,
    remaining: Number(rem?.count || 0),
  };
}

/**
 * Geocode addresses for people who have addresses but no coordinates.
 */
async function geocodeBatch(): Promise<{
  geocoded: number;
  failed: number;
  remaining: number;
}> {
  const db = await getDb();
  if (!db) return { geocoded: 0, failed: 0, remaining: 0 };

  // Get people with addresses but no coordinates
  const people = await db
    .select({
      id: pcoPeople.id,
      street: pcoPeople.street,
      city: pcoPeople.city,
      state: pcoPeople.state,
      zip: pcoPeople.zip,
    })
    .from(pcoPeople)
    .where(
      and(
        eq(pcoPeople.status, "active"),
        isNotNull(pcoPeople.zip),
        sql`${pcoPeople.zip} != ''`,
        isNull(pcoPeople.latitude)
      )
    )
    .limit(GEOCODE_BATCH_SIZE);

  if (people.length === 0) {
    return { geocoded: 0, failed: 0, remaining: 0 };
  }

  let geocoded = 0;
  let failed = 0;

  for (const person of people) {
    try {
      const parts = [person.street, person.city, person.state, person.zip].filter(
        (v) => v && v !== "NULL"
      );
      const address = parts.join(", ");
      if (!address) {
        failed++;
        continue;
      }

      const result = await makeRequest<GeocodingResult>(
        "/maps/api/geocode/json",
        { address }
      );

      if (result.status === "OK" && result.results[0]) {
        const loc = result.results[0].geometry.location;
        await db
          .update(pcoPeople)
          .set({
            latitude: loc.lat,
            longitude: loc.lng,
            geocodedAt: new Date(),
          })
          .where(eq(pcoPeople.id, person.id));
        geocoded++;
      } else {
        // Mark as failed so we don't retry forever
        await db
          .update(pcoPeople)
          .set({
            latitude: 0,
            longitude: 0,
            geocodedAt: new Date(),
          })
          .where(eq(pcoPeople.id, person.id));
        failed++;
      }

      await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS));
    } catch (err: any) {
      console.warn(`[AutoProcess] Geocoding failed for person ${person.id}: ${err.message}`);
      failed++;
    }
  }

  // Count remaining
  const [remainingResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(pcoPeople)
    .where(
      and(
        eq(pcoPeople.status, "active"),
        isNotNull(pcoPeople.zip),
        sql`${pcoPeople.zip} != ''`,
        isNull(pcoPeople.latitude)
      )
    );

  return {
    geocoded,
    failed,
    remaining: Number(remainingResult?.count || 0),
  };
}

/**
 * Main auto-process function called by the heartbeat.
 * Processes one batch of addresses + one batch of geocodes.
 */
export async function autoProcessDemographics(): Promise<AutoProcessResult> {
  const start = Date.now();

  console.log("[AutoProcess] Starting address fetch batch...");
  const addrResult = await fetchAddressBatch();
  console.log(`[AutoProcess] Addresses: ${addrResult.synced} fetched, ${addrResult.noAddress} no data, ${addrResult.errors} errors, ${addrResult.remaining} remaining`);

  console.log("[AutoProcess] Starting geocode batch...");
  const geoResult = await geocodeBatch();
  console.log(`[AutoProcess] Geocoding: ${geoResult.geocoded} done, ${geoResult.failed} failed, ${geoResult.remaining} remaining`);

  return {
    addressesFetched: addrResult.synced,
    addressesNoData: addrResult.noAddress,
    addressErrors: addrResult.errors,
    addressRemaining: addrResult.remaining,
    geocoded: geoResult.geocoded,
    geocodeFailed: geoResult.failed,
    geocodeRemaining: geoResult.remaining,
    durationMs: Date.now() - start,
  };
}
