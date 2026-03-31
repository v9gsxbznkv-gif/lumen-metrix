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
 *
 * Default date range: Jan 1 2023 → today (avoids pulling 10+ years of history on first run).
 */
import { eq, and } from "drizzle-orm";
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
  const day = d.getDay();
  d.setDate(d.getDate() - day);
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

/** Default: start of 2023 */
const DEFAULT_DATE_FROM = "2023-01-01";

// ============================================================
// Weekly Attendance Sync
// ============================================================

export async function syncWeeklyAttendance(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, message: string, processed: number) => Promise<void>
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  // Default to 2023-present if no range given
  const effectiveDateFrom = dateFrom || DEFAULT_DATE_FROM;
  const effectiveDateTo = dateTo || formatDate(new Date());

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log(`[PCO Weekly Sync] Starting weekly attendance sync (${effectiveDateFrom} → ${effectiveDateTo})...`);

    // Step 1: Get all check-in events
    const eventsResult = await client.paginateAll("/check-ins/v2/events");
    const events = eventsResult.data;
    console.log(`[PCO Weekly Sync] Got ${events.length} check-in events`);

    if (onProgress) {
      await onProgress(22, `Found ${events.length} check-in events. Fetching weekly periods...`, 0);
    }

    // Accumulate: key = "YYYY-MM-DD|campus|eventName" → counts
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

    for (let i = 0; i < events.length; i++) {
      const event = events[i] as any;
      const eventId = event.id;
      const eventName = event.attributes?.name || `Event-${eventId}`;

      // Report per-event progress: 22% → 55% across all events
      const eventPct = 22 + Math.round((i / events.length) * 33);
      if (onProgress) {
        await onProgress(
          eventPct,
          `Fetching periods for "${eventName}" (${i + 1}/${events.length})...`,
          recordsProcessed
        );
      }

      console.log(`[PCO Weekly Sync] Processing event ${i + 1}/${events.length}: ${eventName}`);

      const periodParams: Record<string, any> = {
        per_page: 100,
        order: "-starts_at",
        "where[starts_at][gte]": effectiveDateFrom,
        "where[starts_at][lte]": effectiveDateTo,
      };

      let periodsResult;
      try {
        periodsResult = await client.paginateAll(
          `/check-ins/v2/events/${eventId}/event_periods`,
          periodParams
        );
      } catch (err: any) {
        console.warn(`[PCO Weekly Sync] Skipping event ${eventName}: ${err.message}`);
        continue;
      }

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

    if (onProgress) {
      await onProgress(56, `Saving ${weeklyMap.size} weekly attendance rows to database...`, recordsProcessed);
    }

    // Step 2: Upsert into attendance_weekly
    const rows = Array.from(weeklyMap.values());
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Report DB write progress: 56% → 60%
      if (onProgress && i % 50 === 0) {
        const dbPct = 56 + Math.round((i / rows.length) * 4);
        await onProgress(dbPct, `Saving attendance rows (${i}/${rows.length})...`, recordsProcessed);
      }

      try {
        const existingRows = await db
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

        if (existingRows.length > 0) {
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
            .where(eq(attendanceWeekly.id, existingRows[0].id));
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

export async function syncWeeklyGiving(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, message: string, processed: number) => Promise<void>
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  const effectiveDateFrom = dateFrom || DEFAULT_DATE_FROM;
  const effectiveDateTo = dateTo || formatDate(new Date());

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log(`[PCO Weekly Giving] Starting weekly giving sync (${effectiveDateFrom} → ${effectiveDateTo})...`);

    if (onProgress) {
      await onProgress(62, "Fetching donation records from PCO...", 0);
    }

    // Fetch all donations in date range
    const donationParams: Record<string, any> = {
      per_page: 100,
      order: "-received_at",
      "where[received_at][gte]": effectiveDateFrom,
      "where[received_at][lte]": effectiveDateTo,
    };

    const donationsResult = await client.paginateAll("/giving/v2/donations", donationParams);
    const donations = donationsResult.data;
    console.log(`[PCO Weekly Giving] Got ${donations.length} donations`);

    if (onProgress) {
      await onProgress(70, `Processing ${donations.length} donations...`, 0);
    }

    // Aggregate by week/campus
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

    for (const donation of donations) {
      recordsProcessed++;
      const attrs = (donation as any).attributes;
      const receivedAt = attrs?.received_at;
      if (!receivedAt) continue;

      // Only count completed donations
      const status = attrs.payment_status;
      if (status && status !== "succeeded" && status !== "received") continue;

      const amountCents = attrs.amount_cents || 0;
      const amountDollars = amountCents / 100;
      if (amountDollars <= 0) continue;

      const date = new Date(receivedAt);
      const sunday = getSunday(date);
      const weekStartDate = formatDate(sunday);
      const year = sunday.getFullYear();
      const weekNumber = getISOWeekNumber(sunday);

      // PCO doesn't easily expose campus per donation without includes;
      // use "All Campuses" as the aggregate campus
      const campus = "All Campuses";
      const key = `${weekStartDate}|${campus}`;

      const existing = weeklyMap.get(key);
      if (existing) {
        existing.total += amountDollars;
        existing.general += amountDollars; // treat all as general unless we have fund data
        existing.donationCount++;
      } else {
        weeklyMap.set(key, {
          year,
          weekNumber,
          weekStartDate,
          campus,
          total: amountDollars,
          general: amountDollars,
          designated: 0,
          donationCount: 1,
        });
      }
    }

    console.log(`[PCO Weekly Giving] Aggregated ${weeklyMap.size} weekly giving rows`);

    if (onProgress) {
      await onProgress(88, `Saving ${weeklyMap.size} weekly giving rows to database...`, recordsProcessed);
    }

    // Upsert into giving_weekly
    const rows = Array.from(weeklyMap.values());
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (onProgress && i % 20 === 0) {
        const dbPct = 88 + Math.round((i / rows.length) * 8);
        await onProgress(dbPct, `Saving giving rows (${i}/${rows.length})...`, recordsProcessed);
      }

      try {
        const existingRows = await db
          .select()
          .from(givingWeekly)
          .where(
            and(
              eq(givingWeekly.weekStartDate, row.weekStartDate),
              eq(givingWeekly.campus, row.campus)
            )
          )
          .limit(1);

        if (existingRows.length > 0) {
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
            .where(eq(givingWeekly.id, existingRows[0].id));
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
        console.warn(`[PCO Weekly Giving] Error upserting giving row:`, err.message);
      }
    }

    console.log(`[PCO Weekly Giving] Weekly giving sync complete: ${recordsProcessed} donations → ${recordsCreated} created, ${recordsUpdated} updated`);

    return {
      syncType: "weekly_giving",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Weekly Giving] Weekly giving sync failed:", error.message);
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

// ============================================================
// Combined Weekly Sync
// ============================================================

export async function syncAllWeekly(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, message: string, processed: number) => Promise<void>
): Promise<{ attendance: SyncResult; giving: SyncResult }> {
  const attendance = await syncWeeklyAttendance(client, dateFrom, dateTo, onProgress);
  const giving = await syncWeeklyGiving(client, dateFrom, dateTo, onProgress);
  return { attendance, giving };
}
