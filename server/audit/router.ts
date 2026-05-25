/**
 * Data Audit Router
 * Provides raw record access, sync health flags, and cross-tab consistency checks
 * for admins to verify dashboard numbers against PCO source data.
 *
 * Uses the staff auth pattern (publicProcedure + getStaffUser cookie check)
 * since the app authenticates via custom lumen_staff_session cookie, not Manus OAuth.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  attendanceWeekly,
  givingWeekly,
  attendanceMonthly,
  givingMonthly,
  groupsMonthly,
  syncLogs,
} from "../../drizzle/schema";
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { ENV } from "../_core/env";

// ─── Staff auth helpers (same pattern as staffAuth/router.ts) ────────────────

const STAFF_COOKIE = "lumen_staff_session";

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret || "dev-secret-change-me");
}

async function getStaffUser(cookieHeader: string | undefined) {
  if (!cookieHeader) return null;
  const { parse } = await import("cookie");
  const cookies = parse(cookieHeader);
  const token = cookies[STAFF_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { userId, email, name, role } = payload as Record<string, unknown>;
    if (!userId || !email) return null;
    return { userId: userId as number, email: email as string, name: name as string, role: role as string };
  } catch {
    return null;
  }
}

async function requireAdmin(cookieHeader: string | undefined) {
  const session = await getStaffUser(cookieHeader);
  if (!session || session.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return session;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sundaysInMonth(year: number, month: number): string[] {
  const sundays: string[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month - 1) {
    sundays.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return sundays;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const auditRouter = router({
  // ── Raw weekly attendance records ─────────────────────────────────────────
  rawAttendanceWeekly: publicProcedure
    .input(
      z.object({
        campus: z.string().optional(),
        year: z.number().int().min(2020).max(2030),
        month: z.number().int().min(1).max(12).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return [];

      const { year, month, campus } = input;
      const conditions: ReturnType<typeof eq>[] = [eq(attendanceWeekly.year, year)];

      if (campus && campus !== "All") {
        conditions.push(eq(attendanceWeekly.campus, campus));
      }

      if (month) {
        const monthStr = String(month).padStart(2, "0");
        conditions.push(
          gte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-01`) as any,
          lte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-31`) as any
        );
      }

      return db
        .select()
        .from(attendanceWeekly)
        .where(and(...conditions))
        .orderBy(asc(attendanceWeekly.weekStartDate), asc(attendanceWeekly.campus), asc(attendanceWeekly.subgroup));
    }),

  // ── Raw weekly giving records ──────────────────────────────────────────────
  rawGivingWeekly: publicProcedure
    .input(
      z.object({
        campus: z.string().optional(),
        year: z.number().int().min(2020).max(2030),
        month: z.number().int().min(1).max(12).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return [];

      const { year, month, campus } = input;
      const conditions: ReturnType<typeof eq>[] = [eq(givingWeekly.year, year)];

      if (campus && campus !== "All") {
        conditions.push(eq(givingWeekly.campus, campus));
      }

      if (month) {
        const monthStr = String(month).padStart(2, "0");
        conditions.push(
          gte(givingWeekly.weekStartDate, `${year}-${monthStr}-01`) as any,
          lte(givingWeekly.weekStartDate, `${year}-${monthStr}-31`) as any
        );
      }

      return db
        .select()
        .from(givingWeekly)
        .where(and(...conditions))
        .orderBy(asc(givingWeekly.weekStartDate), asc(givingWeekly.campus));
    }),

  // ── Raw monthly attendance aggregates ─────────────────────────────────────
  rawAttendanceMonthly: publicProcedure
    .input(
      z.object({
        campus: z.string().optional(),
        year: z.number().int().min(2020).max(2030),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return [];

      const { year, campus } = input;
      const conditions: ReturnType<typeof eq>[] = [eq(attendanceMonthly.year, year)];

      if (campus && campus !== "All") {
        conditions.push(eq(attendanceMonthly.campus, campus));
      }

      return db
        .select()
        .from(attendanceMonthly)
        .where(and(...conditions))
        .orderBy(asc(attendanceMonthly.month), asc(attendanceMonthly.campus), asc(attendanceMonthly.subgroup));
    }),

  // ── Raw monthly giving aggregates ─────────────────────────────────────────
  rawGivingMonthly: publicProcedure
    .input(
      z.object({
        campus: z.string().optional(),
        year: z.number().int().min(2020).max(2030),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return [];

      const { year, campus } = input;
      const conditions: ReturnType<typeof eq>[] = [eq(givingMonthly.year, year)];

      if (campus && campus !== "All") {
        conditions.push(eq(givingMonthly.campus, campus));
      }

      return db
        .select()
        .from(givingMonthly)
        .where(and(...conditions))
        .orderBy(asc(givingMonthly.month), asc(givingMonthly.campus), asc(givingMonthly.subgroup));
    }),

  // ── Raw monthly groups aggregates ─────────────────────────────────────────
  rawGroupsMonthly: publicProcedure
    .input(
      z.object({
        campus: z.string().optional(),
        year: z.number().int().min(2020).max(2030),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return [];

      const { year, campus } = input;
      const conditions: ReturnType<typeof eq>[] = [eq(groupsMonthly.year, year)];

      if (campus && campus !== "All") {
        conditions.push(eq(groupsMonthly.campus, campus));
      }

      return db
        .select()
        .from(groupsMonthly)
        .where(and(...conditions))
        .orderBy(asc(groupsMonthly.month), asc(groupsMonthly.campus));
    }),

  // ── Sync logs ─────────────────────────────────────────────────────────────
  syncLogs: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(syncLogs)
        .orderBy(desc(syncLogs.startedAt))
        .limit(input.limit);
    }),

  // ── Health flags ──────────────────────────────────────────────────────────
  healthFlags: publicProcedure
    .input(
      z.object({
        year: z.number().int().min(2020).max(2030),
        campus: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return { flags: [], summary: { errors: 0, warnings: 0, info: 0, total: 0 } };

      const { year, campus } = input;
      const flags: Array<{
        severity: "error" | "warning" | "info";
        category: string;
        message: string;
        detail?: string;
      }> = [];

      const campuses = campus && campus !== "All" ? [campus] : ["Canton", "Jasper"];
      const currentDate = new Date();
      const maxMonth = year < currentDate.getFullYear() ? 12 : currentDate.getMonth() + 1;

      // ── 1. Missing Sundays in weekly attendance ──────────────────────────
      for (const c of campuses) {
        for (let m = 1; m <= maxMonth; m++) {
          const sundays = sundaysInMonth(year, m);
          const monthStr = String(m).padStart(2, "0");

          const rows = await db
            .select({ weekStartDate: attendanceWeekly.weekStartDate })
            .from(attendanceWeekly)
            .where(
              and(
                eq(attendanceWeekly.year, year),
                eq(attendanceWeekly.campus, c),
                gte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-01`) as any,
                lte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-31`) as any
              )
            );

          const presentDates = new Set(rows.map((r) => r.weekStartDate));
          const checkSundays =
            year === currentDate.getFullYear() && m === currentDate.getMonth() + 1
              ? sundays.filter((s) => new Date(s) < currentDate)
              : sundays;

          for (const sunday of checkSundays) {
            if (!presentDates.has(sunday)) {
              flags.push({
                severity: "error",
                category: "Missing Data",
                message: `No attendance record for ${c} on ${sunday}`,
                detail: `Expected Sunday data not found in attendance_weekly`,
              });
            }
          }
        }
      }

      // ── 2. Zero attendance on a non-cancelled Sunday ─────────────────────
      for (const c of campuses) {
        const zeroRows = await db
          .select()
          .from(attendanceWeekly)
          .where(
            and(
              eq(attendanceWeekly.year, year),
              eq(attendanceWeekly.campus, c),
              eq(attendanceWeekly.headcount, 0),
              eq(attendanceWeekly.cancelled, false)
            )
          );

        for (const row of zeroRows) {
          flags.push({
            severity: "warning",
            category: "Zero Values",
            message: `Zero attendance for ${c} on ${row.weekStartDate} (${row.subgroup})`,
            detail: `headcount=0, cancelled=false — verify in PCO`,
          });
        }
      }

      // ── 3. Duplicate weekly records ───────────────────────────────────────
      const subgroupCounts = await db
        .select({
          campus: attendanceWeekly.campus,
          weekStartDate: attendanceWeekly.weekStartDate,
          subgroup: attendanceWeekly.subgroup,
          cnt: sql<number>`count(*)`.as("cnt"),
        })
        .from(attendanceWeekly)
        .where(eq(attendanceWeekly.year, year))
        .groupBy(
          attendanceWeekly.campus,
          attendanceWeekly.weekStartDate,
          attendanceWeekly.subgroup
        )
        .having(sql`count(*) > 1`);

      for (const row of subgroupCounts) {
        flags.push({
          severity: "error",
          category: "Duplicates",
          message: `Duplicate records: ${row.campus} / ${row.weekStartDate} / ${row.subgroup} (${row.cnt} rows)`,
          detail: `Multiple rows with same week/campus/subgroup — data may be double-counted`,
        });
      }

      // ── 4. Monthly totals vs weekly sum variance >5% ──────────────────────
      for (const c of campuses) {
        for (let m = 1; m <= maxMonth; m++) {
          const monthStr = String(m).padStart(2, "0");

          const weeklyResult = await db
            .select({ weeklyTotal: sql<number>`coalesce(sum(${attendanceWeekly.headcount}), 0)`.as("weeklyTotal") })
            .from(attendanceWeekly)
            .where(
              and(
                eq(attendanceWeekly.year, year),
                eq(attendanceWeekly.campus, c),
                eq(attendanceWeekly.cancelled, false),
                gte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-01`) as any,
                lte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-31`) as any
              )
            );

          const monthlyResult = await db
            .select({ monthlyTotal: attendanceMonthly.total })
            .from(attendanceMonthly)
            .where(
              and(
                eq(attendanceMonthly.year, year),
                eq(attendanceMonthly.month, m),
                eq(attendanceMonthly.campus, c),
                eq(attendanceMonthly.subgroup, "Adults")
              )
            )
            .limit(1);

          const weeklyTotal = Number(weeklyResult[0]?.weeklyTotal ?? 0);
          const monthlyTotal = Number(monthlyResult[0]?.monthlyTotal ?? 0);

          if (monthlyTotal > 0 && weeklyTotal > 0) {
            const variance = Math.abs(weeklyTotal - monthlyTotal);
            const pct = (variance / monthlyTotal) * 100;
            if (pct > 5) {
              const monthName = new Date(year, m - 1, 1).toLocaleString("default", { month: "long" });
              flags.push({
                severity: "warning",
                category: "Consistency",
                message: `${c} ${monthName} Adults: weekly sum=${weeklyTotal}, monthly aggregate=${monthlyTotal} (${pct.toFixed(1)}% variance)`,
                detail: `Weekly records and monthly aggregate don't match — one may be stale`,
              });
            }
          }
        }
      }

      // ── 5. Missing giving data for a month ────────────────────────────────
      for (const c of campuses) {
        for (let m = 1; m <= maxMonth; m++) {
          const monthStr = String(m).padStart(2, "0");
          const givingRows = await db
            .select({ total: givingWeekly.total })
            .from(givingWeekly)
            .where(
              and(
                eq(givingWeekly.year, year),
                eq(givingWeekly.campus, c),
                gte(givingWeekly.weekStartDate, `${year}-${monthStr}-01`) as any,
                lte(givingWeekly.weekStartDate, `${year}-${monthStr}-31`) as any
              )
            );

          if (givingRows.length === 0) {
            const monthName = new Date(year, m - 1, 1).toLocaleString("default", { month: "long" });
            flags.push({
              severity: "warning",
              category: "Missing Data",
              message: `No giving records for ${c} in ${monthName} ${year}`,
              detail: `giving_weekly has no rows for this campus/month`,
            });
          }
        }
      }

      return {
        flags,
        summary: {
          errors: flags.filter((f) => f.severity === "error").length,
          warnings: flags.filter((f) => f.severity === "warning").length,
          info: flags.filter((f) => f.severity === "info").length,
          total: flags.length,
        },
      };
    }),

  // ── Cross-tab consistency check ───────────────────────────────────────────
  crossTabCheck: publicProcedure
    .input(
      z.object({
        year: z.number().int().min(2020).max(2030),
        month: z.number().int().min(1).max(12),
        campus: z.string().default("Canton"),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.req.headers.cookie);
      const db = await getDb();
      if (!db) return null;

      const { year, month, campus } = input;
      const monthStr = String(month).padStart(2, "0");

      // Attendance: sum of weekly Adults vs monthly aggregate
      const weeklyAdultsResult = await db
        .select({ total: sql<number>`coalesce(sum(${attendanceWeekly.headcount}), 0)`.as("total") })
        .from(attendanceWeekly)
        .where(
          and(
            eq(attendanceWeekly.year, year),
            eq(attendanceWeekly.campus, campus),
            eq(attendanceWeekly.cancelled, false),
            gte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-01`) as any,
            lte(attendanceWeekly.weekStartDate, `${year}-${monthStr}-31`) as any
          )
        );

      const monthlyAdultsResult = await db
        .select({ total: attendanceMonthly.total, avgWeekly: attendanceMonthly.avgWeekly })
        .from(attendanceMonthly)
        .where(
          and(
            eq(attendanceMonthly.year, year),
            eq(attendanceMonthly.month, month),
            eq(attendanceMonthly.campus, campus),
            eq(attendanceMonthly.subgroup, "Adults")
          )
        )
        .limit(1);

      // Giving: sum of weekly vs monthly aggregate
      const weeklyGivingResult = await db
        .select({
          total: sql<number>`coalesce(sum(${givingWeekly.total}), 0)`.as("total"),
          general: sql<number>`coalesce(sum(${givingWeekly.general}), 0)`.as("general"),
          designated: sql<number>`coalesce(sum(${givingWeekly.designated}), 0)`.as("designated"),
        })
        .from(givingWeekly)
        .where(
          and(
            eq(givingWeekly.year, year),
            eq(givingWeekly.campus, campus),
            gte(givingWeekly.weekStartDate, `${year}-${monthStr}-01`) as any,
            lte(givingWeekly.weekStartDate, `${year}-${monthStr}-31`) as any
          )
        );

      const monthlyGivingResult = await db
        .select({ subgroup: givingMonthly.subgroup, total: givingMonthly.total })
        .from(givingMonthly)
        .where(
          and(
            eq(givingMonthly.year, year),
            eq(givingMonthly.month, month),
            eq(givingMonthly.campus, campus)
          )
        );

      const monthlyGivingTotal = monthlyGivingResult.reduce(
        (sum, r) => sum + parseFloat(String(r.total ?? 0)),
        0
      );

      // Groups
      const groupsResult = await db
        .select()
        .from(groupsMonthly)
        .where(
          and(
            eq(groupsMonthly.year, year),
            eq(groupsMonthly.month, month),
            eq(groupsMonthly.campus, campus)
          )
        )
        .limit(1);

      const weeklyAdults = Number(weeklyAdultsResult[0]?.total ?? 0);
      const monthlyAdults = Number(monthlyAdultsResult[0]?.total ?? 0);
      const monthlyAdultsAvgWeekly = Number(monthlyAdultsResult[0]?.avgWeekly ?? 0);
      const weeklyGivingTotal = Number(weeklyGivingResult[0]?.total ?? 0);
      const monthName = new Date(year, month - 1, 1).toLocaleString("default", { month: "long" });

      return {
        period: `${monthName} ${year} — ${campus}`,
        attendance: {
          weeklyRawSum: weeklyAdults,
          monthlyAggregateTotal: monthlyAdults,
          monthlyAggregateAvgWeekly: monthlyAdultsAvgWeekly,
          match: Math.abs(weeklyAdults - monthlyAdults) <= 5,
          variance: weeklyAdults - monthlyAdults,
        },
        giving: {
          weeklyRawSum: weeklyGivingTotal,
          monthlyAggregateTotal: monthlyGivingTotal,
          weeklyGeneral: Number(weeklyGivingResult[0]?.general ?? 0),
          weeklyDesignated: Number(weeklyGivingResult[0]?.designated ?? 0),
          match: Math.abs(weeklyGivingTotal - monthlyGivingTotal) <= 10,
          variance: weeklyGivingTotal - monthlyGivingTotal,
        },
        groups: groupsResult[0] ?? null,
      };
    }),
});
