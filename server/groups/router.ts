/**
 * Groups tRPC Router
 * Provides groups metrics: active groups, total members, leaders, attendance,
 * participation rate, trends, and campus breakdown.
 * 
 * KPIs are derived from groups_monthly (real PCO data) — using the latest
 * available month as the "current" snapshot.
 */
import { z } from "zod";
import { and, eq, ne, desc } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  groupsMonthly,
  attendance,
} from "../../drizzle/schema";

export const groupsRouter = router({
  /**
   * Get groups dashboard data for a given year and campus.
   * Returns current metrics, prior year comparison, monthly trends, and campus breakdown.
   */
  getData: publicProcedure
    .input(
      z.object({
        year: z.number().min(2014).max(2030).default(2026),
        campus: z.string().default("All Campuses"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          current: null,
          priorYear: null,
          monthly: [],
          campusBreakdown: [],
          yearlyTrend: [],
          meta: { year: input.year, campus: input.campus },
        };
      }

      const { year, campus } = input;
      const isAllCampuses = campus === "All Campuses";

      // ── Monthly data for current year ────────────────────────────
      const monthlyRows = await db
        .select()
        .from(groupsMonthly)
        .where(eq(groupsMonthly.year, year));

      // ── Monthly data for prior year ──────────────────────────────
      const priorMonthlyRows = await db
        .select()
        .from(groupsMonthly)
        .where(eq(groupsMonthly.year, year - 1));

      // ── All years monthly for trend chart ────────────────────────
      const allMonthlyRows = await db
        .select()
        .from(groupsMonthly);

      // ── Attendance data for participation rate ────────────────────
      const attRows = await db
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.year, year),
            eq(attendance.subgroup, "Total")
          )
        );

      const priorAttRows = await db
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.year, year - 1),
            eq(attendance.subgroup, "Total")
          )
        );

      // ── Helper: get latest month's data as "current" KPI ─────────
      function getLatestMonthMetrics(rows: typeof monthlyRows, campusFilter: string) {
        const filtered = campusFilter === "All Campuses"
          ? rows
          : rows.filter((r) => r.campus === campusFilter);

        if (filtered.length === 0) {
          return { activeGroups: 0, totalMembers: 0, totalLeaders: 0, avgAttendance: 0 };
        }

        // Find the latest month with data
        const latestMonth = Math.max(...filtered.map((r) => r.month));
        const latestRows = filtered.filter((r) => r.month === latestMonth);

        return {
          activeGroups: latestRows.reduce((s, r) => s + r.activeGroups, 0),
          totalMembers: latestRows.reduce((s, r) => s + r.totalMembers, 0),
          totalLeaders: latestRows.reduce((s, r) => s + r.totalLeaders, 0),
          avgAttendance: latestRows.reduce((s, r) => s + r.avgAttendance, 0),
        };
      }

      // ── Helper: get YTD average metrics for annual trend ──────────
      function getYearAvgMetrics(rows: typeof monthlyRows, campusFilter: string) {
        const filtered = campusFilter === "All Campuses"
          ? rows
          : rows.filter((r) => r.campus === campusFilter);

        if (filtered.length === 0) {
          return { activeGroups: 0, totalMembers: 0, totalLeaders: 0, avgAttendance: 0 };
        }

        // Get unique months
        const months = Array.from(new Set(filtered.map((r) => r.month)));
        const monthCount = months.length;

        // For each month, sum across campuses, then average across months
        let totalGroups = 0, totalMembers = 0, totalLeaders = 0, totalAttendance = 0;
        for (const m of months) {
          const mRows = filtered.filter((r) => r.month === m);
          totalGroups += mRows.reduce((s, r) => s + r.activeGroups, 0);
          totalMembers += mRows.reduce((s, r) => s + r.totalMembers, 0);
          totalLeaders += mRows.reduce((s, r) => s + r.totalLeaders, 0);
          totalAttendance += mRows.reduce((s, r) => s + r.avgAttendance, 0);
        }

        return {
          activeGroups: Math.round(totalGroups / monthCount),
          totalMembers: Math.round(totalMembers / monthCount),
          totalLeaders: Math.round(totalLeaders / monthCount),
          avgAttendance: Math.round(totalAttendance / monthCount),
        };
      }

      function getAttendance(rows: typeof attRows, campusFilter: string) {
        if (campusFilter === "All Campuses") {
          return rows
            .filter((r) => r.campus !== "All Campuses" && r.campus !== "Online")
            .reduce((s, r) => s + r.avgWeekly, 0);
        }
        return rows
          .filter((r) => r.campus === campusFilter)
          .reduce((s, r) => s + r.avgWeekly, 0);
      }

      // ── Current year metrics (latest month) ───────────────────────
      const current = getLatestMonthMetrics(monthlyRows, campus);
      const totalAtt = getAttendance(attRows, campus);
      const participationRate = totalAtt > 0
        ? Math.round((current.totalMembers / totalAtt) * 1000) / 10
        : 0;

      // ── Prior year metrics (latest month of prior year) ───────────
      const prior = getLatestMonthMetrics(priorMonthlyRows, campus);
      const priorAtt = getAttendance(priorAttRows, campus);
      const priorParticipationRate = priorAtt > 0
        ? Math.round((prior.totalMembers / priorAtt) * 1000) / 10
        : 0;

      // ── Monthly trends ────────────────────────────────────────────
      const monthlyAgg = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const rows = monthlyRows.filter((r) =>
          r.month === month && (isAllCampuses || r.campus === campus)
        );
        const priorRows = priorMonthlyRows.filter((r) =>
          r.month === month && (isAllCampuses || r.campus === campus)
        );
        return {
          month,
          activeGroups: rows.reduce((s, r) => s + r.activeGroups, 0),
          totalMembers: rows.reduce((s, r) => s + r.totalMembers, 0),
          totalLeaders: rows.reduce((s, r) => s + r.totalLeaders, 0),
          avgAttendance: rows.reduce((s, r) => s + r.avgAttendance, 0),
          priorActiveGroups: priorRows.reduce((s, r) => s + r.activeGroups, 0),
          priorMembers: priorRows.reduce((s, r) => s + r.totalMembers, 0),
        };
      }).filter((m) => m.activeGroups > 0 || m.priorActiveGroups > 0);

      // ── Campus breakdown (latest month per campus) ────────────────
      const campuses = Array.from(new Set(monthlyRows.map((r) => r.campus)));
      const campusBreakdown = campuses.map((c) => {
        const cData = getLatestMonthMetrics(monthlyRows, c);
        const cAtt = getAttendance(attRows, c);
        const cPrior = getLatestMonthMetrics(priorMonthlyRows, c);
        return {
          campus: c,
          ...cData,
          participationRate: cAtt > 0
            ? Math.round((cData.totalMembers / cAtt) * 1000) / 10
            : 0,
          priorActiveGroups: cPrior.activeGroups,
          priorMembers: cPrior.totalMembers,
          priorLeaders: cPrior.totalLeaders,
          priorAttendance: cPrior.avgAttendance,
        };
      });

      // ── Yearly trend (all years from groups_monthly) ──────────────
      const years = Array.from(new Set(allMonthlyRows.map((r) => r.year))).sort();
      const yearlyTrend = years.map((y) => {
        const yRows = allMonthlyRows.filter((r) => r.year === y);
        const agg = getYearAvgMetrics(yRows, campus);
        return { year: y, ...agg };
      });

      return {
        current: {
          ...current,
          participationRate,
        },
        priorYear: {
          ...prior,
          participationRate: priorParticipationRate,
        },
        monthly: monthlyAgg,
        campusBreakdown,
        yearlyTrend,
        meta: { year, campus },
      };
    }),
});
