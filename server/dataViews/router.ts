/**
 * Data Views Router — unified weekly/monthly/yearly aggregation endpoints
 *
 * All data derives from the weekly tables. Monthly and yearly views are
 * computed by grouping weekly rows by the month/year of weekStartDate (Sunday).
 *
 * The Sunday date determines the month (per Chad's rule).
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
  campus: z.string().optional(),
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
// Attendance
// ============================================================
const attendanceRouter = router({
  getData: publicProcedure
    .input(baseInput)
    .query(async ({ input }) => {
      const { viewMode, campus, year, startYear, endYear } = input;
      const d = await db();

      const conditions: any[] = [];
      if (campus) conditions.push(eq(attendanceWeekly.campus, campus));
      if (year) conditions.push(eq(attendanceWeekly.year, year));
      if (startYear) conditions.push(gte(attendanceWeekly.year, startYear));
      if (endYear) conditions.push(lte(attendanceWeekly.year, endYear));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await d
        .select()
        .from(attendanceWeekly)
        .where(whereClause)
        .orderBy(asc(attendanceWeekly.year), asc(attendanceWeekly.weekNumber));

      if (viewMode === "weekly") {
        return { viewMode, data: rows };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, {
          year: number; month: number; campus: string; subgroup: string;
          totalHeadcount: number; weekCount: number;
        }>();

        for (const row of rows) {
          const month = getMonthFromDate(row.weekStartDate);
          const key = `${row.year}-${month}-${row.campus}-${row.subgroup}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.totalHeadcount += row.headcount;
            existing.weekCount += 1;
          } else {
            monthly.set(key, {
              year: row.year,
              month,
              campus: row.campus,
              subgroup: row.subgroup,
              totalHeadcount: row.headcount,
              weekCount: 1,
            });
          }
        }

        const data = Array.from(monthly.values()).map(m => ({
          ...m,
          avgWeekly: Math.round(m.totalHeadcount / m.weekCount),
        }));
        data.sort((a, b) => a.year - b.year || a.month - b.month);
        return { viewMode, data };
      }

      // yearly
      const yearly = new Map<string, {
        year: number; campus: string; subgroup: string;
        totalHeadcount: number; weekCount: number;
      }>();

      for (const row of rows) {
        const key = `${row.year}-${row.campus}-${row.subgroup}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.totalHeadcount += row.headcount;
          existing.weekCount += 1;
        } else {
          yearly.set(key, {
            year: row.year,
            campus: row.campus,
            subgroup: row.subgroup,
            totalHeadcount: row.headcount,
            weekCount: 1,
          });
        }
      }

      const data = Array.from(yearly.values()).map(y => ({
        ...y,
        avgWeekly: Math.round(y.totalHeadcount / y.weekCount),
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
    return result.map(r => r.campus);
  }),

  getSubgroups: publicProcedure.query(async () => {
    const d = await db();
    const result = await d
      .selectDistinct({ subgroup: attendanceWeekly.subgroup })
      .from(attendanceWeekly)
      .orderBy(asc(attendanceWeekly.subgroup));
    return result.map(r => r.subgroup);
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
      if (campus) conditions.push(eq(givingWeekly.campus, campus));
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
          const key = `${row.year}-${month}-${row.campus}`;
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
              campus: row.campus,
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
        const key = `${row.year}-${row.campus}`;
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
            campus: row.campus,
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
      if (campus) conditions.push(eq(servingWeekly.campus, campus));
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
        return { viewMode, data: rows };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, {
          year: number; month: number; campus: string;
          total: number; weekCount: number;
        }>();

        for (const row of rows) {
          const month = getMonthFromDate(row.weekStartDate);
          const key = `${row.year}-${month}-${row.campus}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.total += row.total;
            existing.weekCount += 1;
          } else {
            monthly.set(key, {
              year: row.year,
              month,
              campus: row.campus,
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
        const key = `${row.year}-${row.campus}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.total += row.total;
          existing.weekCount += 1;
        } else {
          yearly.set(key, {
            year: row.year,
            campus: row.campus,
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
      if (campus) conditions.push(eq(nextStepsWeekly.campus, campus));
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
        return { viewMode, data: rows };
      }

      if (viewMode === "monthly") {
        const monthly = new Map<string, {
          year: number; month: number; campus: string; metric: string;
          count: number; weekCount: number;
        }>();

        for (const row of rows) {
          const month = getMonthFromDate(row.weekStartDate);
          const key = `${row.year}-${month}-${row.campus}-${row.metric}`;
          const existing = monthly.get(key);
          if (existing) {
            existing.count += row.count;
            existing.weekCount += 1;
          } else {
            monthly.set(key, {
              year: row.year,
              month,
              campus: row.campus,
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
        const key = `${row.year}-${row.campus}-${row.metric}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.count += row.count;
          existing.weekCount += 1;
        } else {
          yearly.set(key, {
            year: row.year,
            campus: row.campus,
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
