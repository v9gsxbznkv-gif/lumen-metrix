/**
 * Weekly-Level Sync from Planning Center
 *
 * Pulls individual check-in headcounts and donation records from PCO,
 * then aggregates them into per-week rows in attendance_weekly and giving_weekly.
 *
 * PCO Check-Ins hierarchy:
 *   Event → EventPeriod (weekly session) → LocationEventPeriod (per room)
 *
 *   For KIDS events (Childcare | Canton, Childcare | Jasper):
 *     We drill into each EventPeriod's location_event_periods to get per-room counts.
 *     Each LocationEventPeriod has regular_count, guest_count, volunteer_count and
 *     a linked Location with a name (e.g. "Babies", "Toddlers", "The Campground").
 *
 *   For non-kids events (RevStudents, YA Gathering, Revolution Check-In):
 *     We use the EventPeriod-level totals as before.
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

/**
 * Returns true if this event is a kids/childcare event that should be
 * broken down by room/location rather than stored as a single top-level row.
 */
function isKidsEvent(eventName: string): boolean {
  const lower = eventName.toLowerCase();
  return lower.includes("childcare") || lower.includes("revkids") || lower.includes("rev kids");
}

/**
 * Normalize historical subgroup names to match the canonical names used in the
 * breakdown table. This ensures old spreadsheet-imported data aligns with PCO data.
 *
 * Historical → Canonical mappings:
 *   "Elem Reruns" → "ReRuns"
 *   "Campground"  → "The Campground"
 */
export function normalizeSubgroupName(name: string): string {
  const n = name.trim();
  if (n === "Elem Reruns") return "ReRuns";
  if (n === "Campground") return "The Campground";
  return n;
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

    // Accumulate: key = "YYYY-MM-DD|campus|subgroupName" → counts
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

      const campus = mapEventToCampus(eventName);
      const isKids = isKidsEvent(eventName);

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

        if (isKids) {
          // -------------------------------------------------------
          // KIDS EVENT: drill into location_event_periods for per-room counts
          // -------------------------------------------------------
          const periodId = (period as any).id;
          let locationPeriods;
          try {
            locationPeriods = await client.paginateAll(
              `/check-ins/v2/events/${eventId}/event_periods/${periodId}/location_event_periods`,
              { include: "location", per_page: 100 }
            );
          } catch (err: any) {
            console.warn(`[PCO Weekly Sync] Skipping location periods for ${eventName} period ${periodId}: ${err.message}`);
            continue;
          }

          // Build a map of location_id → location name from included
          const locationNames = new Map<string, string>();
          for (const inc of locationPeriods.included || []) {
            if ((inc as any).type === "Location") {
              const locId = (inc as any).id;
              const locName = (inc as any).attributes?.name;
              if (locId && locName) {
                locationNames.set(locId, locName);
              }
            }
          }

          for (const locPeriod of locationPeriods.data) {
            const lpAttrs = (locPeriod as any).attributes;
            const regularCount = lpAttrs?.regular_count || 0;
            const guestCount = lpAttrs?.guest_count || 0;
            const volunteerCount = lpAttrs?.volunteer_count || 0;
            const totalCount = regularCount + guestCount + volunteerCount;

            if (totalCount === 0) continue;

            // Get location name from relationship
            const locationId = (locPeriod as any).relationships?.location?.data?.id;
            const rawLocationName = locationId ? locationNames.get(locationId) : null;
            if (!rawLocationName) continue;

            // Skip folder-type locations (they are containers, not rooms)
            // We detect folders by checking if the name matches a known folder pattern
            // or if the location has kind="Folder" (we can't easily check that here,
            // so we rely on the fact that folder locations typically have 0 counts)
            const locationName = normalizeSubgroupName(rawLocationName);

            const key = `${weekStartDate}|${campus}|${locationName}`;
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
                subgroup: locationName,
                headcount: totalCount,
                regularCount,
                guestCount,
                volunteerCount,
              });
            }
          }

          // Also store the top-level Childcare event total (for Kids aggregate)
          const totalRegular = attrs.regular_count || 0;
          const totalGuest = attrs.guest_count || 0;
          const totalVolunteer = attrs.volunteer_count || 0;
          const totalCount = totalRegular + totalGuest + totalVolunteer;
          if (totalCount > 0) {
            const key = `${weekStartDate}|${campus}|${eventName}`;
            const existing = weeklyMap.get(key);
            if (existing) {
              existing.headcount += totalCount;
              existing.regularCount += totalRegular;
              existing.guestCount += totalGuest;
              existing.volunteerCount += totalVolunteer;
            } else {
              weeklyMap.set(key, {
                year,
                weekNumber,
                weekStartDate,
                campus,
                subgroup: eventName,
                headcount: totalCount,
                regularCount: totalRegular,
                guestCount: totalGuest,
                volunteerCount: totalVolunteer,
              });
            }
          }

        } else {
          // -------------------------------------------------------
          // NON-KIDS EVENT: use event period totals as before
          // -------------------------------------------------------
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
          // Skip manually locked records — they've been corrected by the user
          if (existingRows[0].manualLock) {
            console.log(`[PCO Weekly Sync] Skipping locked attendance row: ${row.weekStartDate} ${row.campus} ${row.subgroup}`);
            continue;
          }
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

    // Fetch donations with date filter
    const donationsResult = await client.paginateAll("/giving/v2/donations", {
      "where[received_at][gte]": effectiveDateFrom,
      "where[received_at][lte]": effectiveDateTo,
      per_page: 100,
    });

    const donations = donationsResult.data;
    console.log(`[PCO Weekly Giving] Got ${donations.length} donations`);

    if (onProgress) {
      await onProgress(70, `Processing ${donations.length} donations...`, 0);
    }

    // Aggregate by week
    const weeklyMap = new Map<string, {
      year: number;
      weekNumber: number;
      weekStartDate: string;
      total: number;
      general: number;
      designated: number;
      donationCount: number;
    }>();

    for (const donation of donations) {
      recordsProcessed++;
      const attrs = (donation as any).attributes;
      const receivedAt = attrs?.received_at;
      const paymentStatus = attrs?.payment_status;
      const amountCents = attrs?.amount_cents || 0;

      // Only count completed/succeeded payments
      if (!receivedAt || !["succeeded", "confirmed", "deposited"].includes(paymentStatus)) continue;
      if (amountCents <= 0) continue;

      const date = new Date(receivedAt);
      const sunday = getSunday(date);
      const weekStartDate = formatDate(sunday);
      const year = sunday.getFullYear();
      const weekNumber = getISOWeekNumber(sunday);
      const amountDollars = amountCents / 100;

      const key = weekStartDate;
      const existing = weeklyMap.get(key);
      if (existing) {
        existing.total += amountDollars;
        existing.general += amountDollars; // Simplified: all treated as general
        existing.donationCount++;
      } else {
        weeklyMap.set(key, {
          year,
          weekNumber,
          weekStartDate,
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
        const dbPct = 88 + Math.round((i / rows.length) * 6);
        await onProgress(dbPct, `Saving giving rows (${i}/${rows.length})...`, recordsProcessed);
      }

      try {
        const existingRows = await db
          .select()
          .from(givingWeekly)
          .where(
            and(
              eq(givingWeekly.weekStartDate, row.weekStartDate),
              eq(givingWeekly.campus, "All Campuses")
            )
          )
          .limit(1);

        if (existingRows.length > 0) {
          if (existingRows[0].manualLock) {
            console.log(`[PCO Weekly Giving] Skipping locked giving row: ${row.weekStartDate}`);
            continue;
          }
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
            campus: "All Campuses",
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
// Combined Weekly Sync (attendance + giving)
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
