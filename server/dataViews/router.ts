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
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import {
  attendanceWeekly,
  givingWeekly,
  servingWeekly,
  nextStepsWeekly,
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
  }>();

  for (const row of rows) {
    const category = classifySubgroup(row.subgroup);
    if (!category) continue; // skip unrecognized

    // Map "Other" campus (YA Gathering) to a virtual campus
    const campus = row.campus === "Other" ? "Other" : row.campus;
    const key = `${row.weekStartDate}-${campus}`;

    let entry = weekMap.get(key);
    if (!entry) {
      entry = {
        year: row.year,
        weekNumber: row.weekNumber,
        weekStartDate: row.weekStartDate,
        campus,
        ...emptyMetrics(),
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
    results.push({ ...entry, total });
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
    // Aggregate across campuses per week
    const weekMap = new Map<string, NormalizedWeek>();
    for (const w of weeks) {
      const key = w.weekStartDate;
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
        const key = w.weekStartDate;
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
      const rows = await d
        .select()
        .from(attendanceWeekly)
        .where(whereClause)
        .orderBy(asc(attendanceWeekly.year), asc(attendanceWeekly.weekNumber));

      // Normalize and filter
      const normalized = normalizeAttendanceRows(rows);
      const filtered = filterByCampus(normalized, campus);

      if (viewMode === "weekly") {
        return { viewMode, data: filtered };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, NormalizedWeek & { weekCount: number }>();

        for (const w of filtered) {
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
    }))
    .query(async ({ input }) => {
      const { year, campus } = input;
      const d = await db();

      // Fetch all "Kids: *" subgroup rows for the given year
      const conditions: any[] = [
        eq(attendanceWeekly.year, year),
      ];
      if (campus && campus !== "all") {
        conditions.push(eq(attendanceWeekly.campus, campus));
      }

      const rows = await d
        .select()
        .from(attendanceWeekly)
        .where(and(...conditions))
        .orderBy(asc(attendanceWeekly.weekNumber));

      // Filter to only "Kids: *" subgroups (room-level)
      const kidsRows = rows.filter(r => r.subgroup.startsWith("Kids: "));

      // Group by subgroup → compute average
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

      // Parse numeric strings to numbers
      const parsed = rows.map(r => ({
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
          donationCount: number; weekCount: number;
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
            existing.weekCount += 1;
          } else {
            monthly.set(key, {
              year: row.year,
              month,
              campus: campusKey === "All" ? "All Campuses" : row.campus,
              total: row.total,
              general: row.general,
              designated: row.designated,
              donationCount: row.donationCount,
              weekCount: 1,
            });
          }
        }

        const data = Array.from(monthly.values()).map(m => ({
          ...m,
          avgWeekly: Math.round(m.total / m.weekCount * 100) / 100,
        }));
        data.sort((a, b) => a.year - b.year || a.month - b.month);
        return { viewMode, data };
      }

      // yearly
      const yearly = new Map<string, {
        year: number; campus: string;
        total: number; general: number; designated: number;
        donationCount: number; weekCount: number;
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
          existing.weekCount += 1;
        } else {
          yearly.set(key, {
            year: row.year,
            campus: campusKey === "All" ? "All Campuses" : row.campus,
            total: row.total,
            general: row.general,
            designated: row.designated,
            donationCount: row.donationCount,
            weekCount: 1,
          });
        }
      }

      const data = Array.from(yearly.values()).map(y => ({
        ...y,
        avgWeekly: Math.round(y.total / y.weekCount * 100) / 100,
      }));
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
      const rows = await d
        .select()
        .from(servingWeekly)
        .where(whereClause)
        .orderBy(asc(servingWeekly.year), asc(servingWeekly.weekNumber));

      if (viewMode === "weekly") {
        if (!campus || campus === "all") {
          const weekMap = new Map<string, any>();
          for (const row of rows) {
            const key = `${row.year}-${row.weekNumber}`;
            const existing = weekMap.get(key);
            if (existing) {
              existing.total += row.total;
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
          total: number; weekCount: number;
        }>();

        for (const row of rows) {
          const month = getMonthFromDate(row.weekStartDate);
          const campusKey = (!campus || campus === "all") ? "All" : row.campus;
          const key = `${row.year}-${month}-${campusKey}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.total += row.total;
            existing.weekCount += 1;
          } else {
            monthly.set(key, {
              year: row.year,
              month,
              campus: campusKey === "All" ? "All Campuses" : row.campus,
              total: row.total,
              weekCount: 1,
            });
          }
        }

        const data = Array.from(monthly.values()).map(m => ({
          ...m,
          avgWeekly: Math.round(m.total / m.weekCount),
        }));
        data.sort((a, b) => a.year - b.year || a.month - b.month);
        return { viewMode, data };
      }

      // yearly
      const yearly = new Map<string, {
        year: number; campus: string;
        total: number; weekCount: number;
      }>();

      for (const row of rows) {
        const campusKey = (!campus || campus === "all") ? "All" : row.campus;
        const key = `${row.year}-${campusKey}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.total += row.total;
          existing.weekCount += 1;
        } else {
          yearly.set(key, {
            year: row.year,
            campus: campusKey === "All" ? "All Campuses" : row.campus,
            total: row.total,
            weekCount: 1,
          });
        }
      }

      const data = Array.from(yearly.values()).map(y => ({
        ...y,
        avgWeekly: Math.round(y.total / y.weekCount),
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
// Export combined router
// ============================================================
export const dataViewsRouter = router({
  attendance: attendanceRouter,
  giving: givingRouter,
  serving: servingRouter,
  nextSteps: nextStepsRouter,
});
