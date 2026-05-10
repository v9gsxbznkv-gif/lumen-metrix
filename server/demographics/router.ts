/**
 * Demographics Router — address sync, geocoding, and map data for PCO people
 */
import { z } from "zod";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { makeRequest, type GeocodingResult } from "../_core/map";
import { getDb } from "../db";
import { pcoPeople } from "../../drizzle/schema";
import { PcoClient } from "../pco/client";
import { getValidAccessToken } from "../pco/client";

// Canton & Jasper campus coordinates
const CAMPUS_LOCATIONS = [
  {
    name: "Canton",
    address: "1430 Reinhardt College Pkwy, Canton, GA 30114",
    lat: 34.2368,
    lng: -84.4908,
  },
  {
    name: "Jasper",
    address: "100 Stegall Dr, Jasper, GA 30143",
    lat: 34.4676,
    lng: -84.4293,
  },
];

export const demographicsRouter = router({
  /**
   * Get campus locations (static, no DB needed)
   */
  getCampuses: publicProcedure.query(() => {
    return CAMPUS_LOCATIONS;
  }),

  /**
   * Get all geocoded member locations for the map.
   * Returns lat/lng + campus for each person with coordinates.
   * No PII (names/emails) is sent to the frontend.
   */
  getMapPoints: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { points: [], stats: { total: 0, geocoded: 0, noAddress: 0 } };

    const rows = await db
      .select({
        latitude: pcoPeople.latitude,
        longitude: pcoPeople.longitude,
        campus: pcoPeople.campus,
        city: pcoPeople.city,
        state: pcoPeople.state,
        zip: pcoPeople.zip,
      })
      .from(pcoPeople)
      .where(
        and(
          eq(pcoPeople.status, "active"),
          isNotNull(pcoPeople.latitude),
          isNotNull(pcoPeople.longitude)
        )
      );

    // Stats
    const totalActive = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople)
      .where(eq(pcoPeople.status, "active"));

    const withAddress = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople)
      .where(
        and(
          eq(pcoPeople.status, "active"),
          isNotNull(pcoPeople.zip)
        )
      );

    return {
      points: rows.map((r) => ({
        lat: r.latitude!,
        lng: r.longitude!,
        campus: r.campus || "Unknown",
        city: r.city || "",
        zip: r.zip || "",
      })),
      stats: {
        total: Number(totalActive[0]?.count || 0),
        geocoded: rows.length,
        withAddress: Number(withAddress[0]?.count || 0),
      },
    };
  }),

  /**
   * Sync addresses from PCO for active people.
   * Fetches /people/v2/people/{id}/addresses for each active person
   * who doesn't have an address yet.
   */
  syncAddresses: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const accessToken = await getValidAccessToken();
    if (!accessToken) throw new Error("PCO not connected — please connect in Settings");

    const client = new PcoClient(accessToken);

    // Get active people without addresses
    const people = await db
      .select({ id: pcoPeople.id, pcoId: pcoPeople.pcoId })
      .from(pcoPeople)
      .where(
        and(
          eq(pcoPeople.status, "active"),
          isNull(pcoPeople.zip) // no address synced yet
        )
      );

    let synced = 0;
    let noAddress = 0;
    let errors = 0;

    for (const person of people) {
      try {
        const result = await client.get<any>(
          `/people/v2/people/${person.pcoId}/addresses`
        );

        const addresses = Array.isArray(result.data) ? result.data : [];
        // Pick primary address, or first one
        const primary = addresses.find(
          (a: any) => a.attributes?.primary === true
        ) || addresses[0];

        if (primary?.attributes) {
          const attrs = primary.attributes;
          await db
            .update(pcoPeople)
            .set({
              street: attrs.street || null,
              city: attrs.city || null,
              state: attrs.state || null,
              zip: attrs.zip || null,
            })
            .where(eq(pcoPeople.id, person.id));
          synced++;
        } else {
          // Mark as checked (set zip to empty string so we don't re-fetch)
          await db
            .update(pcoPeople)
            .set({ zip: "" })
            .where(eq(pcoPeople.id, person.id));
          noAddress++;
        }
      } catch (err: any) {
        console.warn(`[Demographics] Failed to fetch address for PCO person ${person.pcoId}: ${err.message}`);
        errors++;
      }
    }

    return { synced, noAddress, errors, total: people.length };
  }),

  /**
   * Geocode addresses for active people who have an address but no lat/lng.
   * Uses Google Maps Geocoding API via the Manus proxy.
   * Processes in batches to avoid rate limits.
   */
  geocodeAddresses: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

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
          sql`${pcoPeople.zip} != ''`, // has a real address (not empty marker)
          isNull(pcoPeople.latitude)
        )
      );

    let geocoded = 0;
    let failed = 0;

    for (const person of people) {
      try {
        // Build address string
        const parts = [person.street, person.city, person.state, person.zip].filter(Boolean);
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
          failed++;
        }

        // Small delay to avoid rate limits (50ms between requests)
        await new Promise((r) => setTimeout(r, 50));
      } catch (err: any) {
        console.warn(`[Demographics] Geocoding failed for person ${person.id}: ${err.message}`);
        failed++;
      }
    }

    return { geocoded, failed, total: people.length };
  }),

  /**
   * Get sync status — how many people have addresses, how many are geocoded
   */
  getSyncStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalActive: 0, withAddress: 0, geocoded: 0, pending: 0 };

    const [totalResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople)
      .where(eq(pcoPeople.status, "active"));

    const [addressResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople)
      .where(
        and(
          eq(pcoPeople.status, "active"),
          isNotNull(pcoPeople.zip),
          sql`${pcoPeople.zip} != ''`
        )
      );

    const [geocodedResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople)
      .where(
        and(
          eq(pcoPeople.status, "active"),
          isNotNull(pcoPeople.latitude)
        )
      );

    const totalActive = Number(totalResult?.count || 0);
    const withAddress = Number(addressResult?.count || 0);
    const geocoded = Number(geocodedResult?.count || 0);

    return {
      totalActive,
      withAddress,
      geocoded,
      pendingAddressSync: totalActive - withAddress - (totalActive - Number(
        (await db.select({ count: sql<number>`COUNT(*)` }).from(pcoPeople).where(
          and(eq(pcoPeople.status, "active"), isNull(pcoPeople.zip))
        ))[0]?.count || 0
      )),
      pendingGeocode: withAddress - geocoded,
    };
  }),
});
