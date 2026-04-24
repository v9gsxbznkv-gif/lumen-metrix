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
import { eq, and, gte, lte, sql } from "drizzle-orm";
import mysql from "mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { PcoClient } from "./client";
import { attendanceWeekly, givingWeekly, givingMonthly } from "../../drizzle/schema";
import { getDb } from "../db";
import type { SyncResult } from "./sync";

/**
 * Creates a brand-new dedicated MySQL connection for sync writes.
 * This bypasses the shared app connection pool which can get into a broken
 * state during long-running sync operations, causing writes to hang.
 * The caller is responsible for calling conn.end() when done.
 */
async function createFreshDb(): Promise<{ db: ReturnType<typeof drizzle>; end: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const conn = mysql.createConnection({
      uri: process.env.DATABASE_URL!,
      connectTimeout: 20000,
    });
    conn.connect((err) => {
      if (err) return reject(err);
      const db = drizzle(conn as any);
      resolve({
        db,
        end: () => new Promise<void>((res) => conn.end(() => res())),
      });
    });
  });
}

// ============================================================
// Date helpers
// ============================================================

/**
 * Get the Sunday that anchors the week for a given event timestamp.
 * PCO stores event times in UTC. Revolution services run Sunday evenings
 * (e.g. 7pm ET = 23:00 UTC), so we must convert to Eastern Time before
 * computing the week's Sunday to avoid off-by-one day errors.
 */
function getSunday(date: Date): Date {
  // Convert UTC timestamp to Eastern Time wall-clock date
  // Using Intl.DateTimeFormat to get the local date parts in ET
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const etYear = parseInt(etParts.find(p => p.type === 'year')!.value);
  const etMonth = parseInt(etParts.find(p => p.type === 'month')!.value) - 1;
  const etDay = parseInt(etParts.find(p => p.type === 'day')!.value);
  // Build a local midnight date using ET wall-clock values
  const d = new Date(etYear, etMonth, etDay, 0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  d.setDate(d.getDate() - day); // roll back to Sunday
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
 * the main Revolution Check-In events via named headcount categories.
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
 * Returns true if this is a main campus check-in event that uses
 * named headcount categories (1-Adults, 1-RevKids, etc.).
 * We drill into event_times → headcounts for these events.
 */
function isMainCheckInEvent(eventName: string): boolean {
  return (
    eventName === "Revolution Canton Check-In" ||
    eventName === "Revolution Jasper Check-In"
  );
}

// ============================================================
// Named headcount category mapping
// ============================================================

/**
 * Maps PCO attendance_type names to our internal subgroup categories.
 *
 * Canton:
 *   1-Adults       → "Adults"
 *   1-RevKids      → "Kids"
 *   2-FTG Adults   → "FTG Adults"
 *   2-FTG Kids     → "FTG Kids"
 *   6-Online       → "Online"
 *
 * Jasper:
 *   1-Adults       → "Adults"
 *   1-RS 5-6th     → "Adults"  (5th/6th grade counts as adult for Jasper)
 *   1-RevKids      → "Kids"
 *   2-FTG Adults   → "FTG Adults"
 *   2-FTG 5/6th    → "FTG Adults" (5th/6th FTG counts as FTG Adults)
 *   2-FTG Kids     → "FTG Kids"
 */
const HEADCOUNT_CATEGORY_MAP: Record<string, Record<string, string>> = {
  Canton: {
    "1-Adults":     "Adults",
    "1-RevKids":    "Kids",
    "2-FTG Adults": "FTG Adults",
    "2-FTG Kids":   "FTG Kids",
    "6-Online":     "Online",
  },
  Jasper: {
    "1-Adults":     "Adults",
    "1-RS 5-6th":   "Adults",   // 5th/6th grade → adult attendance
    "1-RevKids":    "Kids",
    "2-FTG Adults": "FTG Adults",
    "2-FTG 5/6th":  "FTG Adults", // 5th/6th FTG → FTG Adults
    "2-FTG Kids":   "FTG Kids",
  },
};

/** Cache attendance_type names to avoid repeated API calls */
const attTypeNameCache = new Map<string, string>();

async function getAttTypeName(client: PcoClient, attTypeId: string): Promise<string | null> {
  if (attTypeNameCache.has(attTypeId)) return attTypeNameCache.get(attTypeId)!;
  try {
    const resp = await client.get(`/check-ins/v2/attendance_types/${attTypeId}`);
    // resp.data is the PCO resource object: { id, type, attributes: { name, ... } }
    const resource = Array.isArray(resp.data) ? resp.data[0] : resp.data;
    const name: string = (resource as any)?.attributes?.name || "";
    attTypeNameCache.set(attTypeId, name);
    return name || null;
  } catch {
    return null;
  }
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

/** Default: start of 2026.
 * Pre-2026 data is sourced from spreadsheet imports already in the DB.
 * Fetching 3+ years of PCO event_periods causes 780+ API calls and TCP hangs.
 */
const DEFAULT_DATE_FROM = "2026-01-01";

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

    // Always filter to the 5 known recurring service events.
    // We never need to scan 300+ historical RSVP/one-off events regardless of date range.
    // These 5 events are the only source of weekly attendance data for the dashboard.
    const KEY_EVENTS = new Set([
      "Revolution Canton Check-In",
      "Revolution Jasper Check-In",
      "RevStudents | Canton Campus",
      "RevStudents | Jasper Campus",
      "YA Gathering",
    ]);

    const activeEvents = allActiveEvents.filter((e: any) => KEY_EVENTS.has(e.attributes?.name || ""));
    console.log(`[PCO Weekly Sync] Filtered to ${activeEvents.length} key events (skipped ${allActiveEvents.length - activeEvents.length} non-key events out of ${events.length} total)`);

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
          // MAIN CHECK-IN EVENT: drill into event_times → headcounts
          // using named attendance_type categories (1-Adults, 1-RevKids, etc.)
          // This uses the manually-entered headcounts, not check-in scan counts.
          // -------------------------------------------------------
          const periodId = (period as any).id;

          // Heartbeat progress update
          if (onProgress) {
            const periodIdx = periodsResult.data.indexOf(period);
            await onProgress(
              eventPct,
              `Processing ${eventName} period ${periodIdx + 1}/${periodsResult.data.length} (fetching headcounts)...`,
              recordsProcessed
            );
          }

          // Get all event_times for this period
          // Wrapped in Promise.race with 20s timeout — TCP stalls won't throw,
          // so we need a hard deadline per call.
          let eventTimesResult;
          try {
            eventTimesResult = await Promise.race([
              client.paginateAll(
                `/check-ins/v2/events/${eventId}/event_periods/${periodId}/event_times`,
                { per_page: 25 }
              ),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout fetching event_times for period ${periodId}`)), 20_000)
              ),
            ]);
          } catch (err: any) {
            console.warn(`[PCO Weekly Sync] Skipping event_times for ${eventName} period ${periodId}: ${err.message}`);
            continue;
          }

          // Accumulate headcounts by category across all service times
          // category → total headcount
          const categoryTotals = new Map<string, number>();
          const campusCategoryMap = HEADCOUNT_CATEGORY_MAP[campus] || {};

          for (const eventTime of eventTimesResult.data) {
            const etId = (eventTime as any).id;

            let headcountsResult;
            try {
              headcountsResult = await Promise.race([
                client.paginateAll(
                  `/check-ins/v2/event_times/${etId}/headcounts`,
                  { per_page: 25 }
                ),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error(`Timeout fetching headcounts for event_time ${etId}`)), 15_000)
                ),
              ]);
            } catch (err: any) {
              console.warn(`[PCO Weekly Sync] Skipping headcounts for event_time ${etId}: ${err.message}`);
              continue;
            }

            for (const hc of headcountsResult.data) {
              const total: number = (hc as any).attributes?.total || 0;
              if (total === 0) continue;

              const attTypeId: string | undefined = (hc as any).relationships?.attendance_type?.data?.id;
              if (!attTypeId) continue;

              const attTypeName = await getAttTypeName(client, attTypeId);
              if (!attTypeName) continue;

              const category = campusCategoryMap[attTypeName];
              if (!category) {
                console.log(`[PCO Weekly Sync] Unknown attendance_type "${attTypeName}" for ${campus} — skipping`);
                continue;
              }

              const existing = categoryTotals.get(category) || 0;
              categoryTotals.set(category, existing + total);
            }
          }

          // Write each category as a separate subgroup row
          for (const [category, total] of Array.from(categoryTotals.entries())) {
            if (total === 0) continue;

            // Use canonical subgroup names:
            // Adults → eventName (e.g. "Revolution Canton Check-In")
            // Kids   → "Kids"
            // FTG Adults → "FTG Adults"
            // FTG Kids   → "FTG Kids"
            // Online     → "Online"
            const subgroup = category === "Adults" ? eventName : category;
            const key = `${weekStartDate}|${campus}|${subgroup}`;
            const existing = weeklyMap.get(key);
            if (existing) {
              existing.headcount += total;
              existing.regularCount += total;
            } else {
              weeklyMap.set(key, {
                year, weekNumber, weekStartDate, campus,
                subgroup,
                headcount: total,
                regularCount: total,
                guestCount: 0,
                volunteerCount: 0,
              });
            }
          }

          // Log summary for this period
          if (categoryTotals.size > 0) {
            const summary = Array.from(categoryTotals.entries()).map(([k, v]) => `${k}=${v}`).join(', ');
            console.log(`[PCO Weekly Sync]   ${eventName} ${weekStartDate}: ${summary}`);
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

    // Step 2: Batch upsert into attendance_weekly using the shared app DB connection.
    // Uses raw SQL execute to avoid ORM overhead that can cause hangs on long-running connections.
    const rows = Array.from(weeklyMap.values());

    try {
      const writeDb = await getDb();
      if (!writeDb) throw new Error("DB not available for writes");

      // Fetch all locked rows in one query so we can exclude them from the batch
      const lockedRows = await writeDb
        .select({ weekStartDate: attendanceWeekly.weekStartDate, campus: attendanceWeekly.campus, subgroup: attendanceWeekly.subgroup })
        .from(attendanceWeekly)
        .where(eq(attendanceWeekly.manualLock, true));
      const lockedKeys = new Set(lockedRows.map(r => `${r.weekStartDate}|${r.campus}|${r.subgroup}`));

      const rowsToWrite = rows.filter(r => !lockedKeys.has(`${r.weekStartDate}|${r.campus}|${r.subgroup}`));
      console.log(`[PCO Weekly Sync] Writing ${rowsToWrite.length} rows (${rows.length - rowsToWrite.length} locked/skipped)`);

      if (onProgress) {
        await onProgress(57, `Saving ${rowsToWrite.length} attendance rows to database...`, recordsProcessed);
      }

      // Ping the DB connection before writing to ensure it's alive after the long PCO fetch.
      // The pool connection may have gone idle during the PCO API calls.
      try {
        await writeDb.execute(sql`SELECT 1`);
        console.log(`[PCO Weekly Sync] DB connection ping OK, proceeding with writes`);
      } catch (pingErr: any) {
        console.warn(`[PCO Weekly Sync] DB ping failed (${pingErr.message}), will attempt writes anyway`);
      }

      // Build a single INSERT ... ON DUPLICATE KEY UPDATE for all rows at once.
      // One DB round-trip per chunk instead of N individual queries.
      if (rowsToWrite.length > 0) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < rowsToWrite.length; i += CHUNK_SIZE) {
          const chunk = rowsToWrite.slice(i, i + CHUNK_SIZE);
          const insertPromise = writeDb
            .insert(attendanceWeekly)
            .values(chunk.map(row => ({
              year: row.year,
              weekNumber: row.weekNumber,
              weekStartDate: row.weekStartDate,
              campus: row.campus,
              subgroup: row.subgroup,
              headcount: row.headcount,
              regularCount: row.regularCount,
              guestCount: row.guestCount,
              volunteerCount: row.volunteerCount,
              source: "pco" as const,
            })))
            .onDuplicateKeyUpdate({
              set: {
                headcount: sql`VALUES(headcount)`,
                regularCount: sql`VALUES(regularCount)`,
                guestCount: sql`VALUES(guestCount)`,
                volunteerCount: sql`VALUES(volunteerCount)`,
                year: sql`VALUES(year)`,
                weekNumber: sql`VALUES(weekNumber)`,
                source: sql`VALUES(source)`,
              },
            });
          // 30s hard timeout per chunk — if DB stalls, skip and continue
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`DB write timeout chunk ${i}`)), 30000)
          );
          try {
            await Promise.race([insertPromise, timeoutPromise]);
            recordsCreated += chunk.length;
          } catch (chunkErr: any) {
            console.warn(`[PCO Weekly Sync] Chunk ${i} write failed/timed out: ${chunkErr.message}`);
          }
        }
      }
    } catch (writeErr: any) {
      console.error(`[PCO Weekly Sync] DB write error: ${writeErr.message}`);
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
  _client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, message: string, processed: number) => Promise<void>
): Promise<SyncResult> {
  // NOTE: This function no longer calls the PCO Giving API.
  // The PCO /giving/v2/donations endpoint causes TCP hangs that no timeout can reliably fix.
  // Instead, we aggregate giving_weekly rows (already in DB from spreadsheet imports + manual entry)
  // into giving_monthly totals. This is instant and always reliable.
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  const effectiveDateFrom = dateFrom || DEFAULT_DATE_FROM;
  const effectiveDateTo = dateTo || formatDate(new Date());

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log(`[Weekly Giving] Aggregating giving_weekly → giving_monthly (${effectiveDateFrom} → ${effectiveDateTo})...`);

    if (onProgress) {
      await onProgress(62, "Aggregating weekly giving into monthly totals...", 0);
    }

    // Read giving_weekly rows for the date range
    const weeklyRows = await db
      .select()
      .from(givingWeekly)
      .where(
        and(
          gte(givingWeekly.weekStartDate, effectiveDateFrom),
          lte(givingWeekly.weekStartDate, effectiveDateTo)
        )
      );

    console.log(`[Weekly Giving] Found ${weeklyRows.length} weekly giving rows to aggregate`);
    recordsProcessed = weeklyRows.length;

    // Aggregate by year/month/campus
    const monthlyMap = new Map<string, { year: number; month: number; campus: string; total: number; general: number; designated: number; weekCount: number }>();

    for (const row of weeklyRows) {
      const date = new Date(row.weekStartDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const campus = row.campus;
      const key = `${year}-${month}-${campus}`;

      const existing = monthlyMap.get(key);
      const total = parseFloat(row.total || "0");
      const general = parseFloat(row.general || "0");
      const designated = parseFloat(row.designated || "0");

      if (existing) {
        existing.total += total;
        existing.general += general;
        existing.designated += designated;
        existing.weekCount++;
      } else {
        monthlyMap.set(key, { year, month, campus, total, general, designated, weekCount: 1 });
      }
    }

    if (onProgress) {
      await onProgress(88, `Writing ${monthlyMap.size} monthly giving totals...`, recordsProcessed);
    }

    // Upsert into giving_monthly
    for (const [, agg] of Array.from(monthlyMap.entries())) {
      try {
        // Try insert first
        await db.insert(givingMonthly).values({
          year: agg.year,
          month: agg.month,
          campus: agg.campus,
          subgroup: "Tithes and Offerings",
          total: String(agg.general.toFixed(2)),
          source: "aggregated",
        });
        recordsCreated++;
      } catch (dupErr: any) {
        if (dupErr.code === "ER_DUP_ENTRY") {
          // Update existing
          await db
            .update(givingMonthly)
            .set({ total: String(agg.general.toFixed(2)), source: "aggregated" })
            .where(
              and(
                eq(givingMonthly.year, agg.year),
                eq(givingMonthly.month, agg.month),
                eq(givingMonthly.campus, agg.campus),
                eq(givingMonthly.subgroup, "Tithes and Offerings")
              )
            );
          recordsUpdated++;
        } else {
          console.warn(`[Weekly Giving] Error upserting monthly giving:`, dupErr.message);
        }
      }

      if (agg.designated > 0) {
        try {
          await db.insert(givingMonthly).values({
            year: agg.year,
            month: agg.month,
            campus: agg.campus,
            subgroup: "Designated",
            total: String(agg.designated.toFixed(2)),
            source: "aggregated",
          });
          recordsCreated++;
        } catch (dupErr: any) {
          if (dupErr.code === "ER_DUP_ENTRY") {
            await db
              .update(givingMonthly)
              .set({ total: String(agg.designated.toFixed(2)), source: "aggregated" })
              .where(
                and(
                  eq(givingMonthly.year, agg.year),
                  eq(givingMonthly.month, agg.month),
                  eq(givingMonthly.campus, agg.campus),
                  eq(givingMonthly.subgroup, "Designated")
                )
              );
            recordsUpdated++;
          }
        }
      }
    }

    console.log(`[Weekly Giving] Aggregation complete: ${recordsProcessed} weekly rows → ${recordsCreated} created, ${recordsUpdated} updated monthly rows`);

    return {
      syncType: "weekly_giving",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[Weekly Giving] Aggregation failed:", error.message);
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
