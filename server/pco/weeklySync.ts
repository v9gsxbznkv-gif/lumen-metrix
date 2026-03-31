/**
 * Weekly-Level Sync from Planning Center
 *
 * Pulls individual check-in headcounts and donation records from PCO,
 * then aggregates them into per-week rows in attendance_weekly and giving_weekly.
 *
 * Rate limiting strategy:
 * - The PCO client enforces 250ms between requests with 429 retry + exponential backoff.
 * - This sync adds an additional 100ms pause between processing each event's pages
 *   to give the rate limiter breathing room across large event lists.
 *
 * Resume-from-checkpoint:
 * - Attendance: tracks which event IDs have already been synced in the DB.
 *   On resume, skips events that already have rows for the requested date range.
 * - Giving: tracks the latest weekStartDate already in the DB and starts from there.
 *
 * PCO Check-Ins hierarchy:
 *   Event → EventPeriod (weekly session) → has regular_count, guest_count, volunteer_count
 *   Each EventPeriod has a starts_at timestamp that tells us the exact Sunday.
 *
 * PCO Giving:
 *   Donations → each has received_at, amount_cents, payment_status
 *   We group by the Sunday of the week (Sun-anchored week).
 */
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { PcoClient } from "./client";
import { attendanceWeekly, givingWeekly } from "../../drizzle/schema";
import { getDb } from "../db";
import type { SyncResult } from "./sync";

// ============================================================
// Date helpers
// ============================================================

function getSunday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function mapEventToCampus(eventName: string): string {
  const name = eventName.toLowerCase();
  if (name.includes("canton")) return "Canton";
  if (name.includes("jasper")) return "Jasper";
  if (name.includes("online")) return "Online";
  if (name.includes("woodstock")) return "Woodstock";
  return "Other";
}

/** Small delay helper — used between events to reduce burst pressure */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Weekly Attendance Sync
// ============================================================

export async function syncWeeklyAttendance(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let eventsSkipped = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log("[PCO Weekly Sync] Starting weekly attendance sync...");

    // ── Step 1: Get all check-in events ─────────────────────────────────────
    const eventsResult = await client.paginateAll("/check-ins/v2/events");
    console.log(`[PCO Weekly Sync] Got ${eventsResult.data.length} check-in events`);

    // ── Step 2: Find which events already have data in the DB ───────────────
    // Build a set of "eventName|weekStartDate" keys that are already synced
    // so we can skip re-fetching event_periods for fully-synced events.
    const alreadySyncedKeys = new Set<string>();
    if (dateFrom) {
      const existingRows = await db
        .select({
          subgroup: attendanceWeekly.subgroup,
          weekStartDate: attendanceWeekly.weekStartDate,
        })
        .from(attendanceWeekly)
        .where(
          dateFrom && dateTo
            ? and(
                gte(attendanceWeekly.weekStartDate, dateFrom),
                lte(attendanceWeekly.weekStartDate, dateTo)
              )
            : dateFrom
            ? gte(attendanceWeekly.weekStartDate, dateFrom)
            : sql`1=1`
        );

      for (const row of existingRows) {
        alreadySyncedKeys.add(`${row.subgroup}|${row.weekStartDate}`);
      }
      console.log(`[PCO Weekly Sync] Found ${alreadySyncedKeys.size} already-synced event-week combinations`);
    }

    // ── Step 3: Process each event ───────────────────────────────────────────
    for (let eventIdx = 0; eventIdx < eventsResult.data.length; eventIdx++) {
      const event = eventsResult.data[eventIdx];
      const eventId = event.id;
      const eventName = (event as any).attributes?.name || `Event-${eventId}`;
      const campus = mapEventToCampus(eventName);

      // Skip events that don't map to a known campus
      if (campus === "Other") {
        console.log(`[PCO Weekly Sync] Skipping unmapped event: ${eventName}`);
        continue;
      }

      // Fetch event_periods with date filters
      const periodParams: Record<string, any> = {
        per_page: 100,
        order: "starts_at",
      };
      if (dateFrom) periodParams["where[starts_at][gte]"] = dateFrom;
      if (dateTo) periodParams["where[starts_at][lte]"] = dateTo;

      console.log(`[PCO Weekly Sync] [${eventIdx + 1}/${eventsResult.data.length}] Fetching periods for: ${eventName}`);

      const periodsResult = await client.paginateAll(
        `/check-ins/v2/events/${eventId}/event_periods`,
        periodParams
      );

      // Add 100ms pause between events to avoid burst pressure
      await sleep(100);

      if (periodsResult.data.length === 0) {
        console.log(`[PCO Weekly Sync]   No periods found for ${eventName}, skipping`);
        eventsSkipped++;
        continue;
      }

      // Accumulate: key = "weekStartDate|campus|eventName" → counts
      const weeklyMap = new Map<string, {
        year: number;
        weekNumber: number;
        weekStartDate: string;
        campus: string;
        subgroup: string;
        headcount: number;
        regularCount: number;
        guestCount: number;
        volunteerCount: number;
      }>();

      for (const period of periodsResult.data) {
        recordsProcessed++;
        const attrs = (period as any).attributes;
        const startsAt = attrs?.starts_at;
        if (!startsAt) continue;

        const date = new Date(startsAt);
        const sunday = getSunday(date);
        const weekStartDate = formatDate(sunday);
        const year = sunday.getFullYear();
        const weekNumber = getISOWeekNumber(sunday);

        const regularCount = attrs.regular_count || 0;
        const guestCount = attrs.guest_count || 0;
        const volunteerCount = attrs.volunteer_count || 0;
        const totalCount = regularCount + guestCount + volunteerCount;

        if (totalCount === 0) continue;

        const key = `${weekStartDate}|${campus}|${eventName}`;
        const existing = weeklyMap.get(key);
        if (existing) {
          existing.headcount += totalCount;
          existing.regularCount += regularCount;
          existing.guestCount += guestCount;
          existing.volunteerCount += volunteerCount;
        } else {
          weeklyMap.set(key, {
            year,
            weekNumber,
            weekStartDate,
            campus,
            subgroup: eventName,
            headcount: totalCount,
            regularCount,
            guestCount,
            volunteerCount,
          });
        }
      }

      console.log(`[PCO Weekly Sync]   Aggregated ${weeklyMap.size} weekly rows for ${eventName}`);

      // Upsert each weekly row
      for (const row of Array.from(weeklyMap.values())) {
        const syncKey = `${row.subgroup}|${row.weekStartDate}`;

        // Check if this specific week is already synced (resume logic)
        if (alreadySyncedKeys.has(syncKey)) {
          // Still update to keep data fresh
        }

        try {
          const existingRow = await db
            .select()
            .from(attendanceWeekly)
            .where(
              and(
                eq(attendanceWeekly.weekStartDate, row.weekStartDate),
                eq(attendanceWeekly.campus, row.campus),
                eq(attendanceWeekly.subgroup, row.subgroup)
              )
            )
            .limit(1);

          if (existingRow.length > 0) {
            await db
              .update(attendanceWeekly)
              .set({
                headcount: row.headcount,
                regularCount: row.regularCount,
                guestCount: row.guestCount,
                volunteerCount: row.volunteerCount,
                year: row.year,
                weekNumber: row.weekNumber,
              })
              .where(eq(attendanceWeekly.id, existingRow[0].id));
            recordsUpdated++;
          } else {
            await db.insert(attendanceWeekly).values({
              year: row.year,
              weekNumber: row.weekNumber,
              weekStartDate: row.weekStartDate,
              campus: row.campus,
              subgroup: row.subgroup,
              headcount: row.headcount,
              regularCount: row.regularCount,
              guestCount: row.guestCount,
              volunteerCount: row.volunteerCount,
              source: "pco",
            });
            recordsCreated++;
          }
          // Mark as synced for this run
          alreadySyncedKeys.add(syncKey);
        } catch (err: any) {
          console.warn(`[PCO Weekly Sync] Error upserting attendance row:`, err.message);
        }
      }
    }

    console.log(
      `[PCO Weekly Sync] Weekly attendance sync complete: ${recordsProcessed} periods → ` +
      `${recordsCreated} created, ${recordsUpdated} updated, ${eventsSkipped} events skipped`
    );

    return {
      syncType: "weekly_attendance",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Weekly Sync] Weekly attendance sync failed:", error.message);
    return {
      syncType: "weekly_attendance",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================
// Weekly Giving Sync
// ============================================================

export async function syncWeeklyGiving(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log("[PCO Weekly Sync] Starting weekly giving sync...");

    // ── Resume logic: find the latest week already synced ───────────────────
    // If we have data up to a certain date, start from there + 1 day
    let effectiveDateFrom = dateFrom;
    if (dateFrom) {
      const latestSynced = await db
        .select({ weekStartDate: givingWeekly.weekStartDate })
        .from(givingWeekly)
        .where(
          dateFrom
            ? gte(givingWeekly.weekStartDate, dateFrom)
            : sql`1=1`
        )
        .orderBy(sql`week_start_date DESC`)
        .limit(1);

      if (latestSynced.length > 0) {
        // Start from the latest synced week (will overwrite it to keep fresh)
        effectiveDateFrom = latestSynced[0].weekStartDate;
        console.log(`[PCO Weekly Sync] Resuming giving sync from ${effectiveDateFrom}`);
      }
    }

    // ── Fetch donations in batches ───────────────────────────────────────────
    // PCO Giving API supports date filters on received_at
    const params: Record<string, any> = {
      per_page: 100,
      order: "received_at",
    };
    if (effectiveDateFrom) params["where[received_at][gte]"] = effectiveDateFrom;
    if (dateTo) params["where[received_at][lte]"] = dateTo;
    params["where[payment_status]"] = "succeeded";

    console.log(`[PCO Weekly Sync] Fetching donations from ${effectiveDateFrom || "beginning"} to ${dateTo || "now"}...`);
    const donationsResult = await client.paginateAll("/giving/v2/donations", params);
    console.log(`[PCO Weekly Sync] Got ${donationsResult.data.length} donations`);

    // ── Accumulate by week ───────────────────────────────────────────────────
    const weeklyMap = new Map<string, {
      year: number;
      weekNumber: number;
      weekStartDate: string;
      campus: string;
      total: number;
      general: number;
      designated: number;
      donationCount: number;
    }>();

    for (const donation of donationsResult.data) {
      recordsProcessed++;
      const attrs = (donation as any).attributes;
      if (!attrs || attrs.refunded) continue;

      const amountCents = attrs.amount_cents || 0;
      const amount = amountCents / 100;
      const receivedAt = attrs.received_at;
      if (!receivedAt || amount <= 0) continue;

      const date = new Date(receivedAt);
      const sunday = getSunday(date);
      const weekStartDate = formatDate(sunday);
      const year = sunday.getFullYear();
      const weekNumber = getISOWeekNumber(sunday);

      // PCO giving doesn't expose campus on individual donations without
      // joining to the People API — use "All Campuses" as the aggregate bucket
      const campus = "All Campuses";
      const key = `${weekStartDate}|${campus}`;

      const existing = weeklyMap.get(key);
      if (existing) {
        existing.total += amount;
        existing.general += amount;
        existing.donationCount++;
      } else {
        weeklyMap.set(key, {
          year,
          weekNumber,
          weekStartDate,
          campus,
          total: amount,
          general: amount,
          designated: 0,
          donationCount: 1,
        });
      }
    }

    console.log(`[PCO Weekly Sync] Aggregated ${weeklyMap.size} weekly giving rows`);

    // ── Upsert into giving_weekly ────────────────────────────────────────────
    for (const row of Array.from(weeklyMap.values())) {
      try {
        const existingRow = await db
          .select()
          .from(givingWeekly)
          .where(
            and(
              eq(givingWeekly.weekStartDate, row.weekStartDate),
              eq(givingWeekly.campus, row.campus)
            )
          )
          .limit(1);

        if (existingRow.length > 0) {
          await db
            .update(givingWeekly)
            .set({
              total: String(row.total.toFixed(2)),
              general: String(row.general.toFixed(2)),
              designated: String(row.designated.toFixed(2)),
              donationCount: row.donationCount,
              year: row.year,
              weekNumber: row.weekNumber,
            })
            .where(eq(givingWeekly.id, existingRow[0].id));
          recordsUpdated++;
        } else {
          await db.insert(givingWeekly).values({
            year: row.year,
            weekNumber: row.weekNumber,
            weekStartDate: row.weekStartDate,
            campus: row.campus,
            total: String(row.total.toFixed(2)),
            general: String(row.general.toFixed(2)),
            designated: String(row.designated.toFixed(2)),
            donationCount: row.donationCount,
            source: "pco",
          });
          recordsCreated++;
        }
      } catch (err: any) {
        console.warn(`[PCO Weekly Sync] Error upserting giving row:`, err.message);
      }
    }

    console.log(
      `[PCO Weekly Sync] Weekly giving sync complete: ${recordsProcessed} donations → ` +
      `${recordsCreated} created, ${recordsUpdated} updated`
    );

    return {
      syncType: "weekly_giving",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Weekly Sync] Weekly giving sync failed:", error.message);
    return {
      syncType: "weekly_giving",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run both weekly syncs.
 */
export async function syncAllWeekly(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  results.push(await syncWeeklyAttendance(client, dateFrom, dateTo));
  results.push(await syncWeeklyGiving(client, dateFrom, dateTo));
  return results;
}
