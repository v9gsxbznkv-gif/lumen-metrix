/**
 * Annual Report Router — tRPC procedures for comprehensive annual data.
 *
 * Aggregates attendance, giving, volunteers, FTG, salvations, baptisms,
 * groups, special events, and health metrics for any completed year.
 * Includes YoY comparison with the prior year.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  attendance,
  attendanceMonthly,
  attendanceWeekly,
  giving,
  givingMonthly,
  givingWeekly,
  nextSteps,
  nextStepsMonthly,
  serving,
  servingMonthly,
  groupsAnnual,
  groupsMonthly,
  eventOverrides,
} from "../../drizzle/schema";
import { and, eq, ne, inArray } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MonthlyRow {
  month: number;
  canton: number;
  jasper: number;
  online: number;
  total: number;
}

interface AnnualSummary {
  total: number;
  avgWeekly: number;
  canton: number;
  jasper: number;
  online: number;
}

interface YoYComparison {
  current: number;
  prior: number;
  change: number;
  changePct: number;
}

interface HealthMetric {
  name: string;
  value: number;
  priorValue: number;
  change: number;
  status: "healthy" | "warning" | "critical";
}

interface EventPerformance {
  name: string;
  attendance: number | null;
  giving: number | null;
  ftg: number | null;
  salvations: number | null;
  source: "override" | "weekly" | "estimate";
}

interface DemographicBreakdown {
  name: string; // "Kids", "Students", "Young Adults"
  current: AnnualSummary;
  prior: AnnualSummary;
  monthly: MonthlyRow[];
  monthlyPrior: MonthlyRow[];
  yoy: {
    avgWeekly: YoYComparison;
    total: YoYComparison;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function sumField<T>(rows: T[], fn: (r: T) => number): number {
  return rows.reduce((s, r) => s + (fn(r) || 0), 0);
}

function pctChange(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function getHealthStatus(pct: number): "healthy" | "warning" | "critical" {
  if (pct >= 5) return "healthy";
  if (pct >= -5) return "warning";
  return "critical";
}

// Easter calculation (Anonymous Gregorian algorithm)
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getMothersDay(year: number): Date {
  const may1 = new Date(year, 4, 1);
  const dayOfWeek = may1.getDay();
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return new Date(year, 4, firstSunday + 7);
}

const SPECIAL_EVENTS = [
  { id: "easter", name: "Easter Sunday", getMonth: (y: number) => getEasterDate(y).getMonth() + 1 },
  { id: "mothers_day", name: "Mother's Day", getMonth: (y: number) => getMothersDay(y).getMonth() + 1 },
  { id: "back_to_school", name: "Back to School", getMonth: () => 8 },
  { id: "christmas_eve", name: "Christmas Season", getMonth: () => 12 },
];

// ─── Router ─────────────────────────────────────────────────────────────────

export const annualReportRouter = router({
  /**
   * Get comprehensive annual report data for a given year.
   * Returns all metrics with monthly breakdowns and YoY comparison.
   */
  getData: publicProcedure
    .input(
      z.object({
        year: z.number().min(2014).max(2030),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const { year } = input;
      const priorYear = year - 1;
      const years = [year, priorYear];

      // ── Fetch all data in parallel ────────────────────────────
      const [
        attRows,
        attMonthlyRows,
        attWeeklyRows,
        givRows,
        givMonthlyRows,
        givWeeklyRows,
        nsRows,
        nsMonthlyRows,
        srvRows,
        srvMonthlyRows,
        grpAnnualRows,
        grpMonthlyRows,
        overrideRows,
      ] = await Promise.all([
        db.select().from(attendance).where(inArray(attendance.year, years)),
        db.select().from(attendanceMonthly).where(inArray(attendanceMonthly.year, years)),
        db.select().from(attendanceWeekly).where(inArray(attendanceWeekly.year, years)),
        db.select().from(giving).where(inArray(giving.year, years)),
        db.select().from(givingMonthly).where(inArray(givingMonthly.year, years)),
        db.select().from(givingWeekly).where(inArray(givingWeekly.year, years)),
        db.select().from(nextSteps).where(inArray(nextSteps.year, years)),
        db.select().from(nextStepsMonthly).where(inArray(nextStepsMonthly.year, years)),
        db.select().from(serving).where(
          and(inArray(serving.year, years), ne(serving.campus, "All Campuses"))
        ),
        db.select().from(servingMonthly).where(
          and(inArray(servingMonthly.year, years), ne(servingMonthly.campus, "All Campuses"))
        ),
        db.select().from(groupsAnnual).where(
          and(inArray(groupsAnnual.year, years), ne(groupsAnnual.campus, "All Campuses"))
        ),
        db.select().from(groupsMonthly).where(inArray(groupsMonthly.year, years)),
        db.select().from(eventOverrides).where(inArray(eventOverrides.year, years)),
      ]);

      // ── 1. ATTENDANCE ─────────────────────────────────────────

      function buildAttendanceMonthly(yr: number): MonthlyRow[] {
        return Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          // Use only the main check-in subgroups (not individual demographics)
          const rows = attMonthlyRows.filter(
            (r) => r.year === yr && r.month === m && 
                   (r.subgroup === "Revolution Canton Check-In" || 
                    r.subgroup === "Revolution Jasper Check-In" ||
                    r.subgroup === "Online")
          );
          const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => r.avgWeekly ?? 0);
          const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => r.avgWeekly ?? 0);
          const online = sumField(rows.filter((r) => r.campus === "Online"), (r) => r.avgWeekly ?? 0);
          return { month: m, canton, jasper, online, total: canton + jasper + online };
        });
      }

      function buildAttendanceSummary(yr: number): AnnualSummary {
        // Use the pre-computed "All Campuses" row for avgWeekly (matches Dashboard)
        // Individual campus rows are used for per-campus breakdown cards
        const allCampusRow = attRows.find(
          (r) => r.year === yr && r.subgroup === "Total" && r.campus === "All Campuses"
        );
        const cantonRow = attRows.find((r) => r.year === yr && r.subgroup === "Total" && r.campus === "Canton");
        const jasperRow = attRows.find((r) => r.year === yr && r.subgroup === "Total" && r.campus === "Jasper");
        const onlineRow = attRows.find((r) => r.year === yr && r.subgroup === "Total" && r.campus === "Online");
        const canton = cantonRow?.avgWeekly ?? 0;
        const jasper = jasperRow?.avgWeekly ?? 0;
        const online = onlineRow?.avgWeekly ?? 0;
        // avgWeekly comes from the All Campuses row (same as Dashboard)
        const avgWeekly = allCampusRow?.avgWeekly ?? (canton + jasper + online);
        const totalAtt = allCampusRow?.total ?? ((cantonRow?.total ?? 0) + (jasperRow?.total ?? 0) + (onlineRow?.total ?? 0));
        return { total: totalAtt, avgWeekly, canton, jasper, online };
      }

      const attCurrent = buildAttendanceSummary(year);
      const attPrior = buildAttendanceSummary(priorYear);
      const attMonthly = buildAttendanceMonthly(year);
      const attMonthlyPrior = buildAttendanceMonthly(priorYear);

      // ── DEMOGRAPHICS (Kids, Students, Young Adults) ──────────

      function buildDemographicMonthly(yr: number, subgroupName: string): MonthlyRow[] {
        return Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const rows = attMonthlyRows.filter(
            (r) => r.year === yr && r.month === m && r.subgroup === subgroupName
          );
          const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => r.avgWeekly ?? 0);
          const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => r.avgWeekly ?? 0);
          const online = sumField(rows.filter((r) => r.campus === "Online"), (r) => r.avgWeekly ?? 0);
          return { month: m, canton, jasper, online, total: canton + jasper + online };
        });
      }

      function buildDemographicSummary(yr: number, subgroupName: string): AnnualSummary {
        const rows = attRows.filter(
          (r) => r.year === yr && r.subgroup === subgroupName && r.campus !== "All Campuses"
        );
        const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => r.avgWeekly ?? 0);
        const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => r.avgWeekly ?? 0);
        const online = sumField(rows.filter((r) => r.campus === "Online"), (r) => r.avgWeekly ?? 0);
        const avgWeekly = canton + jasper + online;
        const totalAtt = sumField(rows, (r) => r.total ?? 0);
        return { total: totalAtt, avgWeekly, canton, jasper, online };
      }

      function buildDemographic(yr: number, subgroupName: string): DemographicBreakdown {
        const current = buildDemographicSummary(yr, subgroupName);
        const prior = buildDemographicSummary(yr - 1, subgroupName);
        const monthly = buildDemographicMonthly(yr, subgroupName);
        const monthlyPrior = buildDemographicMonthly(yr - 1, subgroupName);
        return {
          name: subgroupName,
          current,
          prior,
          monthly,
          monthlyPrior,
          yoy: {
            avgWeekly: { current: current.avgWeekly, prior: prior.avgWeekly, change: current.avgWeekly - prior.avgWeekly, changePct: pctChange(current.avgWeekly, prior.avgWeekly) } as YoYComparison,
            total: { current: current.total, prior: prior.total, change: current.total - prior.total, changePct: pctChange(current.total, prior.total) } as YoYComparison,
          },
        };
      }

      const demographics = {
        kids: buildDemographic(year, "Kids"),
        students: buildDemographic(year, "Students"),
        youngAdults: buildDemographic(year, "Young Adults"),
      };

      // ── 2. DEMOGRAPHICS (Kids, Students, Young Adults) ────────

      // ── 3. GIVING ─────────────────────────────────────────────

      function buildGivingMonthly(yr: number): MonthlyRow[] {
        return Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const rows = givMonthlyRows.filter((r) => r.year === yr && r.month === m);
          const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => Number(r.total) || 0);
          const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => Number(r.total) || 0);
          const online = sumField(rows.filter((r) => r.campus === "Online"), (r) => Number(r.total) || 0);
          return { month: m, canton, jasper, online, total: canton + jasper + online };
        });
      }

      function buildGivingSummary(yr: number) {
        const rows = givRows.filter((r) => r.year === yr && r.campus !== "All Campuses");
        const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => Number(r.total) || 0);
        const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => Number(r.total) || 0);
        const online = sumField(rows.filter((r) => r.campus === "Online"), (r) => Number(r.total) || 0);
        const total = canton + jasper + online;
        const general = sumField(rows, (r) => Number(r.general) || 0);
        const designated = sumField(rows, (r) => Number(r.designated) || 0);
        return { total, general, designated, canton, jasper, online };
      }

      const givCurrent = buildGivingSummary(year);
      const givPrior = buildGivingSummary(priorYear);
      const givMonthly = buildGivingMonthly(year);
      const givMonthlyPrior = buildGivingMonthly(priorYear);

      // Giving per capita
      const givingPerCapita = attCurrent.avgWeekly > 0
        ? Math.round(givCurrent.total / attCurrent.avgWeekly)
        : 0;
      const givingPerCapitaPrior = attPrior.avgWeekly > 0
        ? Math.round(givPrior.total / attPrior.avgWeekly)
        : 0;

      // ── 3. VOLUNTEERS ─────────────────────────────────────────

      function buildVolunteerMonthly(yr: number): MonthlyRow[] {
        return Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const rows = srvMonthlyRows.filter((r) => r.year === yr && r.month === m);
          const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => r.total ?? 0);
          const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => r.total ?? 0);
          return { month: m, canton, jasper, online: 0, total: canton + jasper };
        });
      }

      function buildVolunteerSummary(yr: number) {
        const rows = srvRows.filter((r) => r.year === yr);
        const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => r.avgWeekly ?? 0);
        const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => r.avgWeekly ?? 0);
        const avgWeekly = canton + jasper;
        const ratio = attCurrent.avgWeekly > 0
          ? Math.round((avgWeekly / (yr === year ? attCurrent.avgWeekly : attPrior.avgWeekly)) * 1000) / 10
          : 0;
        return { avgWeekly, canton, jasper, ratio };
      }

      const volCurrent = buildVolunteerSummary(year);
      const volPrior = buildVolunteerSummary(priorYear);
      const volMonthly = buildVolunteerMonthly(year);

      // ── 4. NEXT STEPS (FTG, Salvations, Baptisms) ─────────────

      function getMetricTotal(yr: number, metric: string): number {
        return sumField(
          nsRows.filter((r) => r.year === yr && r.metric === metric && r.campus !== "All Campuses"),
          (r) => r.total ?? 0
        );
      }

      function buildNextStepsMonthly(yr: number, metric: string): MonthlyRow[] {
        return Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const rows = nsMonthlyRows.filter(
            (r) => r.year === yr && r.month === m && r.metric === metric
          );
          const canton = sumField(rows.filter((r) => r.campus === "Canton"), (r) => r.count ?? 0);
          const jasper = sumField(rows.filter((r) => r.campus === "Jasper"), (r) => r.count ?? 0);
          const online = sumField(rows.filter((r) => r.campus === "Online"), (r) => r.count ?? 0);
          return { month: m, canton, jasper, online, total: canton + jasper + online };
        });
      }

      const ftgCurrent = getMetricTotal(year, "FTG");
      const ftgPrior = getMetricTotal(priorYear, "FTG");
      const salvCurrent = getMetricTotal(year, "Salvations");
      const salvPrior = getMetricTotal(priorYear, "Salvations");
      const baptCurrent = getMetricTotal(year, "Baptisms");
      const baptPrior = getMetricTotal(priorYear, "Baptisms");

      const ftgMonthly = buildNextStepsMonthly(year, "FTG");
      const salvMonthly = buildNextStepsMonthly(year, "Salvations");
      const baptMonthly = buildNextStepsMonthly(year, "Baptisms");

      // FTG conversion rate (FTG / total attendance * 100)
      const ftgRate = attCurrent.total > 0
        ? Math.round((ftgCurrent / attCurrent.total) * 10000) / 100
        : 0;
      const ftgRatePrior = attPrior.total > 0
        ? Math.round((ftgPrior / attPrior.total) * 10000) / 100
        : 0;

      // ── 5. GROUPS ─────────────────────────────────────────────

      function buildGroupsSummary(yr: number) {
        const rows = grpAnnualRows.filter((r) => r.year === yr);
        return {
          activeGroups: sumField(rows, (r) => r.activeGroups ?? 0),
          totalMembers: sumField(rows, (r) => r.totalMembers ?? 0),
          totalLeaders: sumField(rows, (r) => r.totalLeaders ?? 0),
          avgAttendance: sumField(rows, (r) => r.avgAttendance ?? 0),
        };
      }

      const grpCurrent = buildGroupsSummary(year);
      const grpPrior = buildGroupsSummary(priorYear);

      // ── 6. SPECIAL EVENTS ─────────────────────────────────────

      function getEventPerformance(yr: number): EventPerformance[] {
        return SPECIAL_EVENTS.map((evt) => {
          // Check for manual override first
          const override = overrideRows.find(
            (r) => r.eventName === evt.name && r.year === yr
          );
          if (override) {
            return {
              name: evt.name,
              attendance: override.attendance,
              giving: override.giving !== null ? Number(override.giving) : null,
              ftg: override.ftg,
              salvations: override.salvations,
              source: "override" as const,
            };
          }

          // Check weekly data for 2026+
          const eventMonth = evt.getMonth(yr);
          const weeklyAtt = attWeeklyRows.filter(
            (r) => r.year === yr && r.subgroup === "Total" &&
              new Date(r.weekStartDate + "T00:00:00").getMonth() + 1 === eventMonth
          );
          if (weeklyAtt.length > 0) {
            // Find the peak week in the event month
            const peakWeek = weeklyAtt.reduce((max, r) =>
              (r.headcount ?? 0) > (max.headcount ?? 0) ? r : max, weeklyAtt[0]);
            const weeklyGiv = givWeeklyRows.filter(
              (r) => r.year === yr && r.weekNumber === peakWeek.weekNumber
            );
            return {
              name: evt.name,
              attendance: peakWeek.headcount,
              giving: weeklyGiv.length > 0
                ? sumField(weeklyGiv, (r) => Number(r.total) || 0)
                : null,
              ftg: null,
              salvations: null,
              source: "weekly" as const,
            };
          }

          // Fall back to monthly estimate
          const monthRows = attMonthlyRows.filter(
            (r) => r.year === yr && r.month === eventMonth && r.subgroup === "Total"
          );
          const monthAtt = sumField(monthRows, (r) => r.avgWeekly ?? 0);
          const monthGivRows = givMonthlyRows.filter(
            (r) => r.year === yr && r.month === eventMonth
          );
          const monthGiv = sumField(monthGivRows, (r) => Number(r.total) || 0);

          // Estimate: events typically see ~1.3x normal attendance
          return {
            name: evt.name,
            attendance: monthAtt > 0 ? Math.round(monthAtt * 1.3) : null,
            giving: monthGiv > 0 ? Math.round(monthGiv / 4) : null,
            ftg: null,
            salvations: null,
            source: "estimate" as const,
          };
        });
      }

      const eventsCurrent = getEventPerformance(year);
      const eventsPrior = getEventPerformance(priorYear);

      // ── 7. HEALTH METRICS ─────────────────────────────────────

      const attGrowth = pctChange(attCurrent.avgWeekly, attPrior.avgWeekly);
      const givGrowth = pctChange(givCurrent.total, givPrior.total);
      const volRatioChange = volCurrent.ratio - volPrior.ratio;
      const ftgRateChange = ftgRate - ftgRatePrior;

      const healthMetrics: HealthMetric[] = [
        {
          name: "Attendance Growth",
          value: attGrowth,
          priorValue: 0,
          change: attGrowth,
          status: getHealthStatus(attGrowth),
        },
        {
          name: "Giving Growth",
          value: givGrowth,
          priorValue: 0,
          change: givGrowth,
          status: getHealthStatus(givGrowth),
        },
        {
          name: "Giving Per Capita",
          value: givingPerCapita,
          priorValue: givingPerCapitaPrior,
          change: pctChange(givingPerCapita, givingPerCapitaPrior),
          status: getHealthStatus(pctChange(givingPerCapita, givingPerCapitaPrior)),
        },
        {
          name: "Volunteer Ratio",
          value: volCurrent.ratio,
          priorValue: volPrior.ratio,
          change: volRatioChange,
          status: volCurrent.ratio >= 15 ? "healthy" : volCurrent.ratio >= 10 ? "warning" : "critical",
        },
        {
          name: "FTG Rate",
          value: ftgRate,
          priorValue: ftgRatePrior,
          change: ftgRateChange,
          status: ftgRate >= 1 ? "healthy" : ftgRate >= 0.5 ? "warning" : "critical",
        },
      ];

      // ── Return ────────────────────────────────────────────────

      return {
        meta: { year, priorYear },
        attendance: {
          current: attCurrent,
          prior: attPrior,
          yoy: {
            avgWeekly: { current: attCurrent.avgWeekly, prior: attPrior.avgWeekly, change: attCurrent.avgWeekly - attPrior.avgWeekly, changePct: pctChange(attCurrent.avgWeekly, attPrior.avgWeekly) } as YoYComparison,
            total: { current: attCurrent.total, prior: attPrior.total, change: attCurrent.total - attPrior.total, changePct: pctChange(attCurrent.total, attPrior.total) } as YoYComparison,
          },
          monthly: attMonthly,
          monthlyPrior: attMonthlyPrior,
        },
        giving: {
          current: { ...givCurrent, perCapita: givingPerCapita },
          prior: { ...givPrior, perCapita: givingPerCapitaPrior },
          yoy: {
            total: { current: givCurrent.total, prior: givPrior.total, change: givCurrent.total - givPrior.total, changePct: pctChange(givCurrent.total, givPrior.total) } as YoYComparison,
            perCapita: { current: givingPerCapita, prior: givingPerCapitaPrior, change: givingPerCapita - givingPerCapitaPrior, changePct: pctChange(givingPerCapita, givingPerCapitaPrior) } as YoYComparison,
          },
          monthly: givMonthly,
          monthlyPrior: givMonthlyPrior,
        },
        demographics,
        volunteers: {
          current: volCurrent,
          prior: volPrior,
          monthly: volMonthly,
        },
        nextSteps: {
          ftg: { current: ftgCurrent, prior: ftgPrior, rate: ftgRate, ratePrior: ftgRatePrior, monthly: ftgMonthly },
          salvations: { current: salvCurrent, prior: salvPrior, monthly: salvMonthly },
          baptisms: { current: baptCurrent, prior: baptPrior, monthly: baptMonthly },
        },
        groups: {
          current: grpCurrent,
          prior: grpPrior,
        },
        events: {
          current: eventsCurrent,
          prior: eventsPrior,
        },
        health: healthMetrics,
      };
    }),
});
