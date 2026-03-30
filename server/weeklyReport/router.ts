/**
 * Weekly Report Router — tRPC procedures for weekly snapshot data,
 * comparison options, and auto-generation scheduling.
 *
 * Data approach: Since the DB stores monthly aggregates, we derive
 * weekly averages by dividing monthly totals by the number of weeks
 * in each month. The "most recent week" is the latest month with data.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  attendanceMonthly,
  givingMonthly,
  nextStepsMonthly,
  servingMonthly,
  weeklyReportConfig,
} from "../../drizzle/schema";
import { and, eq, ne } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { invokeLLM } from "../_core/llm";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CampusWeeklyMetrics {
  campus: string;
  attendance: number;
  giving: number;
  volunteers: number;
  ftg: number;
  salvations: number;
  baptisms: number;
}

interface WeeklyPeriod {
  year: number;
  month: number;
  label: string; // e.g. "Mar 2026 (Week 13)"
  weekNumber: number;
  campuses: CampusWeeklyMetrics[];
  totals: CampusWeeklyMetrics;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Approximate weeks in a month (using 4.33 average) */
function weeksInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth / 7;
}

/** Get ISO week number for the last day of a given month */
function getWeekNumber(year: number, month: number): number {
  const lastDay = new Date(year, month, 0); // last day of month
  const startOfYear = new Date(year, 0, 1);
  const diff = lastDay.getTime() - startOfYear.getTime();
  return Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7);
}

/** Build a label like "Mar 2026 (Week 13)" */
function periodLabel(year: number, month: number): string {
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short" });
  const weekNum = getWeekNumber(year, month);
  return `${monthName} ${year} (Week ${weekNum})`;
}

/** Query all monthly data for a given year/month and build campus metrics */
async function getMonthlySnapshot(
  db: any,
  year: number,
  month: number
): Promise<WeeklyPeriod | null> {
  const [attRows, givRows, nsRows, srvRows] = await Promise.all([
    db
      .select()
      .from(attendanceMonthly)
      .where(
        and(
          eq(attendanceMonthly.year, year),
          eq(attendanceMonthly.month, month),
          ne(attendanceMonthly.campus, "All Campuses")
        )
      ),
    db
      .select()
      .from(givingMonthly)
      .where(
        and(
          eq(givingMonthly.year, year),
          eq(givingMonthly.month, month),
          ne(givingMonthly.campus, "All Campuses")
        )
      ),
    db
      .select()
      .from(nextStepsMonthly)
      .where(
        and(
          eq(nextStepsMonthly.year, year),
          eq(nextStepsMonthly.month, month),
          ne(nextStepsMonthly.campus, "All Campuses")
        )
      ),
    db
      .select()
      .from(servingMonthly)
      .where(
        and(
          eq(servingMonthly.year, year),
          eq(servingMonthly.month, month),
          ne(servingMonthly.campus, "All Campuses")
        )
      ),
  ]);

  // If no data at all, return null
  if (attRows.length === 0 && givRows.length === 0 && nsRows.length === 0 && srvRows.length === 0) {
    return null;
  }

  const weeks = weeksInMonth(year, month);
  const campusNames = new Set<string>();

  // Collect campus names
  for (const r of attRows) campusNames.add(r.campus);
  for (const r of givRows) campusNames.add(r.campus);
  for (const r of nsRows) campusNames.add(r.campus);
  for (const r of srvRows) campusNames.add(r.campus);

  const campuses: CampusWeeklyMetrics[] = [];

  for (const campus of Array.from(campusNames)) {
    // Attendance: sum Adults + Kids + Students + Young Adults subgroups, divide by weeks
    const attTotal = attRows
      .filter(
        (r: any) =>
          r.campus === campus &&
          ["Adults", "Kids", "Students", "Young Adults"].includes(r.subgroup)
      )
      .reduce((sum: number, r: any) => sum + r.total, 0);

    // Giving: sum all subgroups for campus, divide by weeks
    const givTotal = givRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + Number(r.total), 0);

    // Next steps metrics
    const ftgTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "FTG")
      .reduce((sum: number, r: any) => sum + r.count, 0);
    const salvationsTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "Salvations")
      .reduce((sum: number, r: any) => sum + r.count, 0);
    const baptismsTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "Baptisms")
      .reduce((sum: number, r: any) => sum + r.count, 0);

    // Serving
    const srvTotal = srvRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + r.total, 0);

    campuses.push({
      campus,
      attendance: Math.round(attTotal / weeks),
      giving: Math.round(givTotal / weeks),
      volunteers: Math.round(srvTotal / weeks),
      ftg: Math.round(ftgTotal / weeks),
      salvations: Math.round(salvationsTotal / weeks),
      baptisms: Math.round(baptismsTotal / weeks),
    });
  }

  // Compute totals
  const totals: CampusWeeklyMetrics = {
    campus: "All Campuses",
    attendance: campuses.reduce((s, c) => s + c.attendance, 0),
    giving: campuses.reduce((s, c) => s + c.giving, 0),
    volunteers: campuses.reduce((s, c) => s + c.volunteers, 0),
    ftg: campuses.reduce((s, c) => s + c.ftg, 0),
    salvations: campuses.reduce((s, c) => s + c.salvations, 0),
    baptisms: campuses.reduce((s, c) => s + c.baptisms, 0),
  };

  return {
    year,
    month,
    label: periodLabel(year, month),
    weekNumber: getWeekNumber(year, month),
    campuses,
    totals,
  };
}

/** Build a YTD period by averaging all months up to and including the given month */
async function getYTDSnapshot(
  db: any,
  year: number,
  throughMonth: number
): Promise<WeeklyPeriod | null> {
  // Collect all months
  const monthSnapshots: WeeklyPeriod[] = [];
  for (let m = 1; m <= throughMonth; m++) {
    const snap = await getMonthlySnapshot(db, year, m);
    if (snap) monthSnapshots.push(snap);
  }

  if (monthSnapshots.length === 0) return null;

  // Aggregate: average across months
  const campusNames = new Set<string>();
  for (const snap of monthSnapshots) {
    for (const c of snap.campuses) campusNames.add(c.campus);
  }

  const campuses: CampusWeeklyMetrics[] = [];
  for (const campus of Array.from(campusNames)) {
    const campusMonths = monthSnapshots
      .map((s) => s.campuses.find((c) => c.campus === campus))
      .filter(Boolean) as CampusWeeklyMetrics[];
    const count = campusMonths.length || 1;

    campuses.push({
      campus,
      attendance: Math.round(campusMonths.reduce((s, c) => s + c.attendance, 0) / count),
      giving: Math.round(campusMonths.reduce((s, c) => s + c.giving, 0) / count),
      volunteers: Math.round(campusMonths.reduce((s, c) => s + c.volunteers, 0) / count),
      ftg: Math.round(campusMonths.reduce((s, c) => s + c.ftg, 0) / count),
      salvations: Math.round(campusMonths.reduce((s, c) => s + c.salvations, 0) / count),
      baptisms: Math.round(campusMonths.reduce((s, c) => s + c.baptisms, 0) / count),
    });
  }

  const totals: CampusWeeklyMetrics = {
    campus: "All Campuses",
    attendance: campuses.reduce((s, c) => s + c.attendance, 0),
    giving: campuses.reduce((s, c) => s + c.giving, 0),
    volunteers: campuses.reduce((s, c) => s + c.volunteers, 0),
    ftg: campuses.reduce((s, c) => s + c.ftg, 0),
    salvations: campuses.reduce((s, c) => s + c.salvations, 0),
    baptisms: campuses.reduce((s, c) => s + c.baptisms, 0),
  };

  const lastMonth = monthSnapshots[monthSnapshots.length - 1];
  return {
    year,
    month: throughMonth,
    label: `YTD ${year} (Jan–${new Date(year, throughMonth - 1, 1).toLocaleString("en-US", { month: "short" })})`,
    weekNumber: lastMonth.weekNumber,
    campuses,
    totals,
  };
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const weeklyReportRouter = router({
  /**
   * Get weekly report data with comparison periods.
   * Returns the current period plus requested comparison periods.
   */
  getData: publicProcedure
    .input(
      z.object({
        year: z.number().min(2014).max(2030).default(2026),
        comparisons: z
          .array(z.enum(["sameWeekLastYear", "previousWeek", "samePeriodLastYear"]))
          .default(["previousWeek"]),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Find the latest month with data for the requested year
      const allAtt = await db
        .select()
        .from(attendanceMonthly)
        .where(eq(attendanceMonthly.year, input.year));
      const maxMonth = allAtt.length > 0 ? Math.max(...allAtt.map((r: any) => r.month)) : 3;

      // Current period: latest month's weekly average
      const current = await getMonthlySnapshot(db, input.year, maxMonth);

      // Build comparison periods
      const comparisons: Record<string, WeeklyPeriod | null> = {};

      for (const comp of input.comparisons) {
        if (comp === "sameWeekLastYear") {
          // Same month, previous year
          comparisons.sameWeekLastYear = await getMonthlySnapshot(db, input.year - 1, maxMonth);
        } else if (comp === "previousWeek") {
          // Previous month (or December of prior year if month=1)
          const prevMonth = maxMonth > 1 ? maxMonth - 1 : 12;
          const prevYear = maxMonth > 1 ? input.year : input.year - 1;
          comparisons.previousWeek = await getMonthlySnapshot(db, prevYear, prevMonth);
        } else if (comp === "samePeriodLastYear") {
          // YTD comparison: same months last year vs this year
          const currentYTD = await getYTDSnapshot(db, input.year, maxMonth);
          const lastYearYTD = await getYTDSnapshot(db, input.year - 1, maxMonth);
          comparisons.samePeriodLastYear = lastYearYTD;
          // Also return current YTD for display
          comparisons.currentYTD = currentYTD;
        }
      }

      return {
        current,
        comparisons,
        meta: {
          year: input.year,
          latestMonth: maxMonth,
          latestWeek: current?.weekNumber ?? 0,
        },
      };
    }),

  /**
   * Get auto-generation schedule config
   */
  getSchedule: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db.select().from(weeklyReportConfig).limit(1);
    if (rows.length === 0) {
      return {
        dayOfWeek: 1,
        hour: 8,
        minute: 0,
        enabled: false,
        lastGeneratedAt: null,
      };
    }
    const r = rows[0];
    return {
      dayOfWeek: r.dayOfWeek,
      hour: r.hour,
      minute: r.minute,
      enabled: r.enabled,
      lastGeneratedAt: r.lastGeneratedAt ? r.lastGeneratedAt.toISOString() : null,
    };
  }),

  /**
   * Save auto-generation schedule
   */
  saveSchedule: protectedProcedure
    .input(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const existing = await db.select().from(weeklyReportConfig).limit(1);

      if (existing.length > 0) {
        await db
          .update(weeklyReportConfig)
          .set({
            dayOfWeek: input.dayOfWeek,
            hour: input.hour,
            minute: input.minute,
            enabled: input.enabled,
          })
          .where(eq(weeklyReportConfig.id, existing[0].id));
      } else {
        await db.insert(weeklyReportConfig).values({
          dayOfWeek: input.dayOfWeek,
          hour: input.hour,
          minute: input.minute,
          enabled: input.enabled,
        });
      }

      return { success: true };
    }),

  /**
   * Manually trigger report generation and send via notification
   */
  generateAndSend: protectedProcedure
    .input(
      z.object({
        year: z.number(),
        comparisons: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get the latest month
      const allAtt = await db
        .select()
        .from(attendanceMonthly)
        .where(eq(attendanceMonthly.year, input.year));
      const maxMonth = allAtt.length > 0 ? Math.max(...allAtt.map((r: any) => r.month)) : 3;

      const current = await getMonthlySnapshot(db, input.year, maxMonth);
      if (!current) throw new Error("No data available for the selected year");

      // Build a text summary
      let summary = `Weekly Report — ${current.label}\n\n`;
      summary += `ALL CAMPUSES:\n`;
      summary += `  Attendance: ${current.totals.attendance}\n`;
      summary += `  Giving: $${current.totals.giving.toLocaleString()}\n`;
      summary += `  Volunteers: ${current.totals.volunteers}\n`;
      summary += `  First-Time Guests: ${current.totals.ftg}\n`;
      summary += `  Salvations: ${current.totals.salvations}\n`;
      summary += `  Baptisms: ${current.totals.baptisms}\n\n`;

      for (const c of current.campuses) {
        summary += `${c.campus.toUpperCase()}:\n`;
        summary += `  Attendance: ${c.attendance}\n`;
        summary += `  Giving: $${c.giving.toLocaleString()}\n`;
        summary += `  Volunteers: ${c.volunteers}\n`;
        summary += `  FTG: ${c.ftg} | Salvations: ${c.salvations} | Baptisms: ${c.baptisms}\n\n`;
      }

      // Generate AI summary
      let aiSummary = "";
      try {
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are a church executive report assistant. Given the following weekly report data, write a concise 2-3 paragraph executive summary highlighting key numbers and any notable observations. Use a professional but warm tone appropriate for church leadership.",
            },
            { role: "user", content: summary },
          ],
        });
        aiSummary =
          typeof llmResult.choices?.[0]?.message?.content === "string"
            ? llmResult.choices[0].message.content
            : "";
      } catch {
        aiSummary = "";
      }

      // Send notification
      const title = `📊 Weekly Report: ${current.label}`;
      const content = aiSummary
        ? `${aiSummary}\n\n---\nDetailed Numbers:\n${summary}`
        : summary;

      const sent = await notifyOwner({ title, content });

      // Update lastGeneratedAt
      const existing = await db.select().from(weeklyReportConfig).limit(1);
      if (existing.length > 0) {
        await db
          .update(weeklyReportConfig)
          .set({ lastGeneratedAt: new Date() })
          .where(eq(weeklyReportConfig.id, existing[0].id));
      }

      return { success: sent, summary: aiSummary || summary };
    }),
});
