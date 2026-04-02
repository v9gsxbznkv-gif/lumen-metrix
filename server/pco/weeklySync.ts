/**
 * Weekly-Level Sync from Planning Center
 *
 * Pulls individual check-in headcounts and donation records from PCO,
 * then aggregates them into per-week rows in attendance_weekly and giving_weekly.
 *
 * PCO Check-Ins hierarchy:
 *   Event → EventPeriod (weekly session) → LocationEventPeriod (per room)
 *
 *   For Revolution Canton/Jasper Check-In events:
 *     We drill into each EventPeriod's location_event_periods to get per-room counts.
 *     Individual room names are mapped to parent folder categories:
 *       Canton Thursday RevKids: Turtle+Owl→Nursery, Woodpecker+Porcupine→Toddlers,
 *         Room 4 - Pre-K→Pre-K, Treehouse - K-5th→Elementary
 *       Canton Sunday: The Nest→Babies, The Campground→Campground, The Treehouse→Treehouse, The Cove→Cove
 *       Jasper Preschool: Owls+Raccoons+Fox→Nursery, Room 1+Room 2→Pre-K
 *       Jasper Elementary: Cove, Treehouse, Reruns
 *     Volunteer/team locations are filtered out.
 *     RevStudents 5th & 6th under Jasper Check-In counts as adult attendance.
 *
 *   For RevStudents | Canton/Jasper Campus (separate events):
 *     Uses EventPeriod-level totals for Students.
 *
 *   For YA Gathering:
 *     Uses EventPeriod-level totals for Young Adults.
 *
 *   Childcare events are EXCLUDED entirely.
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

// ============================================================
// Event classification
// ============================================================

/**
 * Events that should be EXCLUDED entirely from sync.
 * Childcare events are not needed — kids data comes from
 * the main Revolution Check-In events at the room level.
 */
function isExcludedEvent(eventName: string): boolean {
  const lower = eventName.toLowerCase();
  return (
    lower.includes("childcare") ||
    lower.includes("revkids team") ||
    lower.includes("revkids university") ||
    lower.includes("test")
  );
}

/**
 * Returns true if this is a main campus check-in event that contains
 * kids rooms as sub-locations. We drill into location_event_periods
 * for these events to get per-room kids counts.
 */
function isMainCheckInEvent(eventName: string): boolean {
  return (
    eventName === "Revolution Canton Check-In" ||
    eventName === "Revolution Jasper Check-In"
  );
}

// ============================================================
// Room-to-category mapping
// ============================================================

/**
 * Maps individual PCO room/location names to their parent category names
 * for the kids breakdown. Volunteer/team locations return null (to be skipped).
 *
 * The category is what appears in the breakdown table on the Attendance page.
 */

// Known volunteer/team location names to exclude
const VOLUNTEER_LOCATIONS = new Set([
  "Campus Safety",
  "Gathering Leaders",
  "Adult Worship & Production Team",
  "GROW Band",
  "Prayer Team Members",
  "First Time Guests/GROW Area",
  "General Operations",
  "Greeter",
  "Parking",
  "Usher",
  "Team Member Lounge",
  "Welcome Team Member",
  "FTG Gathering Leaders",
  "Welcome Team Coach",
  "Gathering Coordinator",
  "Campus Safety Leader",
  "Small Group Leader",
  "Stage Host",
  "Photography",
  "Videography",
  "RK Production",
  "RK Band",
  "Buddy Team",
  "Coach",
  "Team Leader",
  "Team Leaders",
  "RevKids Check-In",
  "Welcome Team Leaders",
  "Prayer Team",
  "Photo & Video Team",
  "RevStudents Team Member",
  "RevKids TEAM MEMBER",
  "Stage Host - K-5th",
  "Team Leader - K-5th",
  "WORSHIP & PRODUCTION TEAM MEMBERS",
  "RevKids Welcome Team",
]);

// Canton room → category mapping
const CANTON_ROOM_MAP: Record<string, string> = {
  // Thursday RevKids Nursery
  "Turtle": "Nursery",
  "Owl": "Nursery",
  // Thursday RevKids Toddlers
  "Woodpecker": "Toddlers",
  "Porcupine": "Toddlers",
  // Thursday RevKids Pre-K
  "Room 4 - Pre-K": "Pre-K",
  // Thursday RevKids Elementary
  "Treehouse - K-5th": "Elementary",
  // Sunday RevKids rooms
  "The Nest": "Babies",
  "The Campground": "Campground",
  "The Treehouse": "Treehouse",
  "The Cove": "Cove",
};

// Jasper room → category mapping
const JASPER_ROOM_MAP: Record<string, string> = {
  // Preschool > Nursery
  "Owls": "Nursery",
  "Raccoons": "Nursery",
  "Fox": "Nursery",
  // Preschool > Pre-K
  "Room 1": "Pre-K",
  "Room 2": "Pre-K",
  // Elementary
  "Cove": "Cove",
  "Treehouse": "Treehouse",
  "Reruns ": "Reruns",  // Note: PCO has trailing space
  "Reruns": "Reruns",
};

// Jasper locations that count as ADULT attendance (not kids)
const JASPER_ADULT_LOCATIONS = new Set([
  "5th Grade",
  "6th Grade",
]);

/**
 * Map a PCO location name to a kids category for the breakdown table.
 * Returns the category name, or null if the location should be skipped
 * (volunteer role) or counted as adult attendance.
 *
 * @param locationName - Raw location name from PCO
 * @param campus - "Canton" or "Jasper"
 * @returns Category name for kids breakdown, "ADULT" if it counts as adult, or null to skip
 */
function mapLocationToCategory(locationName: string, campus: string): string | null {
  const trimmed = locationName.trim();

  // Skip volunteer/team locations
  if (VOLUNTEER_LOCATIONS.has(trimmed)) return null;

  // Skip folder-type names (these are containers, not rooms)
  const lower = trimmed.toLowerCase();
  if (lower === "thursday revkids") return null;
  if (lower === "elementary (k - 5th grade)") return null;
  if (lower === "elementary") return null;
  if (lower === "preschool") return null;
  if (lower === "nursery") return null;
  if (lower === "pre-k (must be potty-trained)") return null;
  if (lower === "pre-k") return null;
  if (lower === "toddlers") return null;
  if (lower === "revstudents 5th & 6th") return null;
  if (lower === "old locations (do not delete)") return null;
  if (lower === "team member") return null;

  if (campus === "Canton") {
    const mapped = CANTON_ROOM_MAP[trimmed];
    if (mapped) return mapped;
  } else if (campus === "Jasper") {
    // Check if this is an adult location under Jasper
    if (JASPER_ADULT_LOCATIONS.has(trimmed)) return "ADULT";
    const mapped = JASPER_ROOM_MAP[trimmed];
    if (mapped) return mapped;
  }

  // Unknown location — log it and skip (don't pollute data with unknown rooms)
  console.log(`[PCO Weekly Sync] Unknown location "${trimmed}" for ${campus} — skipping`);
  return null;
}

/**
 * Normalize historical subgroup names from spreadsheet imports to match
 * the canonical names used in the breakdown table.
 */
export function normalizeSubgroupName(name: string): string {
  const n = name.trim();
  if (n === "Elem Reruns") return "Reruns";
  if (n === "Campground") return "Campground";
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

    // Filter out excluded events upfront
    const allActiveEvents = events.filter((e: any) => {
      const name = e.attributes?.name || "";
      if (isExcludedEvent(name)) {
        console.log(`[PCO Weekly Sync] Excluding event: ${name}`);
        return false;
      }
      return true;
    });

    // Fast path: when syncing a narrow date range (≤14 days), only scan the
    // key events that contain relevant data. This avoids scanning 300+ old
    // RSVP events and makes a single-week re-sync complete in seconds.
    const isNarrowRange = (() => {
      const from = new Date(effectiveDateFrom);
      const to = new Date(effectiveDateTo);
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 14;
    })();

    const KEY_EVENTS = new Set([
      "Revolution Canton Check-In",
      "Revolution Jasper Check-In",
      "RevStudents | Canton Campus",
      "RevStudents | Jasper Campus",
      "YA Gathering",
    ]);

    const activeEvents = isNarrowRange
      ? allActiveEvents.filter((e: any) => KEY_EVENTS.has(e.attributes?.name || ""))
      : allActiveEvents;

    if (isNarrowRange) {
      console.log(`[PCO Weekly Sync] Narrow date range detected — scanning only ${activeEvents.length} key events (skipping ${allActiveEvents.length - activeEvents.length} historical events)`);
    } else {
      console.log(`[PCO Weekly Sync] Processing ${activeEvents.length} active events (excluded ${events.length - allActiveEvents.length})`);
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

    for (let i = 0; i < activeEvents.length; i++) {
      const event = activeEvents[i] as any;
      const eventId = event.id;
      const eventName = event.attributes?.name || `Event-${eventId}`;

      // Report per-event progress: 22% → 55% across all events
      const eventPct = 22 + Math.round((i / activeEvents.length) * 33);
      if (onProgress) {
        await onProgress(
          eventPct,
          `Fetching periods for "${eventName}" (${i + 1}/${activeEvents.length})...`,
          recordsProcessed
        );
      }

      console.log(`[PCO Weekly Sync] Processing event ${i + 1}/${activeEvents.length}: ${eventName}`);

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
      const isMainCheckin = isMainCheckInEvent(eventName);

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

        if (isMainCheckin) {
          // -------------------------------------------------------
          // MAIN CHECK-IN EVENT: drill into location_event_periods
          // to get per-room kids counts and adult totals
          // -------------------------------------------------------
          const periodId = (period as any).id;

          // Heartbeat: update progress for each period within main check-in events
          // This keeps the stall watchdog alive during the slow location_event_periods calls
          if (onProgress) {
            const periodIdx = periodsResult.data.indexOf(period);
            await onProgress(
              eventPct,
              `Processing ${eventName} period ${periodIdx + 1}/${periodsResult.data.length} (fetching room-level data)...`,
              recordsProcessed
            );
          }

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

          // Build a map of location_id → location name from included resources
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

          // Track kids totals for this period to compute adult count
          let kidsTotal = 0;

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

            const category = mapLocationToCategory(rawLocationName, campus);
            if (category === null) continue; // Skip volunteer/team/folder locations

            if (category === "ADULT") {
              // RevStudents 5th & 6th under Jasper → count as adult attendance
              const adultKey = `${weekStartDate}|${campus}|${eventName}`;
              const existing = weeklyMap.get(adultKey);
              if (existing) {
                existing.headcount += totalCount;
                existing.regularCount += regularCount;
                existing.guestCount += guestCount;
                existing.volunteerCount += volunteerCount;
              } else {
                weeklyMap.set(adultKey, {
                  year, weekNumber, weekStartDate, campus,
                  subgroup: eventName,
                  headcount: totalCount,
                  regularCount, guestCount, volunteerCount,
                });
              }
              continue;
            }

            // This is a kids room — aggregate by category
            kidsTotal += totalCount;
            const kidsSubgroup = `Kids: ${campus} ${category}`;
            const key = `${weekStartDate}|${campus}|${kidsSubgroup}`;
            const existing = weeklyMap.get(key);
            if (existing) {
              existing.headcount += totalCount;
              existing.regularCount += regularCount;
              existing.guestCount += guestCount;
              existing.volunteerCount += volunteerCount;
            } else {
              weeklyMap.set(key, {
                year, weekNumber, weekStartDate, campus,
                subgroup: kidsSubgroup,
                headcount: totalCount,
                regularCount, guestCount, volunteerCount,
              });
            }
          }

          // Store the top-level event total as adult attendance
          // (total event headcount minus kids rooms = adults)
          const totalRegular = attrs.regular_count || 0;
          const totalGuest = attrs.guest_count || 0;
          const totalVolunteer = attrs.volunteer_count || 0;
          const totalCount = totalRegular + totalGuest + totalVolunteer;
          const adultCount = Math.max(0, totalCount - kidsTotal);

          if (adultCount > 0) {
            const adultKey = `${weekStartDate}|${campus}|${eventName}`;
            const existing = weeklyMap.get(adultKey);
            if (existing) {
              existing.headcount += adultCount;
              existing.regularCount += Math.max(0, totalRegular - kidsTotal);
              existing.guestCount += totalGuest;
              existing.volunteerCount += totalVolunteer;
            } else {
              weeklyMap.set(adultKey, {
                year, weekNumber, weekStartDate, campus,
                subgroup: eventName,
                headcount: adultCount,
                regularCount: Math.max(0, totalRegular - kidsTotal),
                guestCount: totalGuest,
                volunteerCount: totalVolunteer,
              });
            }
          }

          // Also store a "Kids" aggregate total for this campus/week
          if (kidsTotal > 0) {
            const kidsAggKey = `${weekStartDate}|${campus}|Kids`;
            const existing = weeklyMap.get(kidsAggKey);
            if (existing) {
              existing.headcount += kidsTotal;
            } else {
              weeklyMap.set(kidsAggKey, {
                year, weekNumber, weekStartDate, campus,
                subgroup: "Kids",
                headcount: kidsTotal,
                regularCount: kidsTotal,
                guestCount: 0,
                volunteerCount: 0,
              });
            }
          }

        } else {
          // -------------------------------------------------------
          // NON-MAIN EVENT: use event period totals as before
          // (RevStudents, YA Gathering, Parent Night, etc.)
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
              year, weekNumber, weekStartDate, campus,
              subgroup: eventName,
              headcount: totalCount,
              regularCount, guestCount, volunteerCount,
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
          if ((existingRows[0] as any).manualLock) {
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
          if ((existingRows[0] as any).manualLock) {
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
