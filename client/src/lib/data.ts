// Lumen Metrix — Data Layer v3
// "Light through measurement"
// Rebuilt from raw campus tab sheets for full data integrity

const DATA_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663419960068/EmzMXpmCwkQz2biKeRL4cm/dashboard_data_v3_64787907.json";

// ============================================================
// Raw JSON types (matching v3 schema)
// ============================================================
interface RawAttendance {
  year: number;
  campus: string;
  subgroup: string;
  avg_weekly: number;
  total: number;
}

interface RawAttendanceMonthly {
  year: number;
  campus: string;
  month: number;
  subgroup: string;
  total: number;
  avg_weekly: number;
}

interface RawGiving {
  year: number;
  campus: string;
  general: number;
  designated: number;
  total: number;
}

interface RawGivingMonthly {
  year: number;
  campus: string;
  month: number;
  subgroup: string;
  total: number;
}

interface RawNextSteps {
  year: number;
  campus: string;
  metric: string;
  total: number;
}

interface RawNextStepsMonthly {
  year: number;
  campus: string;
  month: number;
  metric: string;
  count: number;
}

interface RawServing {
  year: number;
  campus: string;
  total: number;
  avg_weekly: number;
}

interface RawServingMonthly {
  year: number;
  campus: string;
  month: number;
  total: number;
}

interface RawDashboard {
  attendance: RawAttendance[];
  giving: RawGiving[];
  next_steps: RawNextSteps[];
  serving: RawServing[];
  years: number[];
  campuses: string[];
  attendance_monthly: RawAttendanceMonthly[];
  giving_monthly: RawGivingMonthly[];
  next_steps_monthly: RawNextStepsMonthly[];
  serving_monthly: RawServingMonthly[];
}

// ============================================================
// Exported types (used by dashboard components)
// ============================================================
export interface AttendanceRecord {
  year: number;
  campus: string;
  subgroup: string;
  avg_weekly: number;
  total: number;
}

export interface AttendanceMonthly {
  year: number;
  month: number;
  campus: string;
  subgroup: string;
  avg_weekly: number;
  total: number;
}

export interface GivingAnnual {
  year: number;
  campus: string;
  general: number;
  designated: number;
  total: number;
}

export interface GivingMonthly {
  year: number;
  month: number;
  campus: string;
  subgroup: string;
  total: number;
}

export interface NextStepsAnnual {
  year: number;
  campus: string;
  metric: string;
  total: number;
}

export interface NextStepsMonthly {
  year: number;
  month: number;
  campus: string;
  metric: string;
  count: number;
}

export interface ServingAnnual {
  year: number;
  campus: string;
  total: number;
  avg_weekly: number;
}

export interface ServingMonthly {
  year: number;
  month: number;
  campus: string;
  total: number;
}

export interface GivingPerCapita {
  year: number;
  campus: string;
  total_giving: number;
  avg_attendance: number;
  giving_per_capita: number;
  weekly_gpc: number;
}

export interface VolunteerRatio {
  year: number;
  campus: string;
  avg_volunteers: number;
  avg_attendance: number;
  ratio: number;
  pct: number;
}

export interface DashboardData {
  attendance: AttendanceRecord[];
  attendance_monthly: AttendanceMonthly[];
  giving: GivingAnnual[];
  giving_monthly: GivingMonthly[];
  next_steps: NextStepsAnnual[];
  next_steps_monthly: NextStepsMonthly[];
  serving: ServingAnnual[];
  serving_monthly: ServingMonthly[];
  computed: {
    giving_per_capita: GivingPerCapita[];
    volunteer_ratio: VolunteerRatio[];
  };
  meta: {
    years: number[];
    campuses: string[];
  };
}

// ============================================================
// Data loading and computation
// ============================================================
let cachedData: DashboardData | null = null;

function computeGPC(
  attendance: RawAttendance[],
  giving: RawGiving[]
): GivingPerCapita[] {
  const results: GivingPerCapita[] = [];
  const campuses = ["Canton", "Jasper", "All Campuses"];

  for (const g of giving) {
    if (!campuses.includes(g.campus)) continue;
    // Find total attendance for this year/campus
    const att = attendance.find(
      (a) => a.year === g.year && a.campus === g.campus && a.subgroup === "Total"
    );
    if (!att || att.avg_weekly === 0) continue;

    const weeks = g.year === 2026 ? 13 : 52;
    const gpc = g.total / att.avg_weekly;
    const weeklyGpc = gpc / weeks;

    results.push({
      year: g.year,
      campus: g.campus,
      total_giving: g.total,
      avg_attendance: att.avg_weekly,
      giving_per_capita: Math.round(gpc),
      weekly_gpc: Math.round(weeklyGpc * 100) / 100,
    });
  }
  return results;
}

function computeVolunteerRatio(
  attendance: RawAttendance[],
  serving: RawServing[]
): VolunteerRatio[] {
  const results: VolunteerRatio[] = [];
  const campuses = ["Canton", "Jasper", "All Campuses"];

  for (const s of serving) {
    if (!campuses.includes(s.campus)) continue;
    const att = attendance.find(
      (a) => a.year === s.year && a.campus === s.campus && a.subgroup === "Total"
    );
    if (!att || att.avg_weekly === 0 || s.avg_weekly === 0) continue;

    const ratio = att.avg_weekly / s.avg_weekly;
    const pct = s.avg_weekly / att.avg_weekly;

    results.push({
      year: s.year,
      campus: s.campus,
      avg_volunteers: s.avg_weekly,
      avg_attendance: att.avg_weekly,
      ratio: Math.round(ratio * 10) / 10,
      pct: Math.round(pct * 1000) / 1000,
    });
  }
  return results;
}

export async function loadDashboardData(): Promise<DashboardData> {
  if (cachedData) return cachedData;
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error("Failed to load dashboard data");
  const raw: RawDashboard = await response.json();

  // Compute derived metrics
  const gpc = computeGPC(raw.attendance, raw.giving);
  const vr = computeVolunteerRatio(raw.attendance, raw.serving);

  cachedData = {
    attendance: raw.attendance,
    attendance_monthly: raw.attendance_monthly,
    giving: raw.giving,
    giving_monthly: raw.giving_monthly,
    next_steps: raw.next_steps,
    next_steps_monthly: raw.next_steps_monthly,
    serving: raw.serving,
    serving_monthly: raw.serving_monthly,
    computed: {
      giving_per_capita: gpc,
      volunteer_ratio: vr,
    },
    meta: {
      years: raw.years,
      campuses: ["Canton", "Jasper", "Online", "All Campuses"],
    },
  };

  return cachedData;
}

// ============================================================
// Brand Colors
// ============================================================
export const CAMPUS_COLORS: Record<string, string> = {
  Canton: "#C2703E",
  Jasper: "#4A7FB5",
  Online: "#8B6DAF",
  "All Campuses": "#E8913A",
};

export const CAMPUS_COLORS_LIGHT: Record<string, string> = {
  Canton: "#F0D4BC",
  Jasper: "#B8D4F0",
  Online: "#D4C4E8",
  "All Campuses": "#F5DDB8",
};

export const CHART_COLORS = [
  "#E8913A", // Lumen Amber
  "#4A7FB5", // Mountain Blue
  "#4A7C59", // Sage Green
  "#8B6DAF", // Soft Violet
  "#C2703E", // Terracotta
  "#D4A843", // Harvest Gold
];

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function getYoYChange(
  current: number,
  previous: number
): { value: number; label: string; positive: boolean } {
  if (!previous || previous === 0)
    return { value: 0, label: "N/A", positive: true };
  const change = ((current - previous) / previous) * 100;
  return {
    value: change,
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    positive: change >= 0,
  };
}

// ============================================================
// Partial-year-aware comparison helpers
// ============================================================

/**
 * Determine the max month with data for a given year.
 * Returns 12 for complete years, or the highest month with data for partial years.
 */
export function getMaxMonth(data: DashboardData, year: number): number {
  const months = new Set<number>();
  for (const r of data.giving_monthly) {
    if (r.year === year) months.add(r.month);
  }
  for (const r of data.attendance_monthly) {
    if (r.year === year) months.add(r.month);
  }
  if (months.size === 0) return 12;
  return Math.max(...Array.from(months));
}

/**
 * Check if a year is partial (less than 12 months of data).
 */
export function isPartialYear(data: DashboardData, year: number): boolean {
  return getMaxMonth(data, year) < 12;
}

/**
 * Get attendance total for specific months of a year/campus.
 * Sums Adults + Kids + Students + Young Adults subgroups for the given months.
 */
export function getAttendanceForMonths(
  data: DashboardData,
  year: number,
  campus: string,
  months: number[]
): { total: number; avgWeekly: number } {
  const mainSubgroups = ["Adults", "Kids", "Students", "Young Adults"];
  let total = 0;
  let weekCount = 0;

  for (const r of data.attendance_monthly) {
    if (r.year === year && months.includes(r.month) && mainSubgroups.includes(r.subgroup)) {
      if (campus === "All Campuses" || r.campus === campus) {
        total += r.total;
      }
    }
  }

  // Estimate weeks from the months
  for (const r of data.attendance_monthly) {
    if (r.year === year && months.includes(r.month) && r.subgroup === "Adults") {
      if (campus === "All Campuses" ? r.campus === "Canton" : r.campus === campus) {
        if (r.avg_weekly > 0 && r.total > 0) {
          weekCount += Math.round(r.total / r.avg_weekly);
        }
      }
    }
  }

  const avgWeekly = weekCount > 0 ? Math.round(total / weekCount) : 0;
  return { total, avgWeekly };
}

/**
 * Get giving total for specific months of a year/campus.
 */
export function getGivingForMonths(
  data: DashboardData,
  year: number,
  campus: string,
  months: number[]
): number {
  let total = 0;
  for (const r of data.giving_monthly) {
    if (r.year === year && months.includes(r.month)) {
      if (campus === "All Campuses" || r.campus === campus) {
        if (r.subgroup === "Tithes and Offerings" || r.subgroup === "General") {
          total += r.total;
        }
      }
    }
  }
  return total;
}

/**
 * Get next steps count for specific months of a year/campus/metric.
 */
export function getNextStepsForMonths(
  data: DashboardData,
  year: number,
  campus: string,
  metric: string,
  months: number[]
): number {
  let total = 0;
  for (const r of data.next_steps_monthly) {
    if (r.year === year && months.includes(r.month) && r.metric === metric) {
      if (campus === "All Campuses" || r.campus === campus) {
        total += r.count;
      }
    }
  }
  return total;
}

/**
 * Compute a partial-year-aware YoY change.
 * If latestYear is partial, compare only the same months from priorYear.
 */
export function getPartialYoYChange(
  data: DashboardData,
  latestYear: number,
  priorYear: number,
  getter: (year: number, months: number[]) => number
): { value: number; label: string; positive: boolean } {
  const maxMonth = getMaxMonth(data, latestYear);
  const months = Array.from({ length: maxMonth }, (_, i) => i + 1);
  const current = getter(latestYear, months);
  const previous = getter(priorYear, months);
  if (!previous || previous === 0) return { value: 0, label: "N/A", positive: true };
  const change = ((current - previous) / previous) * 100;
  return {
    value: change,
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    positive: change >= 0,
  };
}
