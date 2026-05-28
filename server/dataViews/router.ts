/**
 * Data Views Router — unified weekly/monthly/yearly aggregation endpoints
 *
 * All data derives from the weekly tables. Monthly and yearly views are
 * computed by grouping weekly rows by the month/year of weekStartDate (Sunday).
 *
 * The Sunday date determines the month (per Chad's rule).
 *
 * Attendance subgroups are NORMALIZED to match the weekly report logic:
 *   - "Adults" = main service check-in (Revolution Canton/Jasper Check-In OR spreadsheet "Adults")
 *   - "Kids" = Kids ministry (Kids, Kids:*, etc.)
 *   - "Students" = RevStudents HS + MS (or legacy "Students")
 *   - "Online" = Online viewers
 *   - "Volunteers" = Volunteer count
 *   - "Young Adults" = YA Gathering
 *   - "FTG" = First-time guests (FTG Adults + FTG Kids + RevStudents FTG)
 */
import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { eq, and, gte, lte, desc, asc, lt } from "drizzle-orm";

/**
 * Get the last fully completed ISO week number for the current year.
 * A church week runs Sun-Sat. We consider a week complete once
 * we've moved past its Saturday into the next week.
 */
function getLastCompleteISOWeek(): number {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const currentWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return currentWeek - 1; // exclude current partial week
}
import {
  attendanceWeekly,
  givingWeekly,
  servingWeekly,
  nextStepsWeekly,
  volunteerRoster,
} from "../../drizzle/schema";

// ============================================================
// Shared input schemas
// ============================================================
const baseInput = z.object({
  viewMode: z.enum(["weekly", "monthly", "yearly"]),
  campus: z.string().optional(), // "Canton", "Jasper", "Online", or undefined for all
  year: z.number().optional(),
  startYear: z.number().optional(),
  endYear: z.number().optional(),
});

// ============================================================
// Helper: get month from weekStartDate string "YYYY-MM-DD"
// ============================================================
function getMonthFromDate(dateStr: string): number {
  return parseInt(dateStr.split("-")[1]);
}

// Helper to get db instance (throws if unavailable)
async function db() {
  const instance = await getDb();
  if (!instance) throw new Error("Database not available");
  return instance;
}

// ============================================================
// Attendance subgroup classification (mirrors weeklyReport logic)
// ============================================================

/** Main weekend service check-in subgroups — these are the adult headcount */
const PCO_CHECKIN_SUBGROUPS = [
  "Revolution Canton Check-In",
  "Revolution Jasper Check-In",
  "Revolution Online Check-In",
];

/** RevStudents subgroups (legacy combined) */
const PCO_STUDENTS_SUBGROUPS = [
  "RevStudents | Canton Campus",
  "RevStudents | Jasper Campus",
  "RevStudents | Online Campus",
];

/** Young Adults subgroups */
const PCO_YOUNG_ADULTS_SUBGROUPS = ["YA Gathering", "Young Adults"];

/** Kids subgroups — any subgroup starting with "Kids" */
function isKidsSubgroup(subgroup: string): boolean {
  return subgroup === "Kids" || subgroup.startsWith("Kids:") || subgroup.startsWith("Kids ");
}

/** Classify a raw subgroup into a normalized category */
function classifySubgroup(subgroup: string): string | null {
  // Main service check-in → "Adults"
  if (PCO_CHECKIN_SUBGROUPS.includes(subgroup)) return "Adults";
  if (subgroup === "Adults") return "Adults";

  // Kids ministry — only the aggregate "Kids" row counts toward totals.
  // Room-level rows like "Kids: Canton Babies" are for breakdown display only
  // and must NOT be included here to avoid double-counting.
  if (subgroup === "Kids") return "Kids";
  if (subgroup.startsWith("Kids:") || subgroup.startsWith("Kids ")) return null;

  // Students
  if (subgroup === "RevStudents HS" || subgroup === "RevStudents MS" ||
      subgroup === "RevStudents Attendance" || subgroup === "Students" ||
      PCO_STUDENTS_SUBGROUPS.includes(subgroup)) return "Students";

  // Online
  if (subgroup === "Online") return "Online";

  // Volunteers
  if (subgroup === "Volunteers") return "Volunteers";

  // Young Adults
  if (PCO_YOUNG_ADULTS_SUBGROUPS.includes(subgroup)) return "Young Adults";

  // First-time guests
  if (subgroup === "FTG Adults" || subgroup === "FTG Kids" ||
      subgroup === "RevStudents FTG" || subgroup === "YA FTG" ||
      subgroup === "FTG") return "FTG";

  // Skip unrecognized subgroups (e.g., "RevStudents Salvations", "Baptisms")
  return null;
}

// Normalized category display order
const CATEGORY_ORDER = ["Adults", "Kids", "Students", "Online", "Volunteers", "Young Adults", "FTG"];

// ============================================================
// Attendance data structures
// ============================================================
interface NormalizedWeek {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string; // "Canton", "Jasper", "Online", "All Campuses"
  adults: number;
  kids: number;
  students: number;
  online: number;
  volunteers: number;
  youngAdults: number;
  ftg: number;
  total: number; // adults + kids (Canton), adults + kids (Jasper), varies by campus
  cancelled: boolean; // true if main service was cancelled (only students data remains)
  studentsCancelled: boolean; // true if students were cancelled independently
}

function emptyMetrics() {
  return { adults: 0, kids: 0, students: 0, online: 0, volunteers: 0, youngAdults: 0, ftg: 0 };
}

/**
 * Normalize raw attendance rows into per-week, per-campus metrics.
 * Groups by weekStartDate + campus, classifying each subgroup.
 */
function normalizeAttendanceRows(rows: any[]): NormalizedWeek[] {
  const weekMap = new Map<string, {
    year: number; weekNumber: number; weekStartDate: string; campus: string;
    adults: number; kids: number; students: number; online: number;
    volunteers: number; youngAdults: number; ftg: number;
    cancelled: boolean;
    studentsCancelled: boolean;
  }>();

  // Track which year+weekNumber+campus combos have cancelled main-service or student rows
  const mainCancelledKeys = new Set<string>();
  const studentCancelledKeys = new Set<string>();

  // First pass: detect which week+campus combos have HS or MS data
  // to avoid double-counting with "RevStudents Attendance" (which is HS+MS combined)
  // Also track cancelled state per week+campus, split by main vs student
  const hasHsMsSet = new Set<string>();
  for (const row of rows) {
    const campus = row.campus === "Other" ? "Other" : row.campus;
    const weekKey = `${row.year}-${row.weekNumber}-${campus}`;
    if (row.subgroup === "RevStudents HS" || row.subgroup === "RevStudents MS") {
      hasHsMsSet.add(weekKey);
    }
    // Track cancelled state by target type
    const isStudent = row.subgroup.startsWith("RevStudents") ||
      row.subgroup.startsWith("Students") || row.subgroup === "Students";
    if (row.cancelled) {
      if (isStudent) {
        studentCancelledKeys.add(weekKey);
      } else {
        mainCancelledKeys.add(weekKey);
      }
    }
  }

  for (const row of rows) {
    // Skip cancelled rows — they should not contribute to any metrics
    if (row.cancelled) continue;
    const category = classifySubgroup(row.subgroup);
    if (!category) continue; // skip unrecognized

    // Skip "RevStudents Attendance" when HS+MS exist for the same week+campus
    if (row.subgroup === "RevStudents Attendance") {
      const campus = row.campus === "Other" ? "Other" : row.campus;
      if (hasHsMsSet.has(`${row.year}-${row.weekNumber}-${campus}`)) continue;
    }

    // Map "Other" campus (YA Gathering) to a virtual campus
    const campus = row.campus === "Other" ? "Other" : row.campus;
    // Group by year+weekNumber+campus (not weekStartDate) because different
    // PCO sources may assign slightly different weekStartDates to the same ISO week
    const key = `${row.year}-${row.weekNumber}-${campus}`;

    let entry = weekMap.get(key);
    if (!entry) {
      const isCancelled = mainCancelledKeys.has(key);
      const isStudentsCancelled = studentCancelledKeys.has(key);
      entry = {
        year: row.year,
        weekNumber: row.weekNumber,
        weekStartDate: row.weekStartDate,
        campus,
        ...emptyMetrics(),
        cancelled: isCancelled,
        studentsCancelled: isStudentsCancelled,
      };
      weekMap.set(key, entry);
    }

    switch (category) {
      case "Adults": entry.adults += row.headcount; break;
      case "Kids": entry.kids += row.headcount; break;
      case "Students": entry.students += row.headcount; break;
      case "Online": entry.online += row.headcount; break;
      case "Volunteers": entry.volunteers += row.headcount; break;
      case "Young Adults": entry.youngAdults += row.headcount; break;
      case "FTG": entry.ftg += row.headcount; break;
    }
  }

  // Compute totals and build result
  const results: NormalizedWeek[] = [];
  for (const entry of Array.from(weekMap.values())) {
    // Total = adults + kids (the main service attendance metric)
    const total = entry.adults + entry.kids;
    results.push({ ...entry, total, studentsCancelled: entry.studentsCancelled });
  }

  results.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.weekNumber - b.weekNumber;
  });

  return results;
}

/**
 * Aggregate normalized weeks by campus filter.
 * If campus is specified, return only that campus's rows.
 * If campus is "all" or undefined, sum across campuses per week.
 */
function filterByCampus(weeks: NormalizedWeek[], campus?: string): NormalizedWeek[] {
  if (!campus || campus === "all") {
    // Aggregate across campuses per week (use year+weekNumber as key
    // because different sources may have different weekStartDates for the same ISO week)
    const weekMap = new Map<string, NormalizedWeek>();
    for (const w of weeks) {
      const key = `${w.year}-${w.weekNumber}`;
      const existing = weekMap.get(key);
      if (existing) {
        existing.adults += w.adults;
        existing.kids += w.kids;
        existing.students += w.students;
        existing.online += w.online;
        existing.volunteers += w.volunteers;
        existing.youngAdults += w.youngAdults;
        existing.ftg += w.ftg;
        existing.total += w.total;
        // If ANY campus for this week is cancelled, mark the aggregate as cancelled
        if (w.cancelled) existing.cancelled = true;
        if (w.studentsCancelled) existing.studentsCancelled = true;
      } else {
        weekMap.set(key, { ...w, campus: "All Campuses" });
      }
    }
    const result = Array.from(weekMap.values());
    result.sort((a, b) => a.year - b.year || a.weekNumber - b.weekNumber);
    return result;
  }

  if (campus === "Online") {
    // Online is stored as a subgroup under Canton campus (or as its own campus in some years)
    // Return weeks where online > 0
    const weekMap = new Map<string, NormalizedWeek>();
    for (const w of weeks) {
      if (w.online > 0 || w.campus === "Online") {
        const key = `${w.year}-${w.weekNumber}`;
        const existing = weekMap.get(key);
        if (existing) {
          existing.online += w.online;
        } else {
          weekMap.set(key, {
            ...w,
            campus: "Online",
            adults: 0, kids: 0, students: 0, volunteers: 0, youngAdults: 0, ftg: 0,
            total: w.campus === "Online" ? w.adults : 0,
          });
          // If it's an "Online" campus row, the "adults" count IS the online count
          if (w.campus === "Online") {
            weekMap.get(key)!.online = w.adults;
          }
        }
      }
    }
    const result = Array.from(weekMap.values());
    result.sort((a, b) => a.year - b.year || a.weekNumber - b.weekNumber);
    return result;
  }

  // Specific campus
  return weeks.filter(w => w.campus === campus);
}

// ============================================================
// Attendance Router
// ============================================================
const attendanceRouter = router({
  getData: publicProcedure
    .input(baseInput)
    .query(async ({ input }) => {
      const { viewMode, campus, year, startYear, endYear } = input;
      const d = await db();

      // Fetch all rows (we need all subgroups to normalize)
      const conditions: any[] = [];
      if (year) conditions.push(eq(attendanceWeekly.year, year));
      if (startYear) conditions.push(gte(attendanceWeekly.year, startYear));
      if (endYear) conditions.push(lte(attendanceWeekly.year, endYear));
      // Don't filter by campus here — we need all campuses to normalize properly
      // Campus filtering happens after normalization

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const allRows = await d
        .select()
        .from(attendanceWeekly)
        .where(whereClause)
        .orderBy(asc(attendanceWeekly.year), asc(attendanceWeekly.weekNumber));

      // Exclude partial current week for the current year
      const currentYear = new Date().getFullYear();
      const lastCompleteWeek = getLastCompleteISOWeek();
      const rows = allRows.filter(r => !(r.year === currentYear && r.weekNumber > lastCompleteWeek));

      // Normalize and filter
      const normalized = normalizeAttendanceRows(rows);
      const filtered = filterByCampus(normalized, campus);

      if (viewMode === "weekly") {
        return { viewMode, data: filtered };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, NormalizedWeek & { weekCount: number }>();

        for (const w of filtered) {
          // Skip cancelled weeks from monthly aggregation entirely
          // (their main service data is already zeroed out; only students remain
          //  which would distort the average if counted as a "week")
          if (w.cancelled) continue;
          const month = getMonthFromDate(w.weekStartDate);
          const key = `${w.year}-${month}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.adults += w.adults;
            existing.kids += w.kids;
            existing.students += w.students;
            existing.online += w.online;
            existing.volunteers += w.volunteers;
            existing.youngAdults += w.youngAdults;
            existing.ftg += w.ftg;
            existing.total += w.total;
            existing.weekCount += 1;
          } else {
            monthly.set(key, { ...w, weekCount: 1 });
          }
        }

        const data = Array.from(monthly.values()).map(m => ({
          year: m.year,
          month: getMonthFromDate(m.weekStartDate),
          campus: m.campus,
          weekCount: m.weekCount,
          adults: m.adults,
          kids: m.kids,
          students: m.students,
          online: m.online,
          volunteers: m.volunteers,
          youngAdults: m.youngAdults,
          ftg: m.ftg,
          total: m.total,
          avgWeeklyTotal: Math.round(m.total / m.weekCount),
          avgWeeklyAdults: Math.round(m.adults / m.weekCount),
          avgWeeklyKids: Math.round(m.kids / m.weekCount),
          avgWeeklyStudents: Math.round(m.students / m.weekCount),
          avgWeeklyOnline: Math.round(m.online / m.weekCount),
          avgWeeklyVolunteers: Math.round(m.volunteers / m.weekCount),
        }));
        data.sort((a, b) => a.year - b.year || a.month - b.month);
        return { viewMode, data };
      }

      // yearly
      const yearly = new Map<string, NormalizedWeek & { weekCount: number }>();

      for (const w of filtered) {
        // Skip cancelled weeks from yearly aggregation (same logic as monthly)
        if (w.cancelled) continue;
        const key = `${w.year}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.adults += w.adults;
          existing.kids += w.kids;
          existing.students += w.students;
          existing.online += w.online;
          existing.volunteers += w.volunteers;
          existing.youngAdults += w.youngAdults;
          existing.ftg += w.ftg;
          existing.total += w.total;
          existing.weekCount += 1;
        } else {
          yearly.set(key, { ...w, weekCount: 1 });
        }
      }

      const data = Array.from(yearly.values()).map(y => ({
        year: y.year,
        campus: y.campus,
        weekCount: y.weekCount,
        adults: y.adults,
        kids: y.kids,
        students: y.students,
        online: y.online,
        volunteers: y.volunteers,
        youngAdults: y.youngAdults,
        ftg: y.ftg,
        total: y.total,
        avgWeeklyTotal: Math.round(y.total / y.weekCount),
        avgWeeklyAdults: Math.round(y.adults / y.weekCount),
        avgWeeklyKids: Math.round(y.kids / y.weekCount),
        avgWeeklyStudents: Math.round(y.students / y.weekCount),
        avgWeeklyOnline: Math.round(y.online / y.weekCount),
        avgWeeklyVolunteers: Math.round(y.volunteers / y.weekCount),
      }));
      data.sort((a, b) => a.year - b.year);
      return { viewMode, data };
    }),

  getYears: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ year: attendanceWeekly.year })
      .from(attendanceWeekly)
      .orderBy(desc(attendanceWeekly.year));
    return result.map(r => r.year);
  }),

  getCampuses: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ campus: attendanceWeekly.campus })
      .from(attendanceWeekly)
      .orderBy(asc(attendanceWeekly.campus));
    // Filter to meaningful campuses
    return result.map(r => r.campus).filter(c => c !== "Other");
  }),

  /**
   * Kids room-level breakdown — returns average weekly headcount
   * for each "Kids: {Campus} {Room}" subgroup for a given year.
   */
  getKidsRoomBreakdown: publicProcedure
    .input(z.object({
      year: z.number(),
      campus: z.string().optional(), // "Canton", "Jasper", or undefined for all
      weekNumber: z.number().optional(), // specific week (weekly view)
      month: z.number().optional(), // specific month 1-12 (monthly view)
    }))
    .query(async ({ input }) => {
      const { year, campus, weekNumber, month } = input;
      const d = await db();

      // Fetch all "Kids: *" subgroup rows for the given year
      const conditions: any[] = [
        eq(attendanceWeekly.year, year),
      ];
      if (campus && campus !== "all") {
        conditions.push(eq(attendanceWeekly.campus, campus));
      }
      if (weekNumber) {
        conditions.push(eq(attendanceWeekly.weekNumber, weekNumber));
      }

      const rows = await d
        .select()
        .from(attendanceWeekly)
        .where(and(...conditions))
        .orderBy(asc(attendanceWeekly.weekNumber));

      // Filter to only "Kids: *" subgroups (room-level) and exclude cancelled rows
      let kidsRows = rows.filter(r => r.subgroup.startsWith("Kids: ") && !r.cancelled);

      // If month filter, filter by month from weekStartDate
      if (month && !weekNumber) {
        kidsRows = kidsRows.filter(r => {
          const m = parseInt(r.weekStartDate.split("-")[1], 10);
          return m === month;
        });
      }

      // Group by subgroup → compute average (or just headcount for single week)
      const subgroupMap = new Map<string, { total: number; weeks: number; campus: string }>(); 
      for (const row of kidsRows) {
        const existing = subgroupMap.get(row.subgroup);
        if (existing) {
          existing.total += row.headcount;
          existing.weeks += 1;
        } else {
          subgroupMap.set(row.subgroup, { total: row.headcount, weeks: 1, campus: row.campus });
        }
      }

      const result = Array.from(subgroupMap.entries()).map(([subgroup, data]) => {
        // Parse room name from "Kids: Canton Babies" → "Babies"
        const parts = subgroup.replace("Kids: ", "").split(" ");
        const roomCampus = parts[0]; // "Canton" or "Jasper"
        const roomName = parts.slice(1).join(" "); // "Babies", "Pre-K", etc.
        return {
          subgroup,
          campus: roomCampus,
          room: roomName,
          avgWeekly: Math.round(data.total / data.weeks),
          totalHeadcount: data.total,
          weekCount: data.weeks,
        };
      });

      // Sort by campus then by avg descending
      result.sort((a, b) => {
        if (a.campus !== b.campus) return a.campus.localeCompare(b.campus);
        return b.avgWeekly - a.avgWeekly;
      });

      return result;
    }),

  /**
   * Students breakdown — returns average weekly headcount
   * for each "Students: {Campus} {Level}" subgroup (MS/HS) for a given year.
   * Falls back to aggregate "Students" when MS/HS split is not available.
   */
  getStudentsBreakdown: publicProcedure
    .input(z.object({
      year: z.number(),
      campus: z.string().optional(),
      weekNumber: z.number().optional(), // specific week (weekly view)
      month: z.number().optional(), // specific month 1-12 (monthly view)
    }))
    .query(async ({ input }) => {
      const { year, campus, weekNumber, month } = input;
      const d = await db();

      const conditions: any[] = [
        eq(attendanceWeekly.year, year),
      ];
      if (campus && campus !== "all") {
        conditions.push(eq(attendanceWeekly.campus, campus));
      }
      if (weekNumber) {
        conditions.push(eq(attendanceWeekly.weekNumber, weekNumber));
      }

      const rows = await d
        .select()
        .from(attendanceWeekly)
        .where(and(...conditions))
        .orderBy(asc(attendanceWeekly.weekNumber));

      // Filter to "Students: *" subgroups (spreadsheet format) AND
      // "RevStudents MS"/"RevStudents HS" (PCO format)
      // Note: student rows are NOT cancelled in DB (students still met), so no filter needed here
      let studentRows = rows.filter(r =>
        (r.subgroup.startsWith("Students: ") ||
        r.subgroup === "RevStudents MS" ||
        r.subgroup === "RevStudents HS") && !r.cancelled
      );

      // Also get aggregate "Students" rows for comparison (exclude cancelled)
      let aggStudentRows = rows.filter(r => (r.subgroup === "Students" || r.subgroup === "RevStudents Attendance") && !r.cancelled);

      // If month filter, filter by month from weekStartDate
      if (month && !weekNumber) {
        const monthFilter = (r: { weekStartDate: string }) => {
          const m = parseInt(r.weekStartDate.split("-")[1], 10);
          return m === month;
        };
        studentRows = studentRows.filter(monthFilter);
        aggStudentRows = aggStudentRows.filter(monthFilter);
      }

      // Normalize subgroup names to a consistent key: "{campus}|{level}"
      // "Students: Canton MS" → "Canton|Middle School"
      // "RevStudents MS" (campus=Canton) → "Canton|Middle School"
      // "RevStudents HS" (campus=Jasper) → "Jasper|High School"
      function normalizeStudentKey(subgroup: string, campus: string): { campus: string; level: string } {
        if (subgroup === "RevStudents MS") return { campus, level: "Middle School" };
        if (subgroup === "RevStudents HS") return { campus, level: "High School" };
        // Spreadsheet format: "Students: Canton MS" or "Students: Canton Middle School"
        const parts = subgroup.replace("Students: ", "").split(" ");
        const levelCampus = parts[0];
        const rawLevel = parts.slice(1).join(" ");
        const level = rawLevel === "MS" ? "Middle School" : rawLevel === "HS" ? "High School" : rawLevel;
        return { campus: levelCampus, level };
      }

      // Group breakdown rows by normalized key
      const subgroupMap = new Map<string, { total: number; weeks: number; campus: string; level: string }>();
      for (const row of studentRows) {
        const norm = normalizeStudentKey(row.subgroup, row.campus);
        const key = `${norm.campus}|${norm.level}`;
        const existing = subgroupMap.get(key);
        if (existing) {
          existing.total += row.headcount;
          existing.weeks += 1;
        } else {
          subgroupMap.set(key, { total: row.headcount, weeks: 1, campus: norm.campus, level: norm.level });
        }
      }

      const breakdown = Array.from(subgroupMap.entries()).map(([key, data]) => {
        return {
          subgroup: `Students: ${data.campus} ${data.level}`,
          campus: data.campus,
          level: data.level,
          avgWeekly: Math.round(data.total / data.weeks),
          totalHeadcount: data.total,
          weekCount: data.weeks,
        };
      });

      // Group aggregate rows by campus
      const aggMap = new Map<string, { total: number; weeks: number }>();
      for (const row of aggStudentRows) {
        const existing = aggMap.get(row.campus);
        if (existing) {
          existing.total += row.headcount;
          existing.weeks += 1;
        } else {
          aggMap.set(row.campus, { total: row.headcount, weeks: 1 });
        }
      }

      const aggregates = Array.from(aggMap.entries()).map(([camp, data]) => ({
        campus: camp,
        avgWeekly: Math.round(data.total / data.weeks),
        totalHeadcount: data.total,
        weekCount: data.weeks,
      }));

      // Sort breakdown by campus then level
      breakdown.sort((a, b) => {
        if (a.campus !== b.campus) return a.campus.localeCompare(b.campus);
        return a.level.localeCompare(b.level);
      });

      return { breakdown, aggregates, hasBreakdown: breakdown.length > 0 };
    }),
});

// ============================================================
// Giving
// ============================================================
const givingRouter = router({
  getData: publicProcedure
    .input(baseInput)
    .query(async ({ input }) => {
      const { viewMode, campus, year, startYear, endYear } = input;
      const d = await db();

      const conditions: any[] = [];
      if (campus && campus !== "all") conditions.push(eq(givingWeekly.campus, campus));
      if (year) conditions.push(eq(givingWeekly.year, year));
      if (startYear) conditions.push(gte(givingWeekly.year, startYear));
      if (endYear) conditions.push(lte(givingWeekly.year, endYear));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await d
        .select()
        .from(givingWeekly)
        .where(whereClause)
        .orderBy(asc(givingWeekly.year), asc(givingWeekly.weekNumber));

      // Exclude partial current week for the current year (post-query filter
      // so prior year data is not affected by the week cap)
      const currentYear = new Date().getFullYear();
      const lastCompleteWeek = getLastCompleteISOWeek();

      // Parse numeric strings to numbers and filter out partial current week
      const parsed = rows
        .filter(r => !(r.year === currentYear && r.weekNumber > lastCompleteWeek))
        .map(r => ({
          ...r,
          total: parseFloat(r.total as any) || 0,
          general: parseFloat(r.general as any) || 0,
          designated: parseFloat(r.designated as any) || 0,
        }));

      if (viewMode === "weekly") {
        // For "all" campus, aggregate per week
        if (!campus || campus === "all") {
          const weekMap = new Map<string, any>();
          for (const row of parsed) {
            const key = `${row.year}-${row.weekNumber}`;
            const existing = weekMap.get(key);
            if (existing) {
              existing.total += row.total;
              existing.general += row.general;
              existing.designated += row.designated;
              existing.donationCount += row.donationCount;
            } else {
              weekMap.set(key, { ...row, campus: "All Campuses" });
            }
          }
          const data = Array.from(weekMap.values());
          data.sort((a: any, b: any) => a.year - b.year || a.weekNumber - b.weekNumber);
          return { viewMode, data };
        }
        return { viewMode, data: parsed };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, {
          year: number; month: number; campus: string;
          total: number; general: number; designated: number;
          donationCount: number; weekNumbers: Set<number>;
        }>();

        for (const row of parsed) {
          const month = getMonthFromDate(row.weekStartDate);
          const campusKey = (!campus || campus === "all") ? "All" : row.campus;
          const key = `${row.year}-${month}-${campusKey}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.total += row.total;
            existing.general += row.general;
            existing.designated += row.designated;
            existing.donationCount += row.donationCount;
            existing.weekNumbers.add(row.weekNumber);
          } else {
            monthly.set(key, {
              year: row.year,
              month,
              campus: campusKey === "All" ? "All Campuses" : row.campus,
              total: row.total,
              general: row.general,
              designated: row.designated,
              donationCount: row.donationCount,
              weekNumbers: new Set([row.weekNumber]),
            });
          }
        }

        const data = Array.from(monthly.values()).map(m => {
          const weekCount = m.weekNumbers.size;
          return {
            year: m.year,
            month: m.month,
            campus: m.campus,
            total: m.total,
            general: m.general,
            designated: m.designated,
            donationCount: m.donationCount,
            weekCount,
            avgWeekly: weekCount > 0 ? Math.round(m.total / weekCount * 100) / 100 : 0,
          };
        });
        data.sort((a, b) => a.year - b.year || a.month - b.month);
        return { viewMode, data };
      }

      // yearly
      const yearly = new Map<string, {
        year: number; campus: string;
        total: number; general: number; designated: number;
        donationCount: number; weekNumbers: Set<number>;
      }>();

      for (const row of parsed) {
        const campusKey = (!campus || campus === "all") ? "All" : row.campus;
        const key = `${row.year}-${campusKey}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.total += row.total;
          existing.general += row.general;
          existing.designated += row.designated;
          existing.donationCount += row.donationCount;
          existing.weekNumbers.add(row.weekNumber);
        } else {
          yearly.set(key, {
            year: row.year,
            campus: campusKey === "All" ? "All Campuses" : row.campus,
            total: row.total,
            general: row.general,
            designated: row.designated,
            donationCount: row.donationCount,
            weekNumbers: new Set([row.weekNumber]),
          });
        }
      }

      const data = Array.from(yearly.values()).map(y => {
        const weekCount = y.weekNumbers.size;
        return {
          year: y.year,
          campus: y.campus,
          total: y.total,
          general: y.general,
          designated: y.designated,
          donationCount: y.donationCount,
          weekCount,
          avgWeekly: weekCount > 0 ? Math.round(y.total / weekCount * 100) / 100 : 0,
        };
      });
      data.sort((a, b) => a.year - b.year);
      return { viewMode, data };
    }),

  getYears: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ year: givingWeekly.year })
      .from(givingWeekly)
      .orderBy(desc(givingWeekly.year));
    return result.map(r => r.year);
  }),

  getCampuses: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ campus: givingWeekly.campus })
      .from(givingWeekly)
      .orderBy(asc(givingWeekly.campus));
    return result.map(r => r.campus);
  }),

  /**
   * Per capita giving — weekly giving / weekly attendance per week.
   * Returns per-week time series for two years (current + prior) for YoY chart.
   * Also returns the YTD average per capita for each year.
   */
  getPerCapita: publicProcedure
    .input(z.object({
      year: z.number(),
      campus: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { year, campus } = input;
      const d = await db();
      const priorYear = year - 1;

      // Exclude partial current week
      const currentYear = new Date().getFullYear();
      const lastCompleteWeek = getLastCompleteISOWeek();

      // Fetch giving for both years
      const allGivingRows = await d
        .select()
        .from(givingWeekly)
        .where(
          and(
            gte(givingWeekly.year, priorYear),
            lte(givingWeekly.year, year),
            ...(campus && campus !== "all" ? [eq(givingWeekly.campus, campus)] : [])
          )
        )
        .orderBy(asc(givingWeekly.year), asc(givingWeekly.weekNumber));
      // Filter out partial current week (only affects current year rows)
      const givingRows = allGivingRows.filter(r => !(r.year === currentYear && r.weekNumber > lastCompleteWeek));

      // Fetch attendance for both years
      const allAttRows = await d
        .select()
        .from(attendanceWeekly)
        .where(
          and(
            gte(attendanceWeekly.year, priorYear),
            lte(attendanceWeekly.year, year)
          )
        )
        .orderBy(asc(attendanceWeekly.year), asc(attendanceWeekly.weekNumber));
      // Filter out partial current week for attendance too
      const attRows = allAttRows.filter(r => !(r.year === currentYear && r.weekNumber > lastCompleteWeek));

      // Normalize attendance
      const normalizedAtt = normalizeAttendanceRows(attRows);
      const filteredAtt = filterByCampus(normalizedAtt, campus);

      // Build attendance lookup: year-weekNumber -> total
      // Skip cancelled weeks — they have no main service attendance so GPC is meaningless
      const attMap = new Map<string, number>();
      for (const w of filteredAtt) {
        if (w.cancelled) continue;
        const key = `${w.year}-${w.weekNumber}`;
        attMap.set(key, (attMap.get(key) || 0) + w.total);
      }

      // Build giving per week (aggregate across campuses if "all")
      const givMap = new Map<string, { total: number; weekStartDate: string; year: number; weekNumber: number }>();
      for (const row of givingRows) {
        const parsed = parseFloat(row.total as any) || 0;
        const key = `${row.year}-${row.weekNumber}`;
        const existing = givMap.get(key);
        if (existing) {
          existing.total += parsed;
        } else {
          givMap.set(key, {
            total: parsed,
            weekStartDate: row.weekStartDate,
            year: row.year,
            weekNumber: row.weekNumber,
          });
        }
      }

      // Compute per capita per week
      const currentYearWeeks: { weekNumber: number; weekStartDate: string; giving: number; attendance: number; gpc: number }[] = [];
      const priorYearData: { weekNumber: number; weekStartDate: string; giving: number; attendance: number; gpc: number }[] = [];

      for (const [key, giv] of Array.from(givMap)) {
        const att = attMap.get(key) || 0;
        if (att === 0) continue;
        const gpc = Math.round((giv.total / att) * 100) / 100;
        const entry = {
          weekNumber: giv.weekNumber,
          weekStartDate: giv.weekStartDate,
          giving: Math.round(giv.total * 100) / 100,
          attendance: att,
          gpc,
        };
        if (giv.year === year) {
          currentYearWeeks.push(entry);
        } else {
          priorYearData.push(entry);
        }
      }

      currentYearWeeks.sort((a, b) => a.weekNumber - b.weekNumber);
      priorYearData.sort((a, b) => a.weekNumber - b.weekNumber);

      // Compute YTD averages — include ALL giving (even cancelled weeks) but only non-cancelled attendance
      // Per Chad's rule: giving still happens during cancelled weeks (online/app), so it counts in the aggregate
      const avgGpcWithAllGiving = (arr: typeof currentYearWeeks, allGivingForYear: number, totalAttForYear: number) => {
        if (totalAttForYear === 0) return 0;
        return Math.round((allGivingForYear / totalAttForYear) * 100) / 100;
      };

      // Total giving for current year (ALL weeks, including cancelled)
      const currentYearAllGiving = givingRows
        .filter(r => r.year === year)
        .reduce((s, r) => s + (parseFloat(r.total as any) || 0), 0);
      // Total attendance for current year (only non-cancelled weeks)
      const currentYearTotalAtt = currentYearWeeks.reduce((s, w) => s + w.attendance, 0);

      // For YoY comparison, limit prior year to same number of weeks
      const maxWeekCurrent = currentYearWeeks.length > 0 ? Math.max(...currentYearWeeks.map(w => w.weekNumber)) : 0;
      const priorYearSameWeeks = priorYearData.filter(w => w.weekNumber <= maxWeekCurrent);

      // Prior year: all giving up to maxWeekCurrent, attendance only from non-cancelled weeks
      const priorYearAllGiving = givingRows
        .filter(r => r.year === priorYear && r.weekNumber <= maxWeekCurrent)
        .reduce((s, r) => s + (parseFloat(r.total as any) || 0), 0);
      const priorYearTotalAtt = priorYearSameWeeks.reduce((s, w) => s + w.attendance, 0);

      return {
        year,
        priorYear,
        currentYearAvgGpc: avgGpcWithAllGiving(currentYearWeeks, currentYearAllGiving, currentYearTotalAtt),
        priorYearAvgGpc: avgGpcWithAllGiving(priorYearSameWeeks, priorYearAllGiving, priorYearTotalAtt),
        currentYearWeeks: currentYearWeeks,
        priorYearWeeks: priorYearData,
      };
    }),
});

// ============================================================
// Serving (Team Members)
// ============================================================
const servingRouter = router({
  getData: publicProcedure
    .input(baseInput)
    .query(async ({ input }) => {
      const { viewMode, campus, year, startYear, endYear } = input;
      const d = await db();

      const conditions: any[] = [];
      if (campus && campus !== "all") conditions.push(eq(servingWeekly.campus, campus));
      if (year) conditions.push(eq(servingWeekly.year, year));
      if (startYear) conditions.push(gte(servingWeekly.year, startYear));
      if (endYear) conditions.push(lte(servingWeekly.year, endYear));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const allRows = await d
        .select()
        .from(servingWeekly)
        .where(whereClause)
        .orderBy(asc(servingWeekly.year), asc(servingWeekly.weekNumber));

      // Exclude partial current week for the current year (same as attendance/giving)
      const currentYear = new Date().getFullYear();
      const lastCompleteWeek = getLastCompleteISOWeek();
      const rows = allRows.filter(r => !(r.year === currentYear && r.weekNumber > lastCompleteWeek));

      if (viewMode === "weekly") {
        if (!campus || campus === "all") {
          const weekMap = new Map<string, any>();
          for (const row of rows) {
            const key = `${row.year}-${row.weekNumber}`;
            const existing = weekMap.get(key);
            if (existing) {
              existing.total += row.total;
              existing.scheduled += row.scheduled;
              existing.confirmed += row.confirmed;
            } else {
              weekMap.set(key, { ...row, campus: "All Campuses" });
            }
          }
          const data = Array.from(weekMap.values());
          data.sort((a: any, b: any) => a.year - b.year || a.weekNumber - b.weekNumber);
          return { viewMode, data };
        }
        return { viewMode, data: rows };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, {
          year: number; month: number; campus: string;
          total: number; scheduled: number; confirmed: number; weekCount: number;
        }>();

        const monthlyWeekSets = new Map<string, Set<number>>();

        for (const row of rows) {
          const month = getMonthFromDate(row.weekStartDate);
          const campusKey = (!campus || campus === "all") ? "All" : row.campus;
          const key = `${row.year}-${month}-${campusKey}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.total += row.total;
            existing.scheduled += row.scheduled;
            existing.confirmed += row.confirmed;
            const ws = monthlyWeekSets.get(key)!;
            ws.add(row.weekNumber);
            existing.weekCount = ws.size;
          } else {
            const ws = new Set<number>();
            ws.add(row.weekNumber);
            monthlyWeekSets.set(key, ws);
            monthly.set(key, {
              year: row.year,
              month,
              campus: campusKey === "All" ? "All Campuses" : row.campus,
              total: row.total,
              scheduled: row.scheduled,
              confirmed: row.confirmed,
              weekCount: 1,
            });
          }
        }

        const data = Array.from(monthly.values()).map(m => ({
          ...m,
          avgWeekly: Math.round(m.total / m.weekCount),
          avgScheduled: Math.round(m.scheduled / m.weekCount),
          avgConfirmed: Math.round(m.confirmed / m.weekCount),
        }));
        data.sort((a, b) => a.year - b.year || a.month - b.month);
        return { viewMode, data };
      }

      // yearly
      const yearly = new Map<string, {
        year: number; campus: string;
        total: number; scheduled: number; confirmed: number; weekCount: number;
      }>();

      const yearlyWeekSets = new Map<string, Set<number>>();

      for (const row of rows) {
        const campusKey = (!campus || campus === "all") ? "All" : row.campus;
        const key = `${row.year}-${campusKey}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.total += row.total;
          existing.scheduled += row.scheduled;
          existing.confirmed += row.confirmed;
          const ws = yearlyWeekSets.get(key)!;
          ws.add(row.weekNumber);
          existing.weekCount = ws.size;
        } else {
          const ws = new Set<number>();
          ws.add(row.weekNumber);
          yearlyWeekSets.set(key, ws);
          yearly.set(key, {
            year: row.year,
            campus: campusKey === "All" ? "All Campuses" : row.campus,
            total: row.total,
            scheduled: row.scheduled,
            confirmed: row.confirmed,
            weekCount: 1,
          });
        }
      }

      const data = Array.from(yearly.values()).map(y => ({
        ...y,
        avgWeekly: Math.round(y.total / y.weekCount),
        avgScheduled: Math.round(y.scheduled / y.weekCount),
        avgConfirmed: Math.round(y.confirmed / y.weekCount),
      }));
      data.sort((a, b) => a.year - b.year);
      return { viewMode, data };
    }),

  getYears: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ year: servingWeekly.year })
      .from(servingWeekly)
      .orderBy(desc(servingWeekly.year));
    return result.map(r => r.year);
  }),

  getCampuses: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ campus: servingWeekly.campus })
      .from(servingWeekly)
      .orderBy(asc(servingWeekly.campus));
    return result.map(r => r.campus);
  }),

  /**
   * Get volunteer roster data: unique active team members per campus
   * and avg weekly adult attendance for computing the % metric.
   */
  getRoster: publicProcedure
    .input(z.object({ campus: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const d = await db();
      const campus = input?.campus;

      // Get roster counts
      const rosterRows = await d.select().from(volunteerRoster);

      let totalVolunteers = 0;
      const byCampus: Record<string, { uniqueVolunteers: number; totalTeams: number; syncedAt: Date | null }> = {};

      for (const row of rosterRows) {
        if (campus && campus !== "all" && row.campus !== campus) continue;
        totalVolunteers += row.uniqueVolunteers;
        byCampus[row.campus] = {
          uniqueVolunteers: row.uniqueVolunteers,
          totalTeams: row.totalTeams,
          syncedAt: row.syncedAt,
        };
      }

      // Get avg weekly adult attendance (excluding kids)
      // Adults = "Revolution Canton Check-In" + "Revolution Jasper Check-In"
      const currentYear = new Date().getFullYear();
      const adultSubgroups = ["Revolution Canton Check-In", "Revolution Jasper Check-In"];

      const attendanceRows = await d
        .select()
        .from(attendanceWeekly)
        .where(
          and(
            eq(attendanceWeekly.year, currentYear),
            // We'll filter subgroups in JS since drizzle doesn't have inArray for all dialects easily
          )
        );

      // Filter to adult subgroups, exclude cancelled, and optionally by campus
      const adultRows = attendanceRows.filter(r => {
        if (r.cancelled) return false;
        if (!adultSubgroups.includes(r.subgroup)) return false;
        if (campus && campus !== "all") {
          // Map subgroup to campus
          if (campus === "Canton" && r.subgroup !== "Revolution Canton Check-In") return false;
          if (campus === "Jasper" && r.subgroup !== "Revolution Jasper Check-In") return false;
        }
        return true;
      });

      // Calculate avg weekly adult attendance
      let avgWeeklyAdultAttendance = 0;
      if (adultRows.length > 0) {
        // Group by week to get per-week totals, then average
        const weekTotals = new Map<string, number>();
        for (const row of adultRows) {
          const key = `${row.year}-${row.weekNumber}`;
          weekTotals.set(key, (weekTotals.get(key) || 0) + row.headcount);
        }
        const weekValues = Array.from(weekTotals.values());
        avgWeeklyAdultAttendance = Math.round(
          weekValues.reduce((s, v) => s + v, 0) / weekValues.length
        );
      }

      // Calculate percentage
      const percentOfAdultAttendance = avgWeeklyAdultAttendance > 0
        ? Math.round((totalVolunteers / avgWeeklyAdultAttendance) * 1000) / 10
        : 0;

      return {
        totalVolunteers,
        byCampus,
        avgWeeklyAdultAttendance,
        percentOfAdultAttendance,
        year: currentYear,
      };
    }),
});

// ============================================================
// Next Steps (Assimilation: FTG, Salvations, Baptisms, Stewardship)
// ============================================================
const nextStepsRouter = router({
  getData: publicProcedure
    .input(baseInput.extend({ metric: z.string().optional() }))
    .query(async ({ input }) => {
      const { viewMode, campus, year, startYear, endYear, metric } = input;
      const d = await db();

      const conditions: any[] = [];
      if (campus && campus !== "all") conditions.push(eq(nextStepsWeekly.campus, campus));
      if (year) conditions.push(eq(nextStepsWeekly.year, year));
      if (startYear) conditions.push(gte(nextStepsWeekly.year, startYear));
      if (endYear) conditions.push(lte(nextStepsWeekly.year, endYear));
      if (metric) conditions.push(eq(nextStepsWeekly.metric, metric));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await d
        .select()
        .from(nextStepsWeekly)
        .where(whereClause)
        .orderBy(asc(nextStepsWeekly.year), asc(nextStepsWeekly.weekNumber));

      if (viewMode === "weekly") {
        if (!campus || campus === "all") {
          const weekMap = new Map<string, any>();
          for (const row of rows) {
            const key = `${row.year}-${row.weekNumber}-${row.metric}`;
            const existing = weekMap.get(key);
            if (existing) {
              existing.count += row.count;
            } else {
              weekMap.set(key, { ...row, campus: "All Campuses" });
            }
          }
          const data = Array.from(weekMap.values());
          data.sort((a: any, b: any) => a.year - b.year || a.weekNumber - b.weekNumber);
          return { viewMode, data };
        }
        return { viewMode, data: rows };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, {
          year: number; month: number; campus: string; metric: string;
          count: number; weekCount: number;
        }>();

        for (const row of rows) {
          const month = getMonthFromDate(row.weekStartDate);
          const campusKey = (!campus || campus === "all") ? "All" : row.campus;
          const key = `${row.year}-${month}-${campusKey}-${row.metric}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.count += row.count;
            existing.weekCount += 1;
          } else {
            monthly.set(key, {
              year: row.year,
              month,
              campus: campusKey === "All" ? "All Campuses" : row.campus,
              metric: row.metric,
              count: row.count,
              weekCount: 1,
            });
          }
        }

        const data = Array.from(monthly.values());
        data.sort((a, b) => a.year - b.year || a.month - b.month);
        return { viewMode, data };
      }

      // yearly
      const yearly = new Map<string, {
        year: number; campus: string; metric: string;
        count: number; weekCount: number;
      }>();

      for (const row of rows) {
        const campusKey = (!campus || campus === "all") ? "All" : row.campus;
        const key = `${row.year}-${campusKey}-${row.metric}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.count += row.count;
          existing.weekCount += 1;
        } else {
          yearly.set(key, {
            year: row.year,
            campus: campusKey === "All" ? "All Campuses" : row.campus,
            metric: row.metric,
            count: row.count,
            weekCount: 1,
          });
        }
      }

      const data = Array.from(yearly.values());
      data.sort((a, b) => a.year - b.year);
      return { viewMode, data };
    }),

  getYears: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ year: nextStepsWeekly.year })
      .from(nextStepsWeekly)
      .orderBy(desc(nextStepsWeekly.year));
    return result.map(r => r.year);
  }),

  getCampuses: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ campus: nextStepsWeekly.campus })
      .from(nextStepsWeekly)
      .orderBy(asc(nextStepsWeekly.campus));
    return result.map(r => r.campus);
  }),

  getMetrics: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ metric: nextStepsWeekly.metric })
      .from(nextStepsWeekly)
      .orderBy(asc(nextStepsWeekly.metric));
    return result.map(r => r.metric);
  }),
});

// ============================================================
// Compare Weeks — side-by-side week comparison across years
// ============================================================
const compareRouter = router({
  getWeekData: publicProcedure
    .input(z.object({
      weekNumber: z.number().min(1).max(53),
      yearA: z.number(),
      yearB: z.number(),
      campus: z.string().optional(), // "Canton", "Jasper", or undefined for all
    }))
    .query(async ({ input }) => {
      const { weekNumber, yearA, yearB, campus } = input;
      const d = await db();

      // Fetch attendance for both years/week
      const attRows = await d
        .select()
        .from(attendanceWeekly)
        .where(and(
          eq(attendanceWeekly.weekNumber, weekNumber),
        ))
        .orderBy(asc(attendanceWeekly.year));

      // Filter to just the two years
      const attFiltered = attRows.filter(r => r.year === yearA || r.year === yearB);
      const normalizedAtt = normalizeAttendanceRows(attFiltered);
      const campusFiltered = filterByCampus(normalizedAtt, campus || "all");

      const weekA = campusFiltered.find(w => w.year === yearA) || null;
      const weekB = campusFiltered.find(w => w.year === yearB) || null;

      // Fetch giving for both years/week
      const givingRows = await d
        .select()
        .from(givingWeekly)
        .where(and(
          eq(givingWeekly.weekNumber, weekNumber),
        ))
        .orderBy(asc(givingWeekly.year));

      const givingFiltered = givingRows.filter(r => r.year === yearA || r.year === yearB);

      // Aggregate giving by campus
      function aggregateGiving(rows: typeof givingFiltered, year: number, campusFilter?: string) {
        const yearRows = rows.filter(r => r.year === year);
        let filtered = yearRows;
        if (campusFilter && campusFilter !== "all") {
          filtered = yearRows.filter(r => r.campus === campusFilter);
        }
        const total = filtered.reduce((s, r) => s + (parseFloat(r.total as any) || 0), 0);
        const general = filtered.reduce((s, r) => s + (parseFloat(r.general as any) || 0), 0);
        const designated = filtered.reduce((s, r) => s + (parseFloat(r.designated as any) || 0), 0);
        const donationCount = filtered.reduce((s, r) => s + r.donationCount, 0);
        return { total, general, designated, donationCount };
      }

      const givingA = aggregateGiving(givingFiltered, yearA, campus);
      const givingB = aggregateGiving(givingFiltered, yearB, campus);

      // Fetch serving for both years/week
      const servingRows = await d
        .select()
        .from(servingWeekly)
        .where(and(
          eq(servingWeekly.weekNumber, weekNumber),
        ))
        .orderBy(asc(servingWeekly.year));

      const servingFiltered = servingRows.filter(r => r.year === yearA || r.year === yearB);

      function aggregateServing(rows: typeof servingFiltered, year: number, campusFilter?: string) {
        const yearRows = rows.filter(r => r.year === year);
        let filtered = yearRows;
        if (campusFilter && campusFilter !== "all") {
          filtered = yearRows.filter(r => r.campus === campusFilter);
        }
        return filtered.reduce((s, r) => s + r.total, 0);
      }

      const servingA = aggregateServing(servingFiltered, yearA, campus);
      const servingB = aggregateServing(servingFiltered, yearB, campus);

      // Fetch next steps for both years/week
      const nsRows = await d
        .select()
        .from(nextStepsWeekly)
        .where(and(
          eq(nextStepsWeekly.weekNumber, weekNumber),
        ))
        .orderBy(asc(nextStepsWeekly.year));

      const nsFiltered = nsRows.filter(r => r.year === yearA || r.year === yearB);

      function aggregateNextSteps(rows: typeof nsFiltered, year: number, campusFilter?: string) {
        const yearRows = rows.filter(r => r.year === year);
        let filtered = yearRows;
        if (campusFilter && campusFilter !== "all") {
          filtered = yearRows.filter(r => r.campus === campusFilter);
        }
        const ftg = filtered.filter(r => r.metric === "FTG").reduce((s, r) => s + r.count, 0);
        const salvations = filtered.filter(r => r.metric === "Salvations").reduce((s, r) => s + r.count, 0);
        const baptisms = filtered.filter(r => r.metric === "Baptisms").reduce((s, r) => s + r.count, 0);
        return { ftg, salvations, baptisms };
      }

      const nsA = aggregateNextSteps(nsFiltered, yearA, campus);
      const nsB = aggregateNextSteps(nsFiltered, yearB, campus);

      return {
        weekNumber,
        yearA: {
          year: yearA,
          weekStartDate: weekA?.weekStartDate || null,
          attendance: {
            total: weekA?.total || 0,
            adults: weekA?.adults || 0,
            kids: weekA?.kids || 0,
            students: weekA?.students || 0,
            online: weekA?.online || 0,
            volunteers: weekA?.volunteers || 0,
            youngAdults: weekA?.youngAdults || 0,
            ftg: weekA?.ftg || 0,
          },
          giving: givingA,
          serving: servingA,
          nextSteps: nsA,
        },
        yearB: {
          year: yearB,
          weekStartDate: weekB?.weekStartDate || null,
          attendance: {
            total: weekB?.total || 0,
            adults: weekB?.adults || 0,
            kids: weekB?.kids || 0,
            students: weekB?.students || 0,
            online: weekB?.online || 0,
            volunteers: weekB?.volunteers || 0,
            youngAdults: weekB?.youngAdults || 0,
            ftg: weekB?.ftg || 0,
          },
          giving: givingB,
          serving: servingB,
          nextSteps: nsB,
        },
      };
    }),

  getAvailableWeeks: publicProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const d = await db();
      const rows = await d
        .selectDistinct({
          weekNumber: attendanceWeekly.weekNumber,
          weekStartDate: attendanceWeekly.weekStartDate,
        })
        .from(attendanceWeekly)
        .where(eq(attendanceWeekly.year, input.year))
        .orderBy(asc(attendanceWeekly.weekNumber));

      // Deduplicate by weekNumber (take first weekStartDate)
      const seen = new Map<number, string>();
      for (const r of rows) {
        if (!seen.has(r.weekNumber)) {
          seen.set(r.weekNumber, r.weekStartDate);
        }
      }
      return Array.from(seen.entries()).map(([weekNumber, weekStartDate]) => ({
        weekNumber,
        weekStartDate,
      }));
    }),

  getAvailableYears: publicProcedure
    .query(async () => {
      const d = await db();
      const rows = await d
        .selectDistinct({ year: attendanceWeekly.year })
        .from(attendanceWeekly)
        .orderBy(desc(attendanceWeekly.year));
      return rows.map(r => r.year);
    }),
});

// ============================================================
// Admin: Toggle cancelled status for a week
// ============================================================
const adminRouter = router({
  toggleCancelledWeek: publicProcedure
    .input(z.object({
      year: z.number(),
      weekNumber: z.number(),
      campus: z.string(), // "Canton" or "Jasper"
      cancelled: z.boolean(), // true = mark as cancelled, false = unmark
      target: z.enum(["main", "students"]).default("main"), // which group to toggle
    }))
    .mutation(async ({ input }) => {
      const { year, weekNumber, campus, cancelled, target } = input;
      const d = await db();

      // Get all rows for this week — if campus is "All Campuses" or "all", update ALL campuses
      const isAllCampuses = campus === "All Campuses" || campus === "all";
      const conditions: any[] = [
        eq(attendanceWeekly.year, year),
        eq(attendanceWeekly.weekNumber, weekNumber),
      ];
      if (!isAllCampuses) {
        conditions.push(eq(attendanceWeekly.campus, campus));
      }
      const rows = await d
        .select()
        .from(attendanceWeekly)
        .where(and(...conditions));

      // Determine which rows to update based on target
      let updatedCount = 0;
      for (const row of rows) {
        const isStudent = row.subgroup.startsWith("RevStudents") ||
          row.subgroup.startsWith("Students");

        if (target === "main" && isStudent) continue;
        if (target === "students" && !isStudent) continue;

        await d
          .update(attendanceWeekly)
          .set({ cancelled })
          .where(eq(attendanceWeekly.id, row.id));
        updatedCount++;
      }

      return {
        success: true,
        updatedCount,
        year,
        weekNumber,
        campus,
        cancelled,
        target,
      };
    }),

  // Get list of cancelled weeks for display
  getCancelledWeeks: publicProcedure
    .input(z.object({
      year: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const d = await db();
      const conditions: any[] = [eq(attendanceWeekly.cancelled, true)];
      if (input.year) {
        conditions.push(eq(attendanceWeekly.year, input.year));
      }

      const rows = await d
        .select({
          year: attendanceWeekly.year,
          weekNumber: attendanceWeekly.weekNumber,
          weekStartDate: attendanceWeekly.weekStartDate,
          campus: attendanceWeekly.campus,
        })
        .from(attendanceWeekly)
        .where(and(...conditions))
        .orderBy(desc(attendanceWeekly.year), desc(attendanceWeekly.weekNumber));

      // Deduplicate by year-weekNumber-campus
      const seen = new Set<string>();
      const unique = rows.filter(r => {
        const key = `${r.year}-${r.weekNumber}-${r.campus}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return unique;
    }),
});

// ============================================================
// Export combined router
// ============================================================
export const dataViewsRouter = router({
  attendance: attendanceRouter,
  giving: givingRouter,
  serving: servingRouter,
  nextSteps: nextStepsRouter,
  compare: compareRouter,
  admin: adminRouter,
});
