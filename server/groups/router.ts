/**
 * Groups tRPC Router
 * Provides groups metrics: active groups, total members, leaders, attendance,
 * participation rate, trends, and campus breakdown.
 */
import { z } from "zod";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  groupsAnnual,
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

      // ── Annual data for current year ──────────────────────────
      const annualRows = await db
        .select()
        .from(groupsAnnual)
        .where(
          and(
            eq(groupsAnnual.year, year),
            ne(groupsAnnual.campus, "All Campuses")
          )
        );

      // ── Annual data for prior year ────────────────────────────
      const priorRows = await db
        .select()
        .from(groupsAnnual)
        .where(
          and(
            eq(groupsAnnual.year, year - 1),
            ne(groupsAnnual.campus, "All Campuses")
          )
        );

      // ── Attendance data for participation rate ────────────────
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

      // ── Monthly data for trends ───────────────────────────────
      const monthlyRows = await db
        .select()
        .from(groupsMonthly)
        .where(eq(groupsMonthly.year, year));

      // ── Prior year monthly for comparison ─────────────────────
      const priorMonthlyRows = await db
        .select()
        .from(groupsMonthly)
        .where(eq(groupsMonthly.year, year - 1));

      // ── All years for trend chart ─────────────────────────────
      const allAnnualRows = await db
        .select()
        .from(groupsAnnual)
        .where(ne(groupsAnnual.campus, "All Campuses"));

      // ── Aggregate helpers ─────────────────────────────────────
      function aggregateCampus(rows: typeof annualRows, campusFilter: string) {
        if (campusFilter === "All Campuses") {
          return {
            activeGroups: rows.reduce((s, r) => s + r.activeGroups, 0),
            totalMembers: rows.reduce((s, r) => s + r.totalMembers, 0),
            totalLeaders: rows.reduce((s, r) => s + r.totalLeaders, 0),
            avgAttendance: rows.reduce((s, r) => s + r.avgAttendance, 0),
          };
        }
        const filtered = rows.filter((r) => r.campus === campusFilter);
        return {
          activeGroups: filtered.reduce((s, r) => s + r.activeGroups, 0),
          totalMembers: filtered.reduce((s, r) => s + r.totalMembers, 0),
          totalLeaders: filtered.reduce((s, r) => s + r.totalLeaders, 0),
          avgAttendance: filtered.reduce((s, r) => s + r.avgAttendance, 0),
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

      // ── Current year metrics ──────────────────────────────────
      const current = aggregateCampus(annualRows, campus);
      const totalAtt = getAttendance(attRows, campus);
      const participationRate = totalAtt > 0
        ? Math.round((current.totalMembers / totalAtt) * 1000) / 10
        : 0;

      // ── Prior year metrics ────────────────────────────────────
      const prior = aggregateCampus(priorRows, campus);
      const priorAtt = getAttendance(priorAttRows, campus);
      const priorParticipationRate = priorAtt > 0
        ? Math.round((prior.totalMembers / priorAtt) * 1000) / 10
        : 0;

      // ── Monthly trends ────────────────────────────────────────
      const monthlyAgg = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const rows = monthlyRows.filter((r) =>
          r.month === month && (isAllCampuses || r.campus === campus)
        );
        const priorMonthRows = priorMonthlyRows.filter((r) =>
          r.month === month && (isAllCampuses || r.campus === campus)
        );
        return {
          month,
          activeGroups: rows.reduce((s, r) => s + r.activeGroups, 0),
          totalMembers: rows.reduce((s, r) => s + r.totalMembers, 0),
          totalLeaders: rows.reduce((s, r) => s + r.totalLeaders, 0),
          avgAttendance: rows.reduce((s, r) => s + r.avgAttendance, 0),
          priorActiveGroups: priorMonthRows.reduce((s, r) => s + r.activeGroups, 0),
          priorMembers: priorMonthRows.reduce((s, r) => s + r.totalMembers, 0),
        };
      }).filter((m) => m.activeGroups > 0 || m.priorActiveGroups > 0);

      // ── Campus breakdown ──────────────────────────────────────
      const campuses = Array.from(new Set(annualRows.map((r) => r.campus)));
      const campusBreakdown = campuses.map((c) => {
        const cData = aggregateCampus(annualRows, c);
        const cAtt = getAttendance(attRows, c);
        const cPrior = aggregateCampus(priorRows, c);
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

      // ── Yearly trend (all years) ──────────────────────────────
      const years = Array.from(new Set(allAnnualRows.map((r) => r.year))).sort();
      const yearlyTrend = years.map((y) => {
        const yRows = allAnnualRows.filter((r) => r.year === y);
        const agg = aggregateCampus(yRows, campus);
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
