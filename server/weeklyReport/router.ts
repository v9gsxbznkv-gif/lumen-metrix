/**
 * Weekly Report Router — tRPC procedures for weekly snapshot data,
 * comparison options, and auto-generation scheduling.
 *
 * Data approach (priority order):
 * 1. Weekly tables (attendance_weekly, giving_weekly) — actual per-Sunday data from PCO
 * 2. Monthly fallback — divide monthly totals by weeks in month when weekly data is absent
 *
 * The "most recent week" is determined from the weekly tables first, then falls back
 * to the latest month with data.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  attendanceMonthly,
  attendanceWeekly,
  givingMonthly,
  givingWeekly,
  groupsMonthly,
  nextStepsMonthly,
  servingMonthly,
  weeklyReportConfig,
} from "../../drizzle/schema";
import { and, eq, ne, desc } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { invokeLLM } from "../_core/llm";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CampusWeeklyMetrics {
  campus: string;
  attendance: number;   // Main Check-In headcount only
  revKids: number;      // Sum of Kids:* subgroups
  revStudents: number;  // RevStudents subgroups
  youngAdults: number;  // YA Gathering
  groups: number;       // Groups avg attendance (monthly ÷ weeks)
  giving: number;       // Weekly giving (or "All Campuses" combined if no per-campus split)
  givingMonthTotal: number; // Monthly giving total for this campus (for reference)
  volunteers: number;
  ftg: number;          // Monthly total ÷ Sundays (estimated weekly)
  salvations: number;   // Monthly total ÷ Sundays (estimated weekly)
  baptisms: number;     // Monthly total (NOT divided — shown as month-to-date)
  baptismsMonthLabel: string; // e.g. "March MTD" to clarify it's a monthly figure
}

interface WeeklyPeriod {
  year: number;
  month: number;
  label: string;
  weekNumber: number;
  campuses: CampusWeeklyMetrics[];
  totals: CampusWeeklyMetrics;
  source: "weekly" | "monthly";
  givingIsCombined: boolean; // true when giving_weekly only has "All Campuses" rows
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Approximate weeks in a month (using actual days / 7) */
function weeksInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth / 7;
}

/** Get ISO week number for the last day of a given month */
function getWeekNumber(year: number, month: number): number {
  const lastDay = new Date(year, month, 0);
  const startOfYear = new Date(year, 0, 1);
  const diff = lastDay.getTime() - startOfYear.getTime();
  return Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7);
}

/** Build a label like "Mar 2026 (Week 13)" */
function periodLabel(year: number, month: number, weekNum?: number): string {
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short" });
  const wk = weekNum ?? getWeekNumber(year, month);
  return `${monthName} ${year} (Week ${wk})`;
}

/** Build a label for a specific week date like "Apr 20, 2025 (Week 16)" */
function weekLabel(weekStartDate: string, weekNumber: number): string {
  const d = new Date(weekStartDate + "T00:00:00");
  const monthName = d.toLocaleString("en-US", { month: "short" });
  return `${monthName} ${d.getDate()}, ${d.getFullYear()} (Week ${weekNumber})`;
}

// ─── Subgroup classification ────────────────────────────────────────────────

/** Main weekend service check-in subgroups — these are the adult headcount */
const PCO_CHECKIN_SUBGROUPS = [
  "Revolution Canton Check-In",
  "Revolution Jasper Check-In",
  "Revolution Online Check-In",
];

/** RevStudents subgroups */
const PCO_STUDENTS_SUBGROUPS = [
  "RevStudents | Canton Campus",
  "RevStudents | Jasper Campus",
  "RevStudents | Online Campus",
];

/** Young Adults subgroups */
const PCO_YOUNG_ADULTS_SUBGROUPS = [
  "YA Gathering",
  "Young Adults",
];

/** Kids subgroups — any subgroup starting with "Kids" or "Kids:" */
function isKidsSubgroup(subgroup: string): boolean {
  return subgroup === "Kids" || subgroup.startsWith("Kids:") || subgroup.startsWith("Kids ");
}

/** Spreadsheet-era subgroups used in monthly fallback */
const SPREADSHEET_ADULTS = ["Adults"];
const SPREADSHEET_STUDENTS = ["Students"];
const SPREADSHEET_KIDS = ["Kids"];
const SPREADSHEET_YOUNG_ADULTS = ["Young Adults"];

/** For monthly fallback: any subgroup that contributes to total attendance */
function isAttendanceSubgroup(subgroup: string): boolean {
  return (
    SPREADSHEET_ADULTS.includes(subgroup) ||
    SPREADSHEET_STUDENTS.includes(subgroup) ||
    SPREADSHEET_KIDS.includes(subgroup) ||
    SPREADSHEET_YOUNG_ADULTS.includes(subgroup) ||
    PCO_CHECKIN_SUBGROUPS.includes(subgroup) ||
    PCO_STUDENTS_SUBGROUPS.includes(subgroup) ||
    PCO_YOUNG_ADULTS_SUBGROUPS.includes(subgroup) ||
    isKidsSubgroup(subgroup)
  );
}

// ─── Weekly Data Snapshot ───────────────────────────────────────────────────

/**
 * Build a WeeklyPeriod from actual weekly data for a specific weekStartDate.
 */
async function getWeeklySnapshot(
  db: any,
  weekStartDate: string,
  weekNumber: number,
  year: number
): Promise<WeeklyPeriod | null> {
  const [attRows, givRows] = await Promise.all([
    db
      .select()
      .from(attendanceWeekly)
      .where(eq(attendanceWeekly.weekStartDate, weekStartDate)),
    db
      .select()
      .from(givingWeekly)
      .where(eq(givingWeekly.weekStartDate, weekStartDate)),
  ]);

  if (attRows.length === 0 && givRows.length === 0) return null;

  // Determine month from the weekStartDate
  const d = new Date(weekStartDate + "T00:00:00");
  const month = d.getMonth() + 1;

  // Check if weekly giving is only available as combined (no per-campus weekly split)
  // We still show per-campus estimates from monthly data in this case
  const givingWeeklyIsCombined = givRows.length > 0 &&
    givRows.every((r: any) => r.campus === "All Campuses");
  // givingIsCombined = true means campus-level giving is estimated from monthly data
  const givingIsCombined = givingWeeklyIsCombined;

  // Get next steps for this month (no weekly granularity for FTG/Salvations/Baptisms)
  const sundaysInMonth = Math.round(weeksInMonth(year, month));
  const monthName = d.toLocaleString("en-US", { month: "long" });
  const nsRows = await db
    .select()
    .from(nextStepsMonthly)
    .where(
      and(
        eq(nextStepsMonthly.year, year),
        eq(nextStepsMonthly.month, month),
        ne(nextStepsMonthly.campus, "All Campuses")
      )
    );

  // Get serving for this month (no weekly granularity)
  const srvRows = await db
    .select()
    .from(servingMonthly)
    .where(
      and(
        eq(servingMonthly.year, year),
        eq(servingMonthly.month, month),
        ne(servingMonthly.campus, "All Campuses")
      )
    );

  // Get groups data for this month (monthly granularity only)
  const grpRows = await db
    .select()
    .from(groupsMonthly)
    .where(
      and(
        eq(groupsMonthly.year, year),
        eq(groupsMonthly.month, month)
      )
    );

  // Get monthly giving for per-campus reference (giving_weekly is combined-only)
  const givMonthRows = await db
    .select()
    .from(givingMonthly)
    .where(
      and(
        eq(givingMonthly.year, year),
        eq(givingMonthly.month, month),
        ne(givingMonthly.campus, "All Campuses")
      )
    );

  // Collect campus names from all sources, but exclude "Other" from main campus list
  // (Young Adults / ESL are cross-campus and will be rolled into totals)
  const campusNames = new Set<string>();
  for (const r of attRows) {
    if (r.campus !== "Other") campusNames.add(r.campus);
  }
  for (const r of givRows) campusNames.add(r.campus);
  for (const r of nsRows) campusNames.add(r.campus);
  for (const r of srvRows) campusNames.add(r.campus);

  const campuses: CampusWeeklyMetrics[] = [];

  for (const campus of Array.from(campusNames)) {
    const campusAtt = attRows.filter((r: any) => r.campus === campus);

    // Attendance: ONLY main Check-In subgroups (not Kids, Students, etc.)
    const attTotal = campusAtt
      .filter((r: any) => PCO_CHECKIN_SUBGROUPS.includes(r.subgroup))
      .reduce((sum: number, r: any) => sum + r.headcount, 0);

    // RevKids: all Kids:* subgroups for this campus
    const revKidsTotal = campusAtt
      .filter((r: any) => isKidsSubgroup(r.subgroup))
      .reduce((sum: number, r: any) => sum + r.headcount, 0);

    // RevStudents: RevStudents subgroups for this campus
    const revStudentsTotal = campusAtt
      .filter((r: any) => PCO_STUDENTS_SUBGROUPS.includes(r.subgroup))
      .reduce((sum: number, r: any) => sum + r.headcount, 0);

    // Giving: use per-campus weekly row if available, otherwise estimate from monthly
    // (giving_weekly often only has "All Campuses" combined)
    const campusGivWeekly = givRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + Number(r.total), 0);
    // Monthly giving for this campus (for reference / fallback)
    const campusGivMonth = givMonthRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + Number(r.total), 0);
    // Use weekly per-campus if non-zero, else estimate from monthly ÷ weeks
    const givTotal = campusGivWeekly > 0
      ? campusGivWeekly
      : (sundaysInMonth > 0 ? campusGivMonth / sundaysInMonth : 0);

    // Next steps: divide monthly by sundays in month for FTG/Salvations
    const ftgTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "FTG")
      .reduce((sum: number, r: any) => sum + r.count, 0);
    const salvationsTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "Salvations")
      .reduce((sum: number, r: any) => sum + r.count, 0);
    // Baptisms: show monthly total (NOT divided) — there is no weekly granularity
    const baptismsMonthTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "Baptisms")
      .reduce((sum: number, r: any) => sum + r.count, 0);

    // Serving: divide monthly by sundays in month
    const srvTotal = srvRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + r.total, 0);

    // Groups: monthly avgAttendance for this campus
    const grpAvg = grpRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + r.avgAttendance, 0);

    campuses.push({
      campus,
      attendance: attTotal,
      revKids: revKidsTotal,
      revStudents: revStudentsTotal,
      youngAdults: 0, // populated in totals from "Other" campus rows
      groups: grpAvg,
      giving: Math.round(givTotal),
      givingMonthTotal: Math.round(campusGivMonth),
      volunteers: sundaysInMonth > 0 ? Math.round(srvTotal / sundaysInMonth) : 0,
      ftg: sundaysInMonth > 0 ? Math.round(ftgTotal / sundaysInMonth) : 0,
      salvations: sundaysInMonth > 0 ? Math.round(salvationsTotal / sundaysInMonth) : 0,
      baptisms: baptismsMonthTotal, // monthly total, not weekly estimate
      baptismsMonthLabel: `${monthName} MTD`,
    });
  }

  // Young Adults: cross-campus, stored under "Other" campus in attendance_weekly
  const yaTotal = attRows
    .filter((r: any) => r.campus === "Other" && PCO_YOUNG_ADULTS_SUBGROUPS.includes(r.subgroup))
    .reduce((sum: number, r: any) => sum + r.headcount, 0);

  // For totals giving: if weekly is combined-only, use the actual combined weekly total
  // (more accurate than summing per-campus monthly estimates)
  const combinedGivingWeekly = givingIsCombined
    ? givRows.filter((r: any) => r.campus === "All Campuses").reduce((sum: number, r: any) => sum + Number(r.total), 0)
    : campuses.reduce((s, c) => s + c.giving, 0);

  const totals: CampusWeeklyMetrics = {
    campus: "All Campuses",
    attendance: campuses.reduce((s, c) => s + c.attendance, 0),
    revKids: campuses.reduce((s, c) => s + c.revKids, 0),
    revStudents: campuses.reduce((s, c) => s + c.revStudents, 0),
    youngAdults: yaTotal,
    groups: campuses.reduce((s, c) => s + c.groups, 0),
    giving: Math.round(combinedGivingWeekly),
    givingMonthTotal: campuses.reduce((s, c) => s + c.givingMonthTotal, 0),
    volunteers: campuses.reduce((s, c) => s + c.volunteers, 0),
    ftg: campuses.reduce((s, c) => s + c.ftg, 0),
    salvations: campuses.reduce((s, c) => s + c.salvations, 0),
    baptisms: campuses.reduce((s, c) => s + c.baptisms, 0),
    baptismsMonthLabel: campuses[0]?.baptismsMonthLabel ?? "",
  };

  return {
    year,
    month,
    label: weekLabel(weekStartDate, weekNumber),
    weekNumber,
    campuses,
    totals,
    source: "weekly",
    givingIsCombined,
  };
}

// ─── Monthly Fallback Snapshot ──────────────────────────────────────────────

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

  if (attRows.length === 0 && givRows.length === 0 && nsRows.length === 0 && srvRows.length === 0) {
    return null;
  }

  const weeks = weeksInMonth(year, month);

  // Also fetch groups monthly data
  const grpRows = await db
    .select()
    .from(groupsMonthly)
    .where(
      and(
        eq(groupsMonthly.year, year),
        eq(groupsMonthly.month, month)
      )
    );

  const campusNames = new Set<string>();
  for (const r of attRows) if (r.campus !== "All Campuses") campusNames.add(r.campus);
  for (const r of givRows) campusNames.add(r.campus);
  for (const r of nsRows) campusNames.add(r.campus);
  for (const r of srvRows) campusNames.add(r.campus);

  const campuses: CampusWeeklyMetrics[] = [];

  for (const campus of Array.from(campusNames)) {
    // Monthly attendance uses subgroup column; filter to Adults/Check-In only
    const campusAtt = attRows.filter((r: any) => r.campus === campus);
    const attTotal = campusAtt
      .filter((r: any) =>
        SPREADSHEET_ADULTS.includes(r.subgroup) ||
        PCO_CHECKIN_SUBGROUPS.includes(r.subgroup)
      )
      .reduce((sum: number, r: any) => sum + r.total, 0);

    const revKidsTotal = campusAtt
      .filter((r: any) =>
        SPREADSHEET_KIDS.includes(r.subgroup) || isKidsSubgroup(r.subgroup)
      )
      .reduce((sum: number, r: any) => sum + r.total, 0);

    const revStudentsTotal = campusAtt
      .filter((r: any) =>
        SPREADSHEET_STUDENTS.includes(r.subgroup) ||
        PCO_STUDENTS_SUBGROUPS.includes(r.subgroup)
      )
      .reduce((sum: number, r: any) => sum + r.total, 0);

    const youngAdultsTotal = campusAtt
      .filter((r: any) =>
        SPREADSHEET_YOUNG_ADULTS.includes(r.subgroup) ||
        PCO_YOUNG_ADULTS_SUBGROUPS.includes(r.subgroup)
      )
      .reduce((sum: number, r: any) => sum + r.total, 0);

    const givTotal = givRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + Number(r.total), 0);

    const ftgTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "FTG")
      .reduce((sum: number, r: any) => sum + r.count, 0);
    const salvationsTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "Salvations")
      .reduce((sum: number, r: any) => sum + r.count, 0);
    const baptismsTotal = nsRows
      .filter((r: any) => r.campus === campus && r.metric === "Baptisms")
      .reduce((sum: number, r: any) => sum + r.count, 0);

    const srvTotal = srvRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + r.total, 0);

    const grpAvg = grpRows
      .filter((r: any) => r.campus === campus)
      .reduce((sum: number, r: any) => sum + r.avgAttendance, 0);

    const monthNameStr = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });
    campuses.push({
      campus,
      attendance: Math.round(attTotal / weeks),
      revKids: Math.round(revKidsTotal / weeks),
      revStudents: Math.round(revStudentsTotal / weeks),
      youngAdults: Math.round(youngAdultsTotal / weeks),
      groups: grpAvg,
      giving: Math.round(givTotal / weeks),
      givingMonthTotal: Math.round(givTotal),
      volunteers: Math.round(srvTotal / weeks),
      ftg: Math.round(ftgTotal / weeks),
      salvations: Math.round(salvationsTotal / weeks),
      baptisms: baptismsTotal, // monthly total, not divided
      baptismsMonthLabel: `${monthNameStr} MTD`,
    });
  }

  const totals: CampusWeeklyMetrics = {
    campus: "All Campuses",
    attendance: campuses.reduce((s, c) => s + c.attendance, 0),
    revKids: campuses.reduce((s, c) => s + c.revKids, 0),
    revStudents: campuses.reduce((s, c) => s + c.revStudents, 0),
    youngAdults: campuses.reduce((s, c) => s + c.youngAdults, 0),
    groups: campuses.reduce((s, c) => s + c.groups, 0),
    giving: campuses.reduce((s, c) => s + c.giving, 0),
    givingMonthTotal: campuses.reduce((s, c) => s + c.givingMonthTotal, 0),
    volunteers: campuses.reduce((s, c) => s + c.volunteers, 0),
    ftg: campuses.reduce((s, c) => s + c.ftg, 0),
    salvations: campuses.reduce((s, c) => s + c.salvations, 0),
    baptisms: campuses.reduce((s, c) => s + c.baptisms, 0),
    baptismsMonthLabel: campuses[0]?.baptismsMonthLabel ?? "",
  };

  return {
    year,
    month,
    label: periodLabel(year, month),
    weekNumber: getWeekNumber(year, month),
    campuses,
    totals,
    source: "monthly",
    givingIsCombined: false,
  };
}

/** Build a YTD period by averaging all months up to and including the given month */
async function getYTDSnapshot(
  db: any,
  year: number,
  throughMonth: number
): Promise<WeeklyPeriod | null> {
  const monthSnapshots: WeeklyPeriod[] = [];
  for (let m = 1; m <= throughMonth; m++) {
    const snap = await getMonthlySnapshot(db, year, m);
    if (snap) monthSnapshots.push(snap);
  }

  if (monthSnapshots.length === 0) return null;

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
      revKids: Math.round(campusMonths.reduce((s, c) => s + c.revKids, 0) / count),
      revStudents: Math.round(campusMonths.reduce((s, c) => s + c.revStudents, 0) / count),
      youngAdults: Math.round(campusMonths.reduce((s, c) => s + c.youngAdults, 0) / count),
      groups: Math.round(campusMonths.reduce((s, c) => s + c.groups, 0) / count),
      giving: Math.round(campusMonths.reduce((s, c) => s + c.giving, 0) / count),
      givingMonthTotal: Math.round(campusMonths.reduce((s, c) => s + c.givingMonthTotal, 0) / count),
      volunteers: Math.round(campusMonths.reduce((s, c) => s + c.volunteers, 0) / count),
      ftg: Math.round(campusMonths.reduce((s, c) => s + c.ftg, 0) / count),
      salvations: Math.round(campusMonths.reduce((s, c) => s + c.salvations, 0) / count),
      baptisms: Math.round(campusMonths.reduce((s, c) => s + c.baptisms, 0) / count),
      baptismsMonthLabel: campusMonths[0]?.baptismsMonthLabel ?? "",
    });
  }

  const totals: CampusWeeklyMetrics = {
    campus: "All Campuses",
    attendance: campuses.reduce((s, c) => s + c.attendance, 0),
    revKids: campuses.reduce((s, c) => s + c.revKids, 0),
    revStudents: campuses.reduce((s, c) => s + c.revStudents, 0),
    youngAdults: campuses.reduce((s, c) => s + c.youngAdults, 0),
    groups: campuses.reduce((s, c) => s + c.groups, 0),
    giving: campuses.reduce((s, c) => s + c.giving, 0),
    givingMonthTotal: campuses.reduce((s, c) => s + c.givingMonthTotal, 0),
    volunteers: campuses.reduce((s, c) => s + c.volunteers, 0),
    ftg: campuses.reduce((s, c) => s + c.ftg, 0),
    salvations: campuses.reduce((s, c) => s + c.salvations, 0),
    baptisms: campuses.reduce((s, c) => s + c.baptisms, 0),
    baptismsMonthLabel: campuses[0]?.baptismsMonthLabel ?? "",
  };

  const lastMonth = monthSnapshots[monthSnapshots.length - 1];
  return {
    year,
    month: throughMonth,
    label: `YTD ${year} (Jan–${new Date(year, throughMonth - 1, 1).toLocaleString("en-US", { month: "short" })})`,
    weekNumber: lastMonth.weekNumber,
    campuses,
    totals,
    source: "monthly",
    givingIsCombined: false,
  };
}

// ─── Smart Snapshot: tries weekly first, falls back to monthly ──────────────

/**
 * Get the most recent weekly snapshot for a given year.
 * Falls back to monthly if no weekly data exists.
 */
async function getLatestSnapshot(
  db: any,
  year: number
): Promise<{ snapshot: WeeklyPeriod | null; latestMonth: number; latestWeekDate: string | null }> {
  // Try weekly data first
  const latestWeekRow = await db
    .select()
    .from(attendanceWeekly)
    .where(eq(attendanceWeekly.year, year))
    .orderBy(desc(attendanceWeekly.weekNumber))
    .limit(1);

  if (latestWeekRow.length > 0) {
    const row = latestWeekRow[0];
    const snapshot = await getWeeklySnapshot(db, row.weekStartDate, row.weekNumber, year);
    const d = new Date(row.weekStartDate + "T00:00:00");
    return {
      snapshot,
      latestMonth: d.getMonth() + 1,
      latestWeekDate: row.weekStartDate,
    };
  }

  // Fall back to monthly
  const allAtt = await db
    .select()
    .from(attendanceMonthly)
    .where(eq(attendanceMonthly.year, year));
  const maxMonth = allAtt.length > 0 ? Math.max(...allAtt.map((r: any) => r.month)) : 3;
  const snapshot = await getMonthlySnapshot(db, year, maxMonth);
  return { snapshot, latestMonth: maxMonth, latestWeekDate: null };
}

/**
 * Get a snapshot for a specific week offset from a reference weekStartDate.
 * offset=-1 means previous week, offset=0 means same week.
 */
function offsetWeekDate(weekStartDate: string, offsetWeeks: number): string {
  const d = new Date(weekStartDate + "T00:00:00");
  d.setDate(d.getDate() + offsetWeeks * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const weeklyReportRouter = router({
  /**
   * Get weekly report data with comparison periods.
   * Prefers actual weekly data from PCO; falls back to monthly estimates.
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

      const { snapshot: current, latestMonth, latestWeekDate } = await getLatestSnapshot(db, input.year);

      // Build comparison periods
      const comparisons: Record<string, WeeklyPeriod | null> = {};

      for (const comp of input.comparisons) {
        if (comp === "sameWeekLastYear") {
          if (latestWeekDate) {
            // Same week date, previous year
            const lastYearDate = offsetWeekDate(latestWeekDate, 0).replace(
              /^\d{4}/,
              String(input.year - 1)
            );
            const wk = getISOWeekNumber(lastYearDate);
            comparisons.sameWeekLastYear = await getWeeklySnapshot(db, lastYearDate, wk, input.year - 1)
              ?? await getMonthlySnapshot(db, input.year - 1, latestMonth);
          } else {
            comparisons.sameWeekLastYear = await getMonthlySnapshot(db, input.year - 1, latestMonth);
          }
        } else if (comp === "previousWeek") {
          if (latestWeekDate) {
            // Previous week from weekly data
            const prevDate = offsetWeekDate(latestWeekDate, -1);
            const prevYear = new Date(prevDate + "T00:00:00").getFullYear();
            const prevWk = getISOWeekNumber(prevDate);
            comparisons.previousWeek = await getWeeklySnapshot(db, prevDate, prevWk, prevYear);
            // Fall back to monthly if no weekly data for previous week
            if (!comparisons.previousWeek) {
              const prevMonth = latestMonth > 1 ? latestMonth - 1 : 12;
              const prevYr = latestMonth > 1 ? input.year : input.year - 1;
              comparisons.previousWeek = await getMonthlySnapshot(db, prevYr, prevMonth);
            }
          } else {
            const prevMonth = latestMonth > 1 ? latestMonth - 1 : 12;
            const prevYear = latestMonth > 1 ? input.year : input.year - 1;
            comparisons.previousWeek = await getMonthlySnapshot(db, prevYear, prevMonth);
          }
        } else if (comp === "samePeriodLastYear") {
          const currentYTD = await getYTDSnapshot(db, input.year, latestMonth);
          const lastYearYTD = await getYTDSnapshot(db, input.year - 1, latestMonth);
          comparisons.samePeriodLastYear = lastYearYTD;
          comparisons.currentYTD = currentYTD;
        }
      }

      return {
        current,
        comparisons,
        meta: {
          year: input.year,
          latestMonth,
          latestWeek: current?.weekNumber ?? 0,
          source: current?.source ?? "monthly",
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
        deliveryEmail: "",
        lastGeneratedAt: null,
      };
    }
    const r = rows[0];
    return {
      dayOfWeek: r.dayOfWeek,
      hour: r.hour,
      minute: r.minute,
      enabled: r.enabled,
      deliveryEmail: r.deliveryEmail ?? "",
      lastGeneratedAt: r.lastGeneratedAt ? r.lastGeneratedAt.toISOString() : null,
    };
  }),

  /**
   * Save auto-generation schedule
   */
  saveSchedule: publicProcedure
    .input(
      z.object({
        dayOfWeek: z.number().min(0).max(6),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
        enabled: z.boolean(),
        deliveryEmail: z.string().email().optional().or(z.literal("")),
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
            deliveryEmail: input.deliveryEmail || null,
          })
          .where(eq(weeklyReportConfig.id, existing[0].id));
      } else {
        await db.insert(weeklyReportConfig).values({
          dayOfWeek: input.dayOfWeek,
          hour: input.hour,
          minute: input.minute,
          enabled: input.enabled,
          deliveryEmail: input.deliveryEmail || null,
        });
      }

      return { success: true };
    }),

  /**
   * Manually trigger report generation and send via notification.
   * Uses weekly data when available.
   */
  generateAndSend: publicProcedure
    .input(
      z.object({
        year: z.number(),
        comparisons: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { snapshot: current } = await getLatestSnapshot(db, input.year);
      if (!current) throw new Error("No data available for the selected year");

      // Build a text summary
      let summary = `Weekly Report — ${current.label}\n`;
      summary += `Data source: ${current.source === "weekly" ? "PCO weekly data" : "Monthly estimate"}\n\n`;
      summary += `ALL CAMPUSES:\n`;
      summary += `  Attendance (Check-In): ${current.totals.attendance}\n`;
      summary += `  RevKids: ${current.totals.revKids}\n`;
      summary += `  RevStudents: ${current.totals.revStudents}\n`;
      summary += `  Young Adults: ${current.totals.youngAdults}\n`;
      summary += `  Groups: ${current.totals.groups}\n`;
      summary += `  Giving: $${current.totals.giving.toLocaleString()}\n`;
      summary += `  Volunteers: ${current.totals.volunteers}\n`;
      summary += `  First-Time Guests: ${current.totals.ftg}\n`;
      summary += `  Salvations: ${current.totals.salvations}\n`;
      summary += `  Baptisms: ${current.totals.baptisms}\n\n`;

      for (const c of current.campuses) {
        summary += `${c.campus.toUpperCase()}:\n`;
        summary += `  Attendance: ${c.attendance} | Kids: ${c.revKids} | Students: ${c.revStudents}\n`;
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

      // Build Markdown email
      const sourceNote = current.source === "weekly"
        ? "📊 *Data from PCO weekly check-ins and donations*"
        : "📊 *Data estimated from monthly averages (run Weekly Sync for exact numbers)*";

      const campusMdRows = current.campuses
        .map(c => `| **${c.campus}** | ${c.attendance.toLocaleString()} | ${c.revKids.toLocaleString()} | ${c.revStudents.toLocaleString()} | $${c.giving.toLocaleString()} | ${c.volunteers} | ${c.ftg} | ${c.salvations} | ${c.baptisms} |`)
        .join('\n');

      const mdContent = [
        `<div style="background:#1C1917;padding:18px 24px;border-radius:8px 8px 0 0;display:inline-flex;align-items:center;gap:10px;"><svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="24" width="5" height="14" rx="1.5" fill="#E8913A" transform="rotate(-10 4 24)" opacity="0.7"/><rect x="10" y="14" width="5.5" height="22" rx="1.5" fill="#E8913A" transform="rotate(-2 10 14)" opacity="0.85"/><rect x="18" y="6" width="6" height="30" rx="1.5" fill="#E8913A"/><rect x="26" y="12" width="5.5" height="24" rx="1.5" fill="#C47A2E" transform="rotate(4 26 12)" opacity="0.75"/><circle cx="21" cy="4" r="2" fill="#F5C882" opacity="0.6"/></svg><span style="font-family:Arial,sans-serif;font-weight:700;font-size:17px;letter-spacing:0.06em;color:#FFFFFF;">LUMEN</span><span style="font-family:Arial,sans-serif;font-weight:400;font-size:17px;letter-spacing:0.06em;color:rgba(255,255,255,0.55);"> METRIX</span></div>`,
        ``,
        `## 📊 Weekly Report — ${current.label}`,
        ``,
        sourceNote,
        ``,
        `---`,
        ``,
        `### All Campuses`,
        ``,
        `| Attendance | RevKids | RevStudents | Young Adults | Groups | Giving | Volunteers | FTG | Salvations | Baptisms |`,
        `|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|`,
        `| **${current.totals.attendance.toLocaleString()}** | **${current.totals.revKids.toLocaleString()}** | **${current.totals.revStudents.toLocaleString()}** | **${current.totals.youngAdults.toLocaleString()}** | **${current.totals.groups.toLocaleString()}** | **$${current.totals.giving.toLocaleString()}** | **${current.totals.volunteers.toLocaleString()}** | **${current.totals.ftg}** | **${current.totals.salvations}** | **${current.totals.baptisms}** |`,
        ``,
        `---`,
        ``,
        `### Campus Breakdown`,
        ``,
        `| Campus | Attendance | RevKids | RevStudents | Giving | Volunteers | FTG | Salvations | Baptisms |`,
        `|:---|---:|---:|---:|---:|---:|---:|---:|---:|`,
        campusMdRows,
        ``,
        ...(aiSummary ? [
          `---`,
          ``,
          `### Executive Summary`,
          ``,
          aiSummary,
          ``,
        ] : []),
        `---`,
        ``,
        `*Generated by **LUMEN METRIX** — Revolution Church Executive Dashboard*`,
      ].join('\n');

      // Send notification
      const title = `📊 Weekly Report: ${current.label}`;
      const sent = await notifyOwner({ title, content: mdContent });

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
