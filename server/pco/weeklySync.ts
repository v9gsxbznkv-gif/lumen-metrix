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
import { attendanceWeekly, givingWeekly, givingMonthly, syncJobs, servingWeekly, nextStepsWeekly, nextStepsMonthly } from "../../drizzle/schema";
import { getDb } from "../db";
import type { SyncResult } from "./sync";
import { notifyOwner } from "../_core/notification";

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
 * Get the week-start date for a given event timestamp.
 *
 * Week definition (Revolution Church year):
 *   Week 1: Jan 1 → first Sunday of the year (short week)
 *   Week 2+: Monday → Sunday (standard 7-day weeks)
 *
 * PCO stores event times in UTC; Revolution services run on Sundays and
 * Wednesdays in Eastern Time, so we convert to ET first to avoid off-by-one
 * day errors.
 *
 * IMPORTANT: All internal arithmetic uses Date.UTC() to avoid DST-induced
 * off-by-one errors. The returned Date is a UTC-midnight date representing
 * the calendar day (use formatDate() to extract YYYY-MM-DD).
 *
 * Returns: a Date representing the week-start (Jan 1 for week 1, Monday for weeks 2+)
 */
function getWeekStart(date: Date): Date {
  // Convert UTC timestamp to Eastern Time wall-clock date
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const etYear = parseInt(etParts.find(p => p.type === 'year')!.value);
  const etMonth = parseInt(etParts.find(p => p.type === 'month')!.value) - 1;
  const etDay = parseInt(etParts.find(p => p.type === 'day')!.value);
  // Build a UTC midnight date using ET wall-clock values (avoids DST issues)
  const d = new Date(Date.UTC(etYear, etMonth, etDay));

  // Find the first Sunday of the year (end of week 1)
  const jan1 = new Date(Date.UTC(etYear, 0, 1));
  const jan1Day = jan1.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const firstSunday = new Date(jan1);
  if (jan1Day === 0) {
    // Jan 1 is already Sunday — week 1 is just Jan 1
    // (no-op, firstSunday = Jan 1)
  } else {
    // First Sunday = Jan 1 + (7 - jan1Day) days
    firstSunday.setUTCDate(1 + (7 - jan1Day));
  }

  // If date is within Jan 1 → first Sunday: it's week 1, start = Jan 1
  if (d.getTime() <= firstSunday.getTime()) {
    return jan1;
  }

  // Otherwise: standard Mon-Sun weeks starting the Monday after firstSunday
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - daysToMonday);
  return d;
}

/** Legacy alias — many call sites use this name */
function getSunday(date: Date): Date {
  return getWeekStart(date);
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get the week number for a given date using Revolution Church year rules:
 *   Week 1: Jan 1 → first Sunday of the year
 *   Week 2: first Monday after first Sunday → following Sunday
 *   etc.
 *
 * The year is always the calendar year (not ISO week-year).
 *
 * IMPORTANT: Uses UTC methods exclusively to avoid DST-induced off-by-one
 * errors when dividing millisecond differences by 86400000.
 */
function getISOWeekNumber(date: Date): number {
  // Normalize to UTC midnight of the same calendar day
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const jan1Day = jan1.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // First Sunday of the year
  let firstSunday: Date;
  if (jan1Day === 0) {
    firstSunday = new Date(jan1);
  } else {
    firstSunday = new Date(Date.UTC(year, 0, 1 + (7 - jan1Day)));
  }

  // If date is within Jan 1 → first Sunday: week 1
  if (d.getTime() <= firstSunday.getTime()) {
    return 1;
  }

  // Week 2 starts the Monday after firstSunday
  const week2Start = new Date(firstSunday);
  week2Start.setUTCDate(firstSunday.getUTCDate() + 1); // Monday after first Sunday

  const daysSinceWeek2 = Math.floor((d.getTime() - week2Start.getTime()) / 86400000);
  return 2 + Math.floor(daysSinceWeek2 / 7);
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
    eventName === "Revolution Jasper Check-In" ||
    eventName === "RevStudents | Canton Campus" ||
    eventName === "RevStudents | Jasper Campus" ||
    eventName === "YA Gathering"
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
    "1-Adults":       "Adults",
    "1-RevKids":      "Kids",
    "2-FTG Adults":   "FTG Adults",
    "2-FTG Kids":     "FTG Kids",
    "6-Online":       "Online",
    // Salvations headcount types (actual PCO names)
    "3-Salv. A":      "Salvations",
    "3-Salv. K":      "Salvations",
    "Salvations":     "Salvations",
    "3-Salvations":   "Salvations",
    // Stewardship headcount type
    "4-Stewards":     "Stewardship",
    // Baptisms headcount types (actual PCO names)
    "5-Baptism A":    "Baptisms",
    "5-Baptism K":    "Baptisms",
    "5-Baptism S":    "Baptisms",
    "Baptisms":       "Baptisms",
    "3-Baptisms":     "Baptisms",
  },
  Jasper: {
    "1-Adults":       "Adults",
    "1-RS 5-6th":     "Adults",   // 5th/6th grade → adult attendance
    "1-RevKids":      "Kids",
    "2-FTG Adults":   "FTG Adults",
    "2-FTG 5/6th":    "FTG Adults", // 5th/6th FTG → FTG Adults
    "2-FTG Kids":     "FTG Kids",
    // Salvations headcount types (actual PCO names)
    "3-Salv. A":      "Salvations",
    "3-Salv. K":      "Salvations",
    "Salvations":     "Salvations",
    "3-Salvations":   "Salvations",
    // Stewardship headcount type
    "4-Stewards":     "Stewardship",
    // Baptisms headcount types (actual PCO names)
    "5-Baptism A":    "Baptisms",
    "5-Baptism K":    "Baptisms",
    "5-Baptism S":    "Baptisms",
    "Baptisms":       "Baptisms",
    "3-Baptisms":     "Baptisms",
  },
  // YA Gathering uses manual headcount categories
  "YA Gathering": {
    "Attendance":    "YA Gathering",
    "1-Adults":      "YA Gathering",
    "Young Adults":  "YA Gathering",
    "YA":            "YA Gathering",
    "First Timers":  "YA FTG",
    "FTG":           "YA FTG",
    "2-FTG":         "YA FTG",
    "Salvations":    "YA Salvations",
    "3-Salvations":  "YA Salvations",
  },
  // RevStudents events use custom headcount categories (not attendance_types)
  // These map PCO custom headcount names → our internal subgroup names
  "RevStudents | Canton Campus": {
    "Attendance":    "RevStudents Attendance",
    "HS Total":      "RevStudents HS",
    "MS Total":      "RevStudents MS",
    "First Timers":  "RevStudents FTG",
    "Salvations":    "RevStudents Salvations",
  },
  "RevStudents | Jasper Campus": {
    "Attendance":    "RevStudents Attendance",
    "HS Total":      "RevStudents HS",
    "MS Total":      "RevStudents MS",
    "First Timers":  "RevStudents FTG",
    "Salvations":    "RevStudents Salvations",
  },
};

/** Cache attendance_type names to avoid repeated API calls */
const attTypeNameCache = new Map<string, string>();
async function getAttTypeName(client: PcoClient, attTypeId: string): Promise<string | null> {
  if (attTypeNameCache.has(attTypeId)) return attTypeNameCache.get(attTypeId)!;
  try {
    const resp = await Promise.race([
      client.get(`/check-ins/v2/attendance_types/${attTypeId}`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching att_type name for ${attTypeId}`)), 10_000)
      ),
    ]);
    // resp.data is the PCO resource object: { id, type, attributes: { name, ... } }
    const resource = Array.isArray(resp.data) ? resp.data[0] : resp.data;
    const name: string = (resource as any)?.attributes?.name || "";
    attTypeNameCache.set(attTypeId, name);
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Cache of event attendance_types: eventId → Array<{ id, name }>
 * Populated once per event to avoid repeated API calls across periods.
 */
const eventAttTypesCache = new Map<string, Array<{ id: string; name: string }>>();

async function getEventAttendanceTypes(
  client: PcoClient,
  eventId: string
): Promise<Array<{ id: string; name: string }>> {
  if (eventAttTypesCache.has(eventId)) return eventAttTypesCache.get(eventId)!;
  try {
    const resp = await Promise.race([
      client.paginateAll(
        `/check-ins/v2/events/${eventId}/attendance_types`,
        { per_page: 25 }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching attendance_types for event ${eventId}`)), 15_000)
      ),
    ]);
    const types = (resp.data as any[]).map((t: any) => ({
      id: t.id as string,
      name: (t.attributes?.name || '') as string,
    }));
    eventAttTypesCache.set(eventId, types);
    return types;
  } catch {
     return [];
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
  "Room 3 - Pre-K": "Pre-K",
  // Thursday RevKids Elementary
  "Treehouse - K-5th": "Elementary",
  // Sunday RevKids Babies (under Sunday RevKids Preschool > Babies)
  "The Nest": "Babies",
  "Owls": "Babies",
  "Turtles": "Babies",
  // Sunday RevKids Toddlers (Young Toddlers + Older Toddlers)
  "Bears": "Toddlers",
  "Squirrels": "Toddlers",
  "Moose": "Toddlers",
  "Porcupines": "Toddlers",
  "Woodpeckers": "Toddlers",
  // Sunday RevKids Pre-K
  "Room 1": "Pre-K",
  "Room 2": "Pre-K",
  "Room 3": "Pre-K",
  "Room 4": "Pre-K",
  // Sunday RevKids Nursery (Jasper-style names appearing in Canton)
  "Fox": "Nursery",
  "Raccoons": "Nursery",
  // Sunday RevKids Elementary
  "The Campground": "Campground",
  "The Treehouse": "Treehouse",
  "The Cove": "Cove",
  "ReRuns": "Elementary",
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
  if (lower === "young toddlers") return null;
  if (lower === "babies") return null;
  if (lower === "sunday revkids preschool") return null;
  if (lower === "sunday revkids elementary") return null;
  if (lower === "revkids welcome team") return null;
  if (lower === "revstudents 5th & 6th") return null;
  if (lower === "old locations (do not delete)") return null;
  if (lower === "old locations - do not use or delete!") return null;
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
  onProgress?: (pct: number, message: string, processed: number) => Promise<void>,
  jobId?: string
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
        const periodsPromise = client.paginateAll(
          `/check-ins/v2/events/${eventId}/event_periods`,
          periodParams
        );
        const periodsTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout fetching event_periods for ${eventName} after 90s`)), 90_000)
        );
        periodsResult = await Promise.race([periodsPromise, periodsTimeout]);
      } catch (err: any) {
        console.warn(`[PCO Weekly Sync] Skipping event ${eventName}: ${err.message}`);
        continue;
      }

      console.log(`[PCO Weekly Sync]   Got ${periodsResult.data.length} event periods for ${eventName}`);

      const campus = mapEventToCampus(eventName);
      const isMainCheckin = isMainCheckInEvent(eventName);
      const isRevStudentsEvent = eventName.startsWith('RevStudents');

      // PRE-FETCH: For main check-in events (not RevStudents), fetch all headcounts
      // per attendance_type once per event and index by event_time ID.
      // This catches FTG Adults/Kids headcounts that may not appear in the
      // event_times/{id}/headcounts endpoint (e.g. entered at the period level).
      // Map: attTypeName → Map<eventTimeId, total>
      const attTypeHcByEventTime = new Map<string, Map<string, number>>();
      if (isMainCheckin && !isRevStudentsEvent) {
        const campusCategoryMapForPrefetch = HEADCOUNT_CATEGORY_MAP[eventName] || HEADCOUNT_CATEGORY_MAP[campus] || {};
        const attTypes = await getEventAttendanceTypes(client, eventId);
        for (const attType of attTypes) {
          if (!campusCategoryMapForPrefetch[attType.name]) continue; // not in our map, skip
          try {
            const hcsResp = await Promise.race([
              client.paginateAll(
                `/check-ins/v2/events/${eventId}/attendance_types/${attType.id}/headcounts`,
                { per_page: 100 }
              ),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout pre-fetching headcounts for ${attType.name}`)), 90_000)
              ),
            ]);
            const byEt = new Map<string, number>();
            for (const hc of hcsResp.data as any[]) {
              const total: number = (hc as any).attributes?.total || 0;
              if (total === 0) continue;
              const etId: string | undefined = (hc as any).relationships?.event_time?.data?.id;
              if (!etId) continue;
              byEt.set(etId, (byEt.get(etId) || 0) + total);
            }
            attTypeHcByEventTime.set(attType.name, byEt);
            console.log(`[PCO Weekly Sync] Pre-fetched ${attType.name}: ${byEt.size} event_times with data`);
          } catch (err: any) {
            console.warn(`[PCO Weekly Sync] Pre-fetch failed for ${attType.name}: ${err.message}`);
          }
        }
      }

      for (const period of periodsResult.data) {
        recordsProcessed++;
        const attrs = (period as any).attributes;
        const startsAt = attrs?.starts_at;
        if (!startsAt) continue;

        const date = new Date(startsAt);
        const sunday = getSunday(date);
        const weekStartDate = formatDate(sunday);
        const year = sunday.getUTCFullYear();
        const weekNumber = getISOWeekNumber(sunday);

        if (isMainCheckin) {
          // -------------------------------------------------------
          // MAIN CHECK-IN EVENT: drill into event_times → headcounts
          // using named attendance_type categories (1-Adults, 1-RevKids, etc.)
          // This uses the manually-entered headcounts, not check-in scan counts.
          // -------------------------------------------------------
          const periodId = (period as any).id;
          const periodIdx = periodsResult.data.indexOf(period);

          // Heartbeat progress update
          if (onProgress) {
            await onProgress(
              eventPct,
              `Processing ${eventName} period ${periodIdx + 1}/${periodsResult.data.length} (fetching headcounts)...`,
              recordsProcessed
            );
          }

          // -------------------------------------------------------
          // PRE-FETCH FIRST STRATEGY: Use pre-fetched attendance_type
          // headcounts as the PRIMARY data source. This avoids hundreds
          // of per-event_time API calls that cause TCP stalls and timeouts.
          //
          // The pre-fetch (done once per event above) already has ALL
          // headcounts indexed by event_time ID. We just need to know
          // which event_time IDs belong to this period.
          // -------------------------------------------------------
          const categoryTotals = new Map<string, number>();
          const campusCategoryMap = HEADCOUNT_CATEGORY_MAP[eventName] || HEADCOUNT_CATEGORY_MAP[campus] || {};

          // Get event_times for this period (1 API call — just to get IDs)
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

          const periodEventTimeIds = new Set(
            (eventTimesResult.data as any[]).map((et: any) => et.id as string)
          );

          // FIRST: Try to populate ALL categories from pre-fetched data (zero API calls)
          if (attTypeHcByEventTime.size > 0) {
            for (const [attTypeName, byEt] of Array.from(attTypeHcByEventTime.entries())) {
              const category = campusCategoryMap[attTypeName];
              if (!category) continue;

              let periodTotal = 0;
              for (const etId of Array.from(periodEventTimeIds)) {
                periodTotal += byEt.get(etId) || 0;
              }

              if (periodTotal > 0) {
                categoryTotals.set(category, (categoryTotals.get(category) || 0) + periodTotal);
              }
            }
          }

          // FALLBACK: Check which categories are MISSING from the pre-fetch.
          // The pre-fetch may have data for Adults/Kids but NOT for Online
          // (because Online's event_time IDs don't match this period).
          // Instead of only falling back when ALL categories are empty,
          // we drill down for any MISSING categories individually.
          const expectedCategories = new Set(Object.values(campusCategoryMap));
          const missingCategories = new Set<string>();
          for (const cat of Array.from(expectedCategories)) {
            if (!categoryTotals.has(cat)) {
              missingCategories.add(cat);
            }
          }

          if (categoryTotals.size === 0) {
            // FULL fallback: no pre-fetch data matched at all
            console.log(`[PCO Weekly Sync] No pre-fetch match for ${eventName} period ${periodIdx + 1} (${weekStartDate}) — falling back to per-event_time drill-down`);
            const periodStartTime = Date.now();
            const PERIOD_TIMEOUT_MS = 60_000;

            for (const eventTime of eventTimesResult.data) {
              if (Date.now() - periodStartTime > PERIOD_TIMEOUT_MS) {
                console.warn(`[PCO Weekly Sync] Period ${periodId} exceeded ${PERIOD_TIMEOUT_MS / 1000}s timeout — skipping remaining event_times`);
                break;
              }

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
                const attTypeId: string | undefined = (hc as any).relationships?.attendance_type?.data?.id;
                const attTypeName = attTypeId ? await getAttTypeName(client, attTypeId) : null;
                if (total === 0 || !attTypeId || !attTypeName) continue;

                const category = campusCategoryMap[attTypeName];
                if (!category) {
                  console.log(`[PCO Weekly Sync] Unknown attendance_type "${attTypeName}" for ${campus} — skipping`);
                  continue;
                }
                categoryTotals.set(category, (categoryTotals.get(category) || 0) + total);
              }
            }
          } else if (missingCategories.size > 0) {
            // PARTIAL fallback: some categories got data from pre-fetch but others didn't.
            // Drill down per-event_time but ONLY collect the missing categories.
            console.log(`[PCO Weekly Sync] Partial pre-fetch for ${eventName} period ${periodIdx + 1} (${weekStartDate}) — drilling down for missing: ${Array.from(missingCategories).join(', ')}`);
            const periodStartTime = Date.now();
            const PERIOD_TIMEOUT_MS = 60_000;

            for (const eventTime of eventTimesResult.data) {
              if (Date.now() - periodStartTime > PERIOD_TIMEOUT_MS) {
                console.warn(`[PCO Weekly Sync] Period ${periodId} exceeded ${PERIOD_TIMEOUT_MS / 1000}s timeout — skipping remaining event_times`);
                break;
              }

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
                const attTypeId: string | undefined = (hc as any).relationships?.attendance_type?.data?.id;
                const attTypeName = attTypeId ? await getAttTypeName(client, attTypeId) : null;
                if (total === 0 || !attTypeId || !attTypeName) continue;

                const category = campusCategoryMap[attTypeName];
                if (!category || !missingCategories.has(category)) continue; // only collect missing
                categoryTotals.set(category, (categoryTotals.get(category) || 0) + total);
              }
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
            // RevStudents categories ("RevStudents HS", "RevStudents MS", etc.) pass through as-is
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

          // -------------------------------------------------------
          // ROOM-LEVEL KIDS BREAKDOWN: For Canton/Jasper check-in events,
          // fetch location_event_times to get per-room check-in counts.
          // These are scan-based counts (not manual headcounts) and are
          // stored as "Kids: {campus} {room}" subgroups for the breakdown
          // display. The aggregate "Kids" row from headcounts is kept
          // separately for total attendance calculations.
          // -------------------------------------------------------
          const isCampusCheckin = (
            eventName === "Revolution Canton Check-In" ||
            eventName === "Revolution Jasper Check-In"
          );
          if (isCampusCheckin) {
            const roomTotals = new Map<string, number>();
            let volunteerCheckinCount = 0; // Track volunteer check-ins from check-in stations
            for (const eventTime of eventTimesResult.data) {
              const etId = (eventTime as any).id;
              try {
                const locResult = await Promise.race([
                  client.paginateAll(
                    `/check-ins/v2/event_times/${etId}/location_event_times`,
                    { per_page: 100, include: "location" }
                  ),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout fetching location_event_times for ${etId}`)), 15_000)
                  ),
                ]);

                // Build a location ID → name map from included resources
                const locationNames = new Map<string, string>();
                if (locResult.included) {
                  for (const inc of locResult.included as any[]) {
                    if (inc.type === "Location" && inc.attributes?.name) {
                      locationNames.set(inc.id, inc.attributes.name);
                    }
                  }
                }

                for (const let_ of locResult.data as any[]) {
                  const regular = let_.attributes?.regular_count || 0;
                  const guest = let_.attributes?.guest_count || 0;
                  const volunteer = let_.attributes?.volunteer_count || 0;
                  const attendeeTotal = regular + guest; // Non-volunteer attendees

                  // Accumulate volunteer_count from ALL locations
                  // (volunteers check in at their assigned room, not a separate "volunteer" location)
                  volunteerCheckinCount += volunteer;

                  // Get location name from included data or relationship
                  const locId = let_.relationships?.location?.data?.id;
                  const locName = locId ? locationNames.get(locId) : null;
                  if (!locName) continue;

                  // Check if this is a volunteer-specific check-in location
                  const trimmedName = locName.trim();
                  const isVolMatch = VOLUNTEER_LOCATIONS.has(trimmedName) || trimmedName.toLowerCase() === "team member";

                  if (isVolMatch) {
                    // For dedicated volunteer locations, also count regular+guest as volunteer check-ins
                    // (these are people checking in at a volunteer-only station)
                    volunteerCheckinCount += attendeeTotal;
                    continue; // Don't add to room totals
                  }

                  if (attendeeTotal === 0) continue;
                  const total = attendeeTotal; // For room totals, only count non-volunteer attendees

                  const category = mapLocationToCategory(locName, campus);
                  if (!category || category === "ADULT") continue; // skip adults, unknown

                  roomTotals.set(category, (roomTotals.get(category) || 0) + total);
                }
              } catch (err: any) {
                console.warn(`[PCO Weekly Sync] Skipping location_event_times for event_time ${etId}: ${err.message}`);
              }
            }

            // Write volunteer check-in count as a separate "Volunteer Check-Ins" subgroup
            if (volunteerCheckinCount > 0) {
              const volKey = `${weekStartDate}|${campus}|Volunteer Check-Ins`;
              const existingVol = weeklyMap.get(volKey);
              if (existingVol) {
                existingVol.headcount += volunteerCheckinCount;
                existingVol.volunteerCount += volunteerCheckinCount;
              } else {
                weeklyMap.set(volKey, {
                  year, weekNumber, weekStartDate, campus,
                  subgroup: "Volunteer Check-Ins",
                  headcount: volunteerCheckinCount,
                  regularCount: 0,
                  guestCount: 0,
                  volunteerCount: volunteerCheckinCount,
                });
              }
              console.log(`[PCO Weekly Sync]   ${eventName} ${weekStartDate} volunteer check-ins: ${volunteerCheckinCount}`);
            }

            // Write room-level rows to weeklyMap
            for (const [room, total] of Array.from(roomTotals.entries())) {
              if (total === 0) continue;
              const subgroup = `Kids: ${campus} ${room}`;
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

            if (roomTotals.size > 0) {
              const roomSummary = Array.from(roomTotals.entries()).map(([k, v]) => `${k}=${v}`).join(', ');
              console.log(`[PCO Weekly Sync]   ${eventName} ${weekStartDate} rooms: ${roomSummary}`);
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
      await onProgress(56, `Fetched ${weeklyMap.size} weekly attendance rows from PCO — queuing DB write...`, recordsProcessed);
    }

    // Step 2: Write attendance rows to the database.
    // ALWAYS write directly to DB using a fresh connection.
    // The old rawData blob approach failed because getDb() pool is dead after long PCO fetch
    // (TiDB idle-connection drop). Fresh connection avoids this entirely.
    const rows = Array.from(weeklyMap.values());
    recordsCreated = rows.length;
    console.log(`[PCO Weekly Sync] ${rows.length} attendance rows ready to write (direct DB path)...`);

    const { db: freshDb, end: endConn } = await createFreshDb();
    try {
      // Fetch locked rows to skip them
      const lockedRows = await freshDb
        .select({ year: attendanceWeekly.year, weekNumber: attendanceWeekly.weekNumber, campus: attendanceWeekly.campus, subgroup: attendanceWeekly.subgroup })
        .from(attendanceWeekly)
        .where(eq(attendanceWeekly.manualLock, true));
      const lockedSet = new Set(
        lockedRows.map((r) => `${r.year}|${r.weekNumber}|${r.campus}|${r.subgroup}`)
      );
      const rowsToWrite = rows.filter(
        (r: any) => !lockedSet.has(`${r.year}|${r.weekNumber}|${r.campus}|${r.subgroup}`)
      );
      console.log(`[PCO Weekly Sync] ${lockedRows.length} locked rows skipped, writing ${rowsToWrite.length} rows...`);

      // CLEAR STALE DATA: Delete existing PCO-sourced rows for weeks in the sync range
      // that are NOT in the new data set. This removes ghost data left by the DST bug
      // (e.g., Online headcount incorrectly assigned to week 19 from week 20's data).
      const weeksInNewData = new Set(rowsToWrite.map((r: any) => `${r.year}|${r.weekNumber}`));
      const newDataKeys = new Set(rowsToWrite.map((r: any) => `${r.year}|${r.weekNumber}|${r.campus}|${r.subgroup}`));
      if (weeksInNewData.size > 0) {
        // Get all existing rows for the same weeks that are PCO-sourced and not locked
        const weekConditions = Array.from(weeksInNewData).map(w => {
          const [y, wn] = w.split('|');
          return { year: parseInt(y), weekNumber: parseInt(wn) };
        });
        // Build a query to find stale rows
        let staleDeleted = 0;
        for (const { year: wy, weekNumber: wn } of weekConditions) {
          const existingRows = await freshDb
            .select({ id: attendanceWeekly.id, year: attendanceWeekly.year, weekNumber: attendanceWeekly.weekNumber, campus: attendanceWeekly.campus, subgroup: attendanceWeekly.subgroup })
            .from(attendanceWeekly)
            .where(
              and(
                eq(attendanceWeekly.year, wy),
                eq(attendanceWeekly.weekNumber, wn),
                eq(attendanceWeekly.source, 'pco')
              )
            );
          for (const row of existingRows) {
            const key = `${row.year}|${row.weekNumber}|${row.campus}|${row.subgroup}`;
            if (lockedSet.has(key)) continue; // don't delete locked rows
            if (!newDataKeys.has(key)) {
              // This row exists in DB but NOT in new sync data → stale, delete it
              await freshDb.delete(attendanceWeekly).where(eq(attendanceWeekly.id, row.id));
              staleDeleted++;
            }
          }
        }
        if (staleDeleted > 0) {
          console.log(`[PCO Weekly Sync] Cleared ${staleDeleted} stale rows (no longer in PCO data)`);
        }
      }

      const CHUNK = 50;
      let written = 0;
      for (let i = 0; i < rowsToWrite.length; i += CHUNK) {
        const chunk = rowsToWrite.slice(i, i + CHUNK);
        if (!chunk.length) continue;
        await freshDb
          .insert(attendanceWeekly)
          .values(chunk.map((r: any) => ({
            year: r.year,
            weekNumber: r.weekNumber,
            weekStartDate: r.weekStartDate,
            campus: r.campus,
            subgroup: r.subgroup,
            headcount: r.headcount,
            regularCount: r.regularCount ?? 0,
            guestCount: r.guestCount ?? 0,
            volunteerCount: r.volunteerCount ?? 0,
            source: "pco",
          })))
          .onDuplicateKeyUpdate({
            set: {
              headcount: sql`VALUES(headcount)`,
              regularCount: sql`VALUES(regularCount)`,
              guestCount: sql`VALUES(guestCount)`,
              volunteerCount: sql`VALUES(volunteerCount)`,
              source: sql`VALUES(source)`,
            },
          });
        written += chunk.length;
      }
      recordsCreated = written;
      console.log(`[PCO Weekly Sync] Direct DB write complete: ${written} rows`);
    } catch (writeErr: any) {
      console.error(`[PCO Weekly Sync] Direct DB write failed: ${writeErr.message}`);
    } finally {
      await endConn();
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
 * Map PCO fund name → campus.
 * Actual PCO fund names (April 2026):
 *   canton-campus → Canton (General)
 *   jasper-campus → Jasper (General)
 *   multiply → All Campuses (Designated)
 *   student-camp-scholarship → All Campuses (Designated)
 *   revkids → All Campuses (Designated)
 *   give-a-kid-a-chance → All Campuses (Designated)
 */
function mapFundToCampus(fundName: string): string {
  const name = fundName.toLowerCase().replace(/[\s_-]+/g, "-");
  if (name.includes("canton")) return "Canton";
  if (name.includes("jasper")) return "Jasper";
  // All other funds (multiply, revkids, student-camp-scholarship, give-a-kid-a-chance) → combined
  return "All Campuses";
}

/**
 * Determine if a fund is "general" (tithes/offerings) vs "designated" (special purpose).
 * Actual PCO fund names:
 *   General: canton-campus, jasper-campus (campus tithes/offerings)
 *   Designated: multiply, student-camp-scholarship, revkids, give-a-kid-a-chance
 */
function isGeneralFund(fundName: string): boolean {
  const name = fundName.toLowerCase().replace(/[\s_-]+/g, "-");
  // Only campus funds are "general" — everything else is designated
  if (name.includes("canton-campus") || name.includes("jasper-campus")) return true;
  // Explicit designated funds
  return false;
}

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

    console.log(`[Weekly Giving] Starting PCO giving sync (${effectiveDateFrom} → ${effectiveDateTo})...`);

    if (onProgress) {
      await onProgress(5, "Fetching PCO fund list...", 0);
    }

    // Step 1: Fetch all funds to build fund_id → { campus, isGeneral } map
    const fundMap = new Map<string, { campus: string; isGeneral: boolean; name: string }>();
    try {
      const fundsResp = await client.paginateAll("/giving/v2/funds", { per_page: 100 });
      for (const fund of fundsResp.data as any[]) {
        const fundId = fund.id as string;
        const fundName: string = fund.attributes?.name || "";
        fundMap.set(fundId, {
          campus: mapFundToCampus(fundName),
          isGeneral: isGeneralFund(fundName),
          name: fundName,
        });
      }
      console.log(`[Weekly Giving] Loaded ${fundMap.size} funds from PCO:`);
      for (const [fid, finfo] of Array.from(fundMap.entries())) {
        console.log(`  Fund id=${fid} name="${finfo.name}" → campus="${finfo.campus}" isGeneral=${finfo.isGeneral}`);
      }
    } catch (fundErr: any) {
      console.warn(`[Weekly Giving] Failed to fetch funds: ${fundErr.message}. Will attribute all donations to 'All Campuses'.`);
    }

    if (onProgress) {
      await onProgress(10, "Fetching donations from PCO...", 0);
    }

    // Step 2: Fetch all donations with designations in the date range
    // Process in weekly chunks to avoid TCP hangs from large responses
    const weeklyAgg = new Map<string, { year: number; weekNumber: number; weekStartDate: string; campus: string; total: number; general: number; designated: number; donationCount: number }>();
    // Per-fund tracking for debugging
    const fundTotals = new Map<string, number>();
    let skippedDesignations = 0;
    let noDesignationDonations = 0;
    let skippedNonSucceeded = 0;

    // Generate list of weekly chunks
    const chunks: Array<{ from: string; to: string }> = [];
    let chunkStart = new Date(effectiveDateFrom);
    const endDate = new Date(effectiveDateTo);
    while (chunkStart <= endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + 6); // 7-day window
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
      chunks.push({
        from: formatDate(chunkStart),
        to: formatDate(chunkEnd),
      });
      chunkStart.setDate(chunkStart.getDate() + 7);
    }

    console.log(`[Weekly Giving] Processing ${chunks.length} weekly chunks...`);

    const CHUNK_TIMEOUT_MS = 60_000; // 60s per chunk — prevents TCP stalls from hanging the whole sync

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const pct = Math.round(10 + (i / chunks.length) * 70);

      if (onProgress) {
        await onProgress(pct, `Fetching donations ${chunk.from} → ${chunk.to} (${i + 1}/${chunks.length})...`, recordsProcessed);
      }

      try {
        const chunkPromise = client.paginateAll(
          "/giving/v2/donations",
          {
            include: "designations",
            "where[received_at][gte]": chunk.from,
            "where[received_at][lte]": chunk.to,
            per_page: 100,
          },
          50 // max 50 pages per chunk (5000 donations per week is more than enough)
        );
        const chunkTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Chunk ${chunk.from}→${chunk.to} timed out after ${CHUNK_TIMEOUT_MS / 1000}s`)), CHUNK_TIMEOUT_MS)
        );
        const donationsResp = await Promise.race([chunkPromise, chunkTimeout]);

        const donations = donationsResp.data as any[];
        const included = donationsResp.included as any[];

        // Build designation lookup: designation_id → { fund_id, amount_cents }
        const designationMap = new Map<string, { fundId: string; amountCents: number }>();
        for (const inc of included) {
          if (inc.type === "Designation") {
            designationMap.set(inc.id, {
              fundId: inc.relationships?.fund?.data?.id || "",
              amountCents: inc.attributes?.amount_cents || 0,
            });
          }
        }

        for (const donation of donations) {
          recordsProcessed++;

          // Include succeeded + pending donations to match PCO Giving Dashboard.
          // Pending ACH donations are counted as received (95%+ clear successfully).
          // Only exclude failed and refunded donations.
          const paymentStatus: string = donation.attributes?.payment_status || '';
          if (paymentStatus !== 'succeeded' && paymentStatus !== 'pending') {
            skippedNonSucceeded++;
            continue;
          }

          const receivedAt: string = donation.attributes?.received_at || chunk.from;
          // PCO received_at is often date-only ("2026-04-13"). new Date("2026-04-13")
          // parses as UTC midnight, which is Apr 12 8pm ET — wrong day!
          // Append T12:00:00Z for date-only strings so the ET conversion stays on the correct day.
          const dateStr = receivedAt.includes('T') ? receivedAt : `${receivedAt}T12:00:00Z`;
          const donationDate = new Date(dateStr);
          // Use getSunday() which returns the MONDAY of the ISO week (Mon-Sun).
          // This aligns giving weeks with attendance weeks.
          const weekStart = getSunday(donationDate);
          const weekStartStr = formatDate(weekStart);
          const year = weekStart.getUTCFullYear();
          const weekNum = getISOWeekNumber(weekStart);

          // Get designations for this donation
          const designationRefs = donation.relationships?.designations?.data || [];

          if (designationRefs.length === 0) {
            // No designations: use total amount_cents, attribute to All Campuses general
            noDesignationDonations++;
            const amountCents: number = donation.attributes?.amount_cents || 0;
            const amountDollars = amountCents / 100;
            const campus = "All Campuses";
            const key = `${weekStartStr}-${campus}`;
            const existing = weeklyAgg.get(key);
            if (existing) {
              existing.total += amountDollars;
              existing.general += amountDollars;
              existing.donationCount++;
            } else {
              weeklyAgg.set(key, { year, weekNumber: weekNum, weekStartDate: weekStartStr, campus, total: amountDollars, general: amountDollars, designated: 0, donationCount: 1 });
            }
          } else {
            // Process each designation
            for (const ref of designationRefs) {
              const desig = designationMap.get(ref.id);
              if (!desig) { skippedDesignations++; continue; }
              const amountDollars = desig.amountCents / 100;
              const fundInfo = fundMap.get(desig.fundId);
              const fundName = fundInfo?.name || `unknown-${desig.fundId}`;
              fundTotals.set(fundName, (fundTotals.get(fundName) || 0) + desig.amountCents);
              const campus = fundInfo?.campus || "All Campuses";
              const isGeneral = fundInfo?.isGeneral ?? true;
              const key = `${weekStartStr}-${campus}`;
              const existing = weeklyAgg.get(key);
              if (existing) {
                existing.total += amountDollars;
                if (isGeneral) existing.general += amountDollars;
                else existing.designated += amountDollars;
                existing.donationCount++;
              } else {
                weeklyAgg.set(key, {
                  year,
                  weekNumber: weekNum,
                  weekStartDate: weekStartStr,
                  campus,
                  total: amountDollars,
                  general: isGeneral ? amountDollars : 0,
                  designated: isGeneral ? 0 : amountDollars,
                  donationCount: 1,
                });
              }
            }
          }
        }
      } catch (chunkErr: any) {
        console.warn(`[Weekly Giving] Chunk ${chunk.from}→${chunk.to} failed: ${chunkErr.message}`);
        // Retry once on timeout before giving up on this chunk
        if (chunkErr.message.includes('timed out') || chunkErr.message.includes('abort') || chunkErr.message.includes('ECONNRESET')) {
          console.log(`[Weekly Giving] Retrying chunk ${chunk.from}→${chunk.to} after 3s...`);
          await new Promise(r => setTimeout(r, 3000));
          try {
            const retryPromise = client.paginateAll(
              "/giving/v2/donations",
              {
                include: "designations",
                "where[received_at][gte]": chunk.from,
                "where[received_at][lte]": chunk.to,
                per_page: 100,
              },
              50
            );
            const retryTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Retry chunk ${chunk.from}→${chunk.to} timed out`)), CHUNK_TIMEOUT_MS)
            );
            const retryResp = await Promise.race([retryPromise, retryTimeout]);
            const donations = retryResp.data as any[];
            const included = retryResp.included as any[];
            const designationMap = new Map<string, { fundId: string; amountCents: number }>();
            for (const inc of included) {
              if (inc.type === "Designation") {
                designationMap.set(inc.id, {
                  fundId: inc.relationships?.fund?.data?.id || "",
                  amountCents: inc.attributes?.amount_cents || 0,
                });
              }
            }
            for (const donation of donations) {
              recordsProcessed++;
              const paymentStatus: string = donation.attributes?.payment_status || '';
              if (paymentStatus !== 'succeeded' && paymentStatus !== 'pending') { skippedNonSucceeded++; continue; }
              const receivedAt: string = donation.attributes?.received_at || chunk.from;
              const dateStr = receivedAt.includes('T') ? receivedAt : `${receivedAt}T12:00:00Z`;
              const donationDate = new Date(dateStr);
              const weekStart = getSunday(donationDate);
              const weekStartStr = formatDate(weekStart);
              const year = weekStart.getUTCFullYear();
              const weekNum = getISOWeekNumber(weekStart);
              const designationRefs = donation.relationships?.designations?.data || [];
              if (designationRefs.length === 0) {
                noDesignationDonations++;
                const amountCents: number = donation.attributes?.amount_cents || 0;
                const amountDollars = amountCents / 100;
                const campus = "All Campuses";
                const key = `${weekStartStr}-${campus}`;
                const existing = weeklyAgg.get(key);
                if (existing) { existing.total += amountDollars; existing.general += amountDollars; existing.donationCount++; }
                else { weeklyAgg.set(key, { year, weekNumber: weekNum, weekStartDate: weekStartStr, campus, total: amountDollars, general: amountDollars, designated: 0, donationCount: 1 }); }
              } else {
                for (const ref of designationRefs) {
                  const desig = designationMap.get(ref.id);
                  if (!desig) { skippedDesignations++; continue; }
                  const amountDollars = desig.amountCents / 100;
                  const fundInfo = fundMap.get(desig.fundId);
                  const fundName = fundInfo?.name || `unknown-${desig.fundId}`;
                  fundTotals.set(fundName, (fundTotals.get(fundName) || 0) + desig.amountCents);
                  const campus = fundInfo?.campus || "All Campuses";
                  const isGeneral = fundInfo?.isGeneral ?? true;
                  const key = `${weekStartStr}-${campus}`;
                  const existing = weeklyAgg.get(key);
                  if (existing) { existing.total += amountDollars; if (isGeneral) existing.general += amountDollars; else existing.designated += amountDollars; existing.donationCount++; }
                  else { weeklyAgg.set(key, { year, weekNumber: weekNum, weekStartDate: weekStartStr, campus, total: amountDollars, general: isGeneral ? amountDollars : 0, designated: isGeneral ? 0 : amountDollars, donationCount: 1 }); }
                }
              }
            }
            console.log(`[Weekly Giving] Retry succeeded for chunk ${chunk.from}→${chunk.to}: ${donations.length} donations`);
          } catch (retryErr: any) {
            console.warn(`[Weekly Giving] Retry also failed for chunk ${chunk.from}→${chunk.to}: ${retryErr.message}. Skipping this chunk.`);
          }
        }
        // Continue with next chunk rather than failing the whole sync
      }
    }

    console.log(`[Weekly Giving] Processed ${recordsProcessed} donations into ${weeklyAgg.size} weekly campus rows`);
    console.log(`[Weekly Giving] Skipped non-succeeded/non-pending donations (failed/refunded): ${skippedNonSucceeded}`);
    console.log(`[Weekly Giving] Skipped designations (not in included): ${skippedDesignations}`);
    console.log(`[Weekly Giving] Donations without designations: ${noDesignationDonations}`);
    // Log per-fund totals
    const sortedFunds = Array.from(fundTotals.entries()).sort((a, b) => b[1] - a[1]);
    console.log(`[Weekly Giving] Per-fund totals (all time in sync range):`);
    let grandTotal = 0;
    for (const [fname, cents] of Array.from(sortedFunds)) {
      console.log(`  ${fname}: $${(cents / 100).toFixed(2)}`);
      grandTotal += cents;
    }
    console.log(`  GRAND TOTAL: $${(grandTotal / 100).toFixed(2)}`);
    // Log per-campus totals for the most recent weeks for debugging
    const recentWeeks = new Map<number, Map<string, number>>();
    for (const [key, agg] of Array.from(weeklyAgg.entries())) {
      if (agg.year === new Date().getFullYear()) {
        if (!recentWeeks.has(agg.weekNumber)) recentWeeks.set(agg.weekNumber, new Map());
        recentWeeks.get(agg.weekNumber)!.set(agg.campus, agg.total);
      }
    }
    const sortedWeeks = Array.from(recentWeeks.keys()).sort((a, b) => b - a).slice(0, 3);
    for (const wk of sortedWeeks) {
      const campuses = recentWeeks.get(wk)!;
      let wkTotal = 0;
      const parts: string[] = [];
      for (const [campus, total] of Array.from(campuses.entries())) {
        parts.push(`${campus}=$${total.toFixed(2)}`);
        wkTotal += total;
      }
      console.log(`[Weekly Giving] Week ${wk}: ${parts.join(', ')} | TOTAL=$${wkTotal.toFixed(2)}`);
    }

    if (onProgress) {
      await onProgress(82, `Writing ${weeklyAgg.size} weekly giving rows to database...`, recordsProcessed);
    }

    // Step 3: Fetch locked rows to skip them
    const lockedRows = await db
      .select({ weekStartDate: givingWeekly.weekStartDate, campus: givingWeekly.campus })
      .from(givingWeekly)
      .where(eq(givingWeekly.manualLock, true));
    const lockedSet = new Set(lockedRows.map(r => `${r.weekStartDate}-${r.campus}`));

    // Step 4: Upsert giving_weekly rows (skip locked)
    const weeklyBatch: typeof givingWeekly.$inferInsert[] = [];
    for (const [key, agg] of Array.from(weeklyAgg.entries())) {
      if (lockedSet.has(key)) {
        console.log(`[Weekly Giving] Skipping locked row: ${key}`);
        continue;
      }
      weeklyBatch.push({
        year: agg.year,
        weekNumber: agg.weekNumber,
        weekStartDate: agg.weekStartDate,
        campus: agg.campus,
        total: String(agg.total.toFixed(2)),
        general: String(agg.general.toFixed(2)),
        designated: String(agg.designated.toFixed(2)),
        donationCount: agg.donationCount,
        source: "pco",
      });
    }

    if (weeklyBatch.length > 0) {
      // Process in batches of 100 to avoid large inserts
      const BATCH_SIZE = 100;
      for (let i = 0; i < weeklyBatch.length; i += BATCH_SIZE) {
        const batch = weeklyBatch.slice(i, i + BATCH_SIZE);
        try {
          await db
            .insert(givingWeekly)
            .values(batch)
            .onDuplicateKeyUpdate({
              set: {
                total: sql`VALUES(total)`,
                general: sql`VALUES(general)`,
                designated: sql`VALUES(designated)`,
                donationCount: sql`VALUES(donationCount)`,
                source: sql`VALUES(source)`,
              },
            });
          recordsCreated += batch.length;
        } catch (batchErr: any) {
          console.warn(`[Weekly Giving] Batch write failed: ${batchErr.message}`);
        }
      }
    }

    console.log(`[Weekly Giving] Wrote ${recordsCreated} giving_weekly rows`);

    if (onProgress) {
      await onProgress(90, "Aggregating weekly giving into monthly totals...", recordsProcessed);
    }

    // Step 5: Aggregate giving_weekly → giving_monthly (for the synced date range)
    const allWeeklyRows = await db
      .select()
      .from(givingWeekly)
      .where(
        and(
          gte(givingWeekly.weekStartDate, effectiveDateFrom),
          lte(givingWeekly.weekStartDate, effectiveDateTo)
        )
      );

    const monthlyMap = new Map<string, { year: number; month: number; campus: string; total: number; general: number; designated: number }>();
    for (const row of allWeeklyRows) {
      const date = new Date(row.weekStartDate + "T00:00:00Z");
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
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
      } else {
        monthlyMap.set(key, { year, month, campus, total, general, designated });
      }
    }

    const monthlyBatch: { year: number; month: number; campus: string; subgroup: string; total: string; source: string }[] = [];
    for (const [, agg] of Array.from(monthlyMap.entries())) {
      monthlyBatch.push({ year: agg.year, month: agg.month, campus: agg.campus, subgroup: "Tithes and Offerings", total: String(agg.general.toFixed(2)), source: "aggregated" });
      if (agg.designated > 0) {
        monthlyBatch.push({ year: agg.year, month: agg.month, campus: agg.campus, subgroup: "Designated", total: String(agg.designated.toFixed(2)), source: "aggregated" });
      }
    }

    if (monthlyBatch.length > 0) {
      try {
        await db
          .insert(givingMonthly)
          .values(monthlyBatch)
          .onDuplicateKeyUpdate({
            set: {
              total: sql`VALUES(total)`,
              source: sql`VALUES(source)`,
            },
          });
        recordsUpdated += monthlyBatch.length;
      } catch (monthlyErr: any) {
        console.warn(`[Weekly Giving] giving_monthly write failed: ${monthlyErr.message}`);
      }
    }

    console.log(`[Weekly Giving] Complete: ${recordsProcessed} donations → ${recordsCreated} weekly rows, ${recordsUpdated} monthly rows`);

    return {
      syncType: "weekly_giving",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[Weekly Giving] Sync failed:", error.message);
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
// Weekly Volunteer Sync from PCO Services
// ============================================================

/**
 * Map a PCO service type name to a campus.
 * Service types in PCO are typically named like:
 *   "Canton Weekend Service", "Jasper Weekend Service", "Canton Wednesday", etc.
 */
function mapServiceTypeToCampus(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("canton")) return "Canton";
  if (lower.includes("jasper")) return "Jasper";
  return "Other";
}

export async function syncVolunteersFromServices(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, message: string, processed: number) => Promise<void>
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  let errorMessage: string | undefined;

  try {
    const fromDate = dateFrom || "2026-01-01";
    const toDate = dateTo || formatDate(new Date());

    // Step 1: Fetch all service types
    console.log(`[Volunteer Sync] Fetching service types...`);
    let serviceTypes: any[] = [];
    try {
      const stResult = await Promise.race([
        client.paginateAll("/services/v2/service_types", {}, 10),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout fetching service_types after 30s')), 30_000)),
      ]);
      serviceTypes = stResult.data;
      console.log(`[Volunteer Sync] Found ${serviceTypes.length} service types`);
    } catch (err: any) {
      // If PCO Services scope isn't authorized, log and return gracefully
      if (err.response?.status === 403 || err.response?.status === 401) {
        console.warn(`[Volunteer Sync] PCO Services not authorized. Re-connect PCO with 'services' scope.`);
        return {
          syncType: "volunteers",
          status: "completed" as const,
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          durationMs: Date.now() - start,
          errorMessage: "PCO Services scope not authorized. Re-connect PCO in Settings.",
        };
      }
      throw err;
    }

    // Step 2: For each service type, fetch plans in the date range
    // Aggregate: weekStart → campus → { scheduled, confirmed }
    const weekCampusVolunteers = new Map<string, Map<string, { scheduled: number; confirmed: number }>>();

    for (const st of serviceTypes) {
      const stName = st.attributes?.name || "Unknown";
      const campus = mapServiceTypeToCampus(stName);
      if (campus === "Other") {
        console.log(`[Volunteer Sync] Skipping service type "${stName}" (no campus match)`);
        continue;
      }

      console.log(`[Volunteer Sync] Fetching plans for "${stName}" (${campus})...`);

      // Fetch plans in date range using filter parameters
      let plansResult;
      try {
        plansResult = await Promise.race([
          client.paginateAll(
            `/services/v2/service_types/${st.id}/plans`,
            {
              filter: "after,before",
              after: fromDate,
              before: toDate,
              order: "sort_date",
            },
            50 // max 50 pages = 5000 plans
          ),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching plans for ${stName} after 60s`)), 60_000)),
        ]);
      } catch (planErr: any) {
        console.warn(`[Volunteer Sync] Skipping service type "${stName}": ${planErr.message}`);
        continue;
      }

      console.log(`[Volunteer Sync] Found ${plansResult.data.length} plans for "${stName}"`);

      for (const plan of plansResult.data) {
        const sortDate = plan.attributes?.sort_date;
        const scheduledCount = plan.attributes?.plan_people_count ?? 0;
        if (!sortDate || scheduledCount === 0) continue;

        // Get confirmed count by fetching team_members with confirmed filter
        let confirmedCount = 0;
        try {
          const confirmedResult = await client.get(
            `/services/v2/service_types/${st.id}/plans/${plan.id}/team_members`,
            { filter: "confirmed", per_page: 1 }
          );
          confirmedCount = confirmedResult.meta?.total_count ?? 0;
        } catch (err: any) {
          // If we can't get confirmed count, fall back to scheduled
          console.warn(`[Volunteer Sync] Could not get confirmed count for plan ${plan.id}: ${err.message}`);
          confirmedCount = scheduledCount;
        }

        // Get the week start (Sunday) for this plan date
        const planDate = new Date(sortDate);
        const weekStart = formatDate(getSunday(planDate));

        if (!weekCampusVolunteers.has(weekStart)) {
          weekCampusVolunteers.set(weekStart, new Map());
        }
        const campusMap = weekCampusVolunteers.get(weekStart)!;
        const existing = campusMap.get(campus) || { scheduled: 0, confirmed: 0 };
        existing.scheduled += scheduledCount;
        existing.confirmed += confirmedCount;
        campusMap.set(campus, existing);
        recordsProcessed++;
      }
    }

    // Step 3: Write to attendance_weekly as subgroup "Volunteers" AND serving_weekly
    // Filter out future weeks - PCO Services returns scheduled volunteers for upcoming dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { db, end } = await createFreshDb();
    try {
      for (const [weekStart, campusMap] of Array.from(weekCampusVolunteers)) {
        const weekDate = new Date(weekStart + "T00:00:00Z");
        if (weekDate > today) {
          console.log(`[Volunteer Sync] Skipping future week: ${weekStart}`);
          continue;
        }
        const year = weekDate.getUTCFullYear();
        const weekNumber = getISOWeekNumber(weekDate);

        for (const [campus, counts] of Array.from(campusMap)) {
          const { scheduled, confirmed } = counts;

          // Write to attendance_weekly (uses confirmed as the headcount)
          const existingAtt = await db
            .select()
            .from(attendanceWeekly)
            .where(
              and(
                eq(attendanceWeekly.weekStartDate, weekStart),
                eq(attendanceWeekly.campus, campus),
                eq(attendanceWeekly.subgroup, "Volunteers")
              )
            )
            .limit(1);

          if (existingAtt.length > 0) {
            const row = existingAtt[0] as any;
            if (row.manualLock) {
              console.log(`[Volunteer Sync] Skipping locked row: ${campus} ${weekStart}`);
              continue;
            }
            await db
              .update(attendanceWeekly)
              .set({
                headcount: confirmed,
                volunteerCount: confirmed,
                source: "pco_services",
                updatedAt: new Date(),
              })
              .where(eq(attendanceWeekly.id, row.id));
            recordsUpdated++;
          } else {
            await db.insert(attendanceWeekly).values({
              year,
              weekNumber,
              weekStartDate: weekStart,
              campus,
              subgroup: "Volunteers",
              headcount: confirmed,
              regularCount: 0,
              guestCount: 0,
              volunteerCount: confirmed,
              source: "pco_services",
            });
            recordsCreated++;
          }

          // NOTE: serving_weekly is populated by populateServingAndNextSteps()
          // which merges Services scheduled data with Check-Ins confirmed data.
          // We only write to attendance_weekly here (as "Volunteers" subgroup).
        }
      }
    } finally {
      await end();
    }

    console.log(`[Volunteer Sync] Done: ${recordsProcessed} plans processed, ${recordsCreated} created, ${recordsUpdated} updated`);

    return {
      syncType: "volunteers",
      status: "completed" as const,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    console.error(`[Volunteer Sync] Error:`, err.message);
    return {
      syncType: "volunteers",
      status: "failed" as const,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
      errorMessage: err.message,
    };
  }
}

// ============================================================
// Populate serving_weekly and next_steps_weekly from attendance_weekly
// ============================================================

/**
 * After attendance sync completes, copy relevant subgroups into the
 * dedicated serving_weekly and next_steps_weekly tables so those
 * dashboard pages have 2026+ data.
 *
 * Mapping:
 *   attendance_weekly "Volunteers" → serving_weekly.total
 *   attendance_weekly "FTG Adults" + "FTG Kids" → next_steps_weekly metric "FTG" (summed per campus)
 *   attendance_weekly "RevStudents FTG" + "YA FTG" → also added to "FTG" (campus = Canton/Jasper/Other)
 *   attendance_weekly "RevStudents Salvations" + "YA Salvations" → next_steps_weekly metric "Salvations"
 */
async function populateServingAndNextSteps(): Promise<void> {
  const { db: freshDb, end } = await createFreshDb();
  try {
    // ── Serving (Volunteers) ──
    // Two data sources:
    //   1. "Volunteers" subgroup (from PCO Services) → scheduled count (total from Services)
    //   2. "Volunteer Check-Ins" subgroup (from PCO Check-Ins) → confirmed count (who actually showed up)
    // Merge both into serving_weekly with scheduled + confirmed columns.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDate(today);

    // Get scheduled counts from Services sync ("Volunteers" subgroup)
    const scheduledRows = await freshDb
      .select()
      .from(attendanceWeekly)
      .where(and(
        eq(attendanceWeekly.subgroup, "Volunteers"),
        eq(attendanceWeekly.source, "pco_services"),
        lte(attendanceWeekly.weekStartDate, todayStr),
      ));

    // Get confirmed counts from Check-Ins sync ("Volunteer Check-Ins" subgroup)
    const checkinRows = await freshDb
      .select()
      .from(attendanceWeekly)
      .where(and(
        eq(attendanceWeekly.subgroup, "Volunteer Check-Ins"),
        lte(attendanceWeekly.weekStartDate, todayStr),
      ));

    // Build a lookup: "year|weekNumber|campus" → confirmed count
    const checkinLookup = new Map<string, number>();
    for (const r of checkinRows) {
      const key = `${r.year}|${r.weekNumber}|${r.campus}`;
      checkinLookup.set(key, (checkinLookup.get(key) || 0) + r.headcount);
    }

    // Merge: for each scheduled row, look up the corresponding confirmed count
    if (scheduledRows.length > 0) {
      const CHUNK = 50;
      for (let i = 0; i < scheduledRows.length; i += CHUNK) {
        const chunk = scheduledRows.slice(i, i + CHUNK);
        const values = chunk.map(r => {
          const lookupKey = `${r.year}|${r.weekNumber}|${r.campus}`;
          const confirmedFromCheckins = checkinLookup.get(lookupKey) || 0;
          return {
            year: r.year,
            weekNumber: r.weekNumber,
            weekStartDate: r.weekStartDate,
            campus: r.campus,
            total: confirmedFromCheckins > 0 ? confirmedFromCheckins : r.headcount,
            scheduled: r.headcount, // Services count = scheduled
            confirmed: confirmedFromCheckins, // Check-Ins count = confirmed (who showed up)
            source: "pco" as const,
          };
        });
        await freshDb.insert(servingWeekly).values(values)
          .onDuplicateKeyUpdate({
            set: {
              total: sql`VALUES(total)`,
              scheduled: sql`VALUES(${servingWeekly.scheduled})`,
              confirmed: sql`VALUES(${servingWeekly.confirmed})`,
              source: sql`VALUES(source)`,
            },
          });
      }
      console.log(`[populateServing] Wrote ${scheduledRows.length} serving_weekly rows with scheduled + ${checkinRows.length} check-in confirmed rows`);
    }

    // Also write check-in-only rows (weeks with check-in data but no Services scheduled data)
    // This handles cases where check-ins exist but Services sync didn't produce a matching row
    const scheduledKeys = new Set(scheduledRows.map(r => `${r.year}|${r.weekNumber}|${r.campus}`));
    const orphanCheckins = checkinRows.filter(r => !scheduledKeys.has(`${r.year}|${r.weekNumber}|${r.campus}`));
    if (orphanCheckins.length > 0) {
      const CHUNK = 50;
      for (let i = 0; i < orphanCheckins.length; i += CHUNK) {
        const chunk = orphanCheckins.slice(i, i + CHUNK);
        const values = chunk.map(r => ({
          year: r.year,
          weekNumber: r.weekNumber,
          weekStartDate: r.weekStartDate,
          campus: r.campus,
          total: r.headcount,
          scheduled: 0,
          confirmed: r.headcount,
          source: "pco" as const,
        }));
        await freshDb.insert(servingWeekly).values(values)
          .onDuplicateKeyUpdate({
            set: {
              confirmed: sql`VALUES(${servingWeekly.confirmed})`,
              total: sql`CASE WHEN ${servingWeekly.total} = 0 THEN VALUES(total) ELSE ${servingWeekly.total} END`,
              source: sql`VALUES(source)`,
            },
          });
      }
      console.log(`[populateServing] Wrote ${orphanCheckins.length} orphan check-in rows (no matching Services data)`);
    }

    // ── Next Steps (FTG, Salvations, Baptisms, Stewardship) ──
    // Subgroups that map to FTG metric
    const ftgSubgroups = ["FTG Adults", "FTG Kids", "RevStudents FTG", "YA FTG"];
    // Subgroups that map to Salvations metric (includes main service + students + YA)
    const salvSubgroups = ["Salvations", "RevStudents Salvations", "YA Salvations"];
    // Subgroups that map to Baptisms metric
    const baptSubgroups = ["Baptisms"];
    // Subgroups that map to Stewardship metric
    const stewSubgroups = ["Stewardship"];

    const allNextStepsSubgroups = [...ftgSubgroups, ...salvSubgroups, ...baptSubgroups, ...stewSubgroups];

    const nextStepsRows = await freshDb
      .select()
      .from(attendanceWeekly)
      .where(sql`${attendanceWeekly.subgroup} IN (${sql.join(
        allNextStepsSubgroups.map(s => sql`${s}`),
        sql`, `
      )})`);

    // Aggregate by year/week/campus/metric
    const nsMap = new Map<string, { year: number; weekNumber: number; weekStartDate: string; campus: string; metric: string; count: number }>();
    for (const row of nextStepsRows) {
      let metric: string;
      let campus = row.campus;
      if (ftgSubgroups.includes(row.subgroup)) {
        metric = "FTG";
      } else if (salvSubgroups.includes(row.subgroup)) {
        metric = "Salvations";
      } else if (baptSubgroups.includes(row.subgroup)) {
        metric = "Baptisms";
      } else if (stewSubgroups.includes(row.subgroup)) {
        metric = "Stewardship";
      } else {
        continue;
      }
      const key = `${row.year}-${row.weekNumber}-${campus}-${metric}`;
      const existing = nsMap.get(key);
      if (existing) {
        existing.count += row.headcount;
      } else {
        nsMap.set(key, {
          year: row.year,
          weekNumber: row.weekNumber,
          weekStartDate: row.weekStartDate,
          campus,
          metric,
          count: row.headcount,
        });
      }
    }

    const nsValues = Array.from(nsMap.values());
    if (nsValues.length > 0) {
      const CHUNK = 50;
      for (let i = 0; i < nsValues.length; i += CHUNK) {
        const chunk = nsValues.slice(i, i + CHUNK);
        const values = chunk.map(r => ({
          year: r.year,
          weekNumber: r.weekNumber,
          weekStartDate: r.weekStartDate,
          campus: r.campus,
          metric: r.metric,
          count: r.count,
          source: "pco" as const,
        }));
        await freshDb.insert(nextStepsWeekly).values(values)
          .onDuplicateKeyUpdate({
            set: {
              count: sql`VALUES(count)`,
              source: sql`VALUES(source)`,
            },
          });
      }
      console.log(`[populateNextSteps] Wrote ${nsValues.length} next_steps_weekly rows`);
    }

    // ── Monthly Aggregation: next_steps_weekly → next_steps_monthly ──
    // Sum weekly counts by year/month/campus/metric for all PCO-sourced weekly rows.
    // Only overwrite PCO-sourced monthly rows (preserve spreadsheet data for months
    // where PCO data doesn't exist yet).
    const allWeeklyNS = await freshDb
      .select()
      .from(nextStepsWeekly)
      .where(eq(nextStepsWeekly.source, "pco"));

    // Derive month from weekStartDate (YYYY-MM-DD → month of that Monday)
    const monthlyMap = new Map<string, { year: number; month: number; campus: string; metric: string; count: number }>();
    for (const row of allWeeklyNS) {
      // weekStartDate is "YYYY-MM-DD" — extract month from it
      const parts = row.weekStartDate.split("-");
      const wsYear = parseInt(parts[0]);
      const wsMonth = parseInt(parts[1]);
      const key = `${wsYear}-${wsMonth}-${row.campus}-${row.metric}`;
      const existing = monthlyMap.get(key);
      if (existing) {
        existing.count += row.count;
      } else {
        monthlyMap.set(key, {
          year: wsYear,
          month: wsMonth,
          campus: row.campus,
          metric: row.metric,
          count: row.count,
        });
      }
    }

    const monthlyValues = Array.from(monthlyMap.values());
    if (monthlyValues.length > 0) {
      const CHUNK = 50;
      for (let i = 0; i < monthlyValues.length; i += CHUNK) {
        const chunk = monthlyValues.slice(i, i + CHUNK);
        await freshDb.insert(nextStepsMonthly).values(
          chunk.map(r => ({
            year: r.year,
            month: r.month,
            campus: r.campus,
            metric: r.metric,
            count: r.count,
            source: "pco" as const,
          }))
        ).onDuplicateKeyUpdate({
          set: {
            count: sql`VALUES(count)`,
            source: sql`VALUES(source)`,
          },
        });
      }
      console.log(`[populateNextSteps] Wrote ${monthlyValues.length} next_steps_monthly rows (aggregated from weekly)`);
    }
  } finally {
    await end();
  }
}

// ============================================================
// Combined Weekly Sync (attendance + giving + volunteers)
// ============================================================

export async function syncAllWeekly(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, message: string, processed: number) => Promise<void>,
  jobId?: string
): Promise<{ attendance: SyncResult; giving: SyncResult; volunteers: SyncResult }> {
  let attendance: SyncResult;
  let giving: SyncResult;
  let volunteers: SyncResult;
  try {
    attendance = await syncWeeklyAttendance(client, dateFrom, dateTo, onProgress, jobId);
    giving = await syncWeeklyGiving(client, dateFrom, dateTo, onProgress);
    volunteers = await syncVolunteersFromServices(client, dateFrom, dateTo, onProgress);

    // Populate serving_weekly and next_steps_weekly from attendance_weekly
    try {
      await populateServingAndNextSteps();
    } catch (err: any) {
      console.error('[syncAllWeekly] populateServingAndNextSteps failed:', err.message);
      // Non-fatal — the main sync data is already written
    }
  } catch (err: any) {
    // Hard failure — notify owner and rethrow
    try {
      await notifyOwner({
        title: "⚠️ PCO Weekly Sync Failed",
        content: `The weekly sync encountered a fatal error and did not complete.\n\nError: ${err.message}\n\nDate range: ${dateFrom ?? 'default'} → ${dateTo ?? 'today'}`,
      });
    } catch { /* notification failure is non-fatal */ }
    throw err;
  }

  // Build summary notification
  const attStatus = attendance.status === 'completed' ? '✅' : '⚠️';
  const givingStatus = giving.status === 'completed' ? '✅' : '⚠️';
  const volStatus = volunteers.status === 'completed' ? '✅' : '⚠️';
  const anyFailure = attendance.status !== 'completed' || giving.status !== 'completed' || volunteers.status !== 'completed';
  const title = anyFailure
    ? '⚠️ PCO Weekly Sync Completed with Errors'
    : '✅ PCO Weekly Sync Completed';
  const durationSec = ((attendance.durationMs + giving.durationMs + volunteers.durationMs) / 1000).toFixed(1);
  const content = [
    `**Attendance** ${attStatus}: ${attendance.recordsProcessed} processed, ${attendance.recordsCreated} created, ${attendance.recordsUpdated} updated${attendance.errorMessage ? ` — Error: ${attendance.errorMessage}` : ''}`,
    `**Giving** ${givingStatus}: ${giving.recordsProcessed} processed, ${giving.recordsCreated} created, ${giving.recordsUpdated} updated${giving.errorMessage ? ` — Error: ${giving.errorMessage}` : ''}`,
    `**Volunteers** ${volStatus}: ${volunteers.recordsProcessed} plans processed, ${volunteers.recordsCreated} created, ${volunteers.recordsUpdated} updated${volunteers.errorMessage ? ` — ${volunteers.errorMessage}` : ''}`,
    `**Duration**: ${durationSec}s`,
    `**Date range**: ${dateFrom ?? 'default'} → ${dateTo ?? 'today'}`,
  ].join('\n');

  try {
    await notifyOwner({ title, content });
  } catch { /* notification failure is non-fatal */ }

  return { attendance, giving, volunteers };
}
