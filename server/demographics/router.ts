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
    address: "125 Union Hill Trail, Canton, GA 30115",
    lat: 34.236065,
    lng: -84.4125308,
  },
  {
    name: "Jasper",
    address: "689 North Main St, Jasper, GA 30143",
    lat: 34.4731533,
    lng: -84.4390925,
  },
];

/**
 * Normalize PCO campus names to match dashboard CAMPUS_COLORS keys.
 * PCO stores "Canton Campus", "Jasper Campus" but dashboard uses "Canton", "Jasper".
 */
function normalizeCampusName(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  // Strip trailing " Campus" suffix
  const normalized = raw.replace(/\s+Campus$/i, "");
  return normalized || "Unknown";
}

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
          isNotNull(pcoPeople.longitude),
          sql`${pcoPeople.latitude} != 0`,
          sql`${pcoPeople.longitude} != 0`
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
        campus: normalizeCampusName(r.campus),
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
   * Phase 1: Sync all active people from PCO (with campus assignment).
   * Lightweight — no addresses. Returns count of people synced.
   */
  syncAddresses: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const accessToken = await getValidAccessToken();
    if (!accessToken) throw new Error("PCO not connected \u2014 please connect in Settings");

    const client = new PcoClient(accessToken);

    const { syncPeople } = await import("../pco/sync");
    const result = await syncPeople(client);

    if (result.status === "failed") {
      throw new Error(`People sync failed: ${result.errorMessage}`);
    }

    // Count how many still need addresses
    const [needAddr] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople)
      .where(
        and(
          eq(pcoPeople.status, "active"),
          isNull(pcoPeople.zip)
        )
      );
    const [haveAddr] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople)
      .where(
        and(
          eq(pcoPeople.status, "active"),
          isNotNull(pcoPeople.zip),
          sql`${pcoPeople.zip} != ''`
        )
      );

    return {
      synced: Number(haveAddr?.count || 0),
      noAddress: Number(needAddr?.count || 0),
      errors: 0,
      total: result.recordsProcessed,
    };
  }),

  /**
   * Phase 2: Fetch addresses from PCO for a batch of people who don't have one.
   * Called repeatedly from the frontend until remaining === 0.
   */
  fetchAddressBatch: publicProcedure
    .input(z.object({ batchSize: z.number().min(1).max(100).default(50) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const accessToken = await getValidAccessToken();
      if (!accessToken) throw new Error("PCO not connected");

      const client = new PcoClient(accessToken);

      // Get a batch of people who need addresses
      const people = await db
        .select({ id: pcoPeople.id, pcoId: pcoPeople.pcoId })
        .from(pcoPeople)
        .where(
          and(
            eq(pcoPeople.status, "active"),
            isNull(pcoPeople.zip)
          )
        )
        .limit(input.batchSize);

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
            await db
              .update(pcoPeople)
              .set({ zip: "" })
              .where(eq(pcoPeople.id, person.id));
            noAddress++;
          }
        } catch (err: any) {
          console.warn(`[Demographics] Address fetch failed for ${person.pcoId}: ${err.message}`);
          errors++;
        }
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
        batchProcessed: people.length,
      };
    }),

  /**
   * Geocode addresses for active people who have an address but no lat/lng.
   * Uses Google Maps Geocoding API via the Manus proxy.
   * Processes a batch at a time (default 100) to avoid HTTP timeouts.
   * Call repeatedly until remaining === 0.
   */
  geocodeAddresses: publicProcedure
    .input(z.object({ batchSize: z.number().min(1).max(200).default(100) }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const batchSize = input?.batchSize ?? 100;

      // Get people with addresses but no coordinates — limited batch
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
        .limit(batchSize);

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
            // Mark as failed so we don't retry forever — set lat to 0
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

          // Small delay to avoid rate limits
          await new Promise((r) => setTimeout(r, 50));
        } catch (err: any) {
          console.warn(`[Demographics] Geocoding failed for person ${person.id}: ${err.message}`);
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
      const remaining = Number(remainingResult?.count || 0);

      return { geocoded, failed, total: people.length, remaining };
    }),

  /**
   * Backfill campus from PCO for all active people.
   * Fetches /people/v2/people with include=primary_campus and updates the campus field.
   * This is a one-time operation to populate campus for records that were synced before
   * the campus field was included in the people sync.
   */
  backfillCampus: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const accessToken = await getValidAccessToken();
    if (!accessToken) throw new Error("PCO not connected — please connect in Settings");

    const client = new PcoClient(accessToken);

    console.log("[Demographics] Starting campus backfill from PCO...");

    // Fetch all people with primary_campus included
    const TIMEOUT_MS = 120_000;
    const peopleResult = await Promise.race([
      client.paginateAll("/people/v2/people", { per_page: 100, include: "primary_campus" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      ),
    ]);

    console.log(`[Demographics] Got ${peopleResult.data.length} people, ${peopleResult.included.length} included resources`);

    // Build lookup map for included campus resources
    const includedMap: Record<string, any> = {};
    for (const inc of peopleResult.included) {
      includedMap[`${inc.type}-${inc.id}`] = inc;
    }

    // Build pcoId -> campusName map
    const campusMap = new Map<string, string>();
    for (const person of peopleResult.data) {
      const pcoId = String(person.id);
      const campusRef = (person as any).relationships?.primary_campus?.data;
      const campusObj = campusRef ? includedMap[`Campus-${campusRef.id}`] : null;
      const campusName = campusObj?.attributes?.name || null;
      if (campusName) {
        campusMap.set(pcoId, campusName);
      }
    }

    console.log(`[Demographics] Found campus assignments for ${campusMap.size} people`);

    // Update all matching records in DB
    let updated = 0;
    for (const [pcoId, campusName] of Array.from(campusMap)) {
      const result = await db
        .update(pcoPeople)
        .set({ campus: campusName })
        .where(eq(pcoPeople.pcoId, pcoId));
      if (result[0]?.affectedRows > 0) updated++;
    }

    console.log(`[Demographics] Campus backfill complete: ${updated} records updated`);

    return {
      totalPeople: peopleResult.data.length,
      withCampus: campusMap.size,
      updated,
    };
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
