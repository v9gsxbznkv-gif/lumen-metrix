/**
 * Weekly-Level Sync from Planning Center
 *
 * Pulls individual check-in headcounts and donation records from PCO,
 * then aggregates them into per-week rows in attendance_weekly and giving_weekly.
 *
 * PCO Check-Ins hierarchy:
 *   Event → EventPeriod (weekly session) → has regular_count, guest_count, volunteer_count
 *   Each EventPeriod has a starts_at timestamp that tells us the exact Sunday.
 *
 * PCO Giving:
 *   Donations → each has received_at, amount_cents, payment_status
 *   We group by the Sunday of the week (Mon-Sun week, with Sunday as the anchor).
 */
import { eq, and, sql } from "drizzle-orm";
import { PcoClient } from "./client";
import { attendanceWeekly, givingWeekly } from "../../drizzle/schema";
import { getDb } from "../db";
import type { SyncResult } from "./sync";

// ============================================================
// Date helpers
// ============================================================

/**
 * Get the Sunday of the week for a given date.
 * If the date IS a Sunday, returns that date.
 * Otherwise returns the most recent Sunday before it.
 */
function getSunday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  d.setDate(d.getDate() - day);
  return d;
}

/**
 * Format a date as 'YYYY-MM-DD'.
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get ISO week number for a date.
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday=7 for this calculation
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Map a PCO event name to a campus.
 */
function mapEventToCampus(eventName: string): string {
  const name = eventName.toLowerCase();
  if (name.includes("canton")) return "Canton";
  if (name.includes("jasper")) return "Jasper";
  if (name.includes("online")) return "Online";
  if (name.includes("woodstock")) return "Woodstock";
  return "Other";
}

// ============================================================
// Weekly Attendance Sync
// ============================================================

/**
 * Sync weekly attendance from PCO Check-Ins API.
 *
 * For each PCO event (e.g., "Revolution Canton Check-In"), fetches all
 * event_periods (weekly sessions) and aggregates headcounts by Sunday date.
 *
 * Each event_period has: starts_at, regular_count, guest_count, volunteer_count.
 * Multiple event_periods can share the same Sunday (e.g., 9am + 11am services),
 * so we SUM them per Sunday/event.
 */
export async function syncWeeklyAttendance(
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

    console.log("[PCO Weekly Sync] Starting weekly attendance sync...");

    // Step 1: Get all check-in events
    const eventsResult = await client.paginateAll("/check-ins/v2/events");
    console.log(`[PCO Weekly Sync] Got ${eventsResult.data.length} check-in events`);

    // Accumulate: key = "YYYY-MM-DD|campus|subgroup" → counts
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

    for (const event of eventsResult.data) {
      const eventId = event.id;
      const eventName = (event as any).attributes?.name || `Event-${eventId}`;
      console.log(`[PCO Weekly Sync] Processing event: ${eventName} (ID: ${eventId})`);

      // Fetch event_periods with date filters
      const periodParams: Record<string, any> = {
        per_page: 100,
        order: "-starts_at",
      };
      if (dateFrom) periodParams["where[starts_at][gte]"] = dateFrom;
      if (dateTo) periodParams["where[starts_at][lte]"] = dateTo;

      const periodsResult = await client.paginateAll(
        `/check-ins/v2/events/${eventId}/event_periods`,
        periodParams
      );
      console.log(`[PCO Weekly Sync]   Got ${periodsResult.data.length} event periods for ${eventName}`);

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

        const campus = mapEventToCampus(eventName);
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
    }

    console.log(`[PCO Weekly Sync] Aggregated ${weeklyMap.size} weekly attendance rows`);

    // Step 2: Upsert into attendance_weekly
    for (const row of Array.from(weeklyMap.values())) {
      try {
        // Check for existing row
        const existing = await db
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

        if (existing.length > 0) {
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
            .where(eq(attendanceWeekly.id, existing[0].id));
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
      } catch (err: any) {
        console.warn(`[PCO Weekly Sync] Error upserting attendance row:`, err.message);
      }
    }

    console.log(`[PCO Weekly Sync] Weekly attendance sync complete: ${recordsProcessed} periods → ${recordsCreated} created, ${recordsUpdated} updated`);

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

/**
 * Sync weekly giving from PCO Giving API.
 *
 * Fetches individual donations and aggregates by the Sunday of the week.
 * Each donation has: received_at, amount_cents, payment_status.
 * We group by Sunday (Mon-Sun week) and campus.
 */
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

    const params: Record<string, any> = {
      include: "designations",
      per_page: 100,
    };
    if (dateFrom) params["where[received_at][gte]"] = dateFrom;
    if (dateTo) params["where[received_at][lte]"] = dateTo;
    params["where[payment_status]"] = "succeeded";

    const donationsResult = await client.paginateAll("/giving/v2/donations", params);
    console.log(`[PCO Weekly Sync] Got ${donationsResult.data.length} donations`);

    // Accumulate: key = "YYYY-MM-DD|campus" → totals
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

      // PCO giving doesn't have campus info on donations directly
      // We default to "All Campuses" — campus-level breakdown would require
      // matching donors to campuses via the People API
      const campus = "All Campuses";
      const key = `${weekStartDate}|${campus}`;

      const existing = weeklyMap.get(key);
      if (existing) {
        existing.total += amount;
        existing.general += amount; // Simplified: treat all as general
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

    // Upsert into giving_weekly
    for (const row of Array.from(weeklyMap.values())) {
      try {
        const existing = await db
          .select()
          .from(givingWeekly)
          .where(
            and(
              eq(givingWeekly.weekStartDate, row.weekStartDate),
              eq(givingWeekly.campus, row.campus)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(givingWeekly)
            .set({
              total: String(row.total),
              general: String(row.general),
              designated: String(row.designated),
              donationCount: row.donationCount,
              year: row.year,
              weekNumber: row.weekNumber,
            })
            .where(eq(givingWeekly.id, existing[0].id));
          recordsUpdated++;
        } else {
          await db.insert(givingWeekly).values({
            year: row.year,
            weekNumber: row.weekNumber,
            weekStartDate: row.weekStartDate,
            campus: row.campus,
            total: String(row.total),
            general: String(row.general),
            designated: String(row.designated),
            donationCount: row.donationCount,
            source: "pco",
          });
          recordsCreated++;
        }
      } catch (err: any) {
        console.warn(`[PCO Weekly Sync] Error upserting giving row:`, err.message);
      }
    }

    console.log(`[PCO Weekly Sync] Weekly giving sync complete: ${recordsProcessed} donations → ${recordsCreated} created, ${recordsUpdated} updated`);

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
