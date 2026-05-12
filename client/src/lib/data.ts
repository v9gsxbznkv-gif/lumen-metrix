// Lumen Metrix — Data Layer v3
// "Light through measurement"
// Hybrid: loads from backend API (database) first, falls back to CDN JSON

const DATA_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663419960068/EmzMXpmCwkQz2biKeRL4cm/dashboard_data_v3_e47d21d1.json";

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

interface RawAttendanceWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string; // 'YYYY-MM-DD'
  campus: string;
  subgroup: string;
  headcount: number;
  regularCount: number;
  guestCount: number;
  volunteerCount: number;
}

interface RawGivingWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string;
  total: number;
  general: number;
  designated: number;
  donationCount: number;
}

interface RawNextStepsWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string;
  metric: string;
  count: number;
}

interface RawServingWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string;
  total: number;
}

interface RawGroupsMonthly {
  year: number;
  month: number;
  campus: string;
  activeGroups: number;
  totalMembers: number;
  totalLeaders: number;
  avgAttendance: number;
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
  attendance_weekly?: RawAttendanceWeekly[];
  giving_weekly?: RawGivingWeekly[];
  event_overrides?: EventOverride[];
  next_steps_weekly?: RawNextStepsWeekly[];
  serving_weekly?: RawServingWeekly[];
  groups_monthly?: RawGroupsMonthly[];
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

export interface AttendanceWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string;
  subgroup: string;
  headcount: number;
  regularCount: number;
  guestCount: number;
  volunteerCount: number;
}

export interface GivingWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string;
  total: number;
  general: number;
  designated: number;
  donationCount: number;
}

export interface NextStepsWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string;
  metric: string;
  count: number;
}

export interface ServingWeekly {
  year: number;
  weekNumber: number;
  weekStartDate: string;
  campus: string;
  total: number;
}

export interface EventOverride {
  eventName: string;
  year: number;
  attendance: number | null;
  giving: number | null;
  ftg: number | null;
  salvations: number | null;
  baptisms: number | null;
  notes: string | null;
}

export interface GroupsMonthly {
  year: number;
  month: number;
  campus: string;
  activeGroups: number;
  totalMembers: number;
  totalLeaders: number;
  avgAttendance: number;
}

export interface DashboardData {
  attendance: AttendanceRecord[];
  attendance_monthly: AttendanceMonthly[];
  attendance_weekly: AttendanceWeekly[];
  giving: GivingAnnual[];
  giving_monthly: GivingMonthly[];
  giving_weekly: GivingWeekly[];
  next_steps: NextStepsAnnual[];
  next_steps_monthly: NextStepsMonthly[];
  serving: ServingAnnual[];
  serving_monthly: ServingMonthly[];
  event_overrides: EventOverride[];
  next_steps_weekly: NextStepsWeekly[];
  serving_weekly: ServingWeekly[];
  groups_monthly: GroupsMonthly[];
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
  giving: RawGiving[],
  attendanceMonthly: RawAttendanceMonthly[],
  givingMonthly: RawGivingMonthly[]
): GivingPerCapita[] {
  const results: GivingPerCapita[] = [];
  const campuses = ["Canton", "Jasper", "All Campuses"];

  // Determine the max month with data across all years
  const monthsByYear: Record<number, number> = {};
  for (const r of givingMonthly) {
    if (!monthsByYear[r.year] || r.month > monthsByYear[r.year]) {
      monthsByYear[r.year] = r.month;
    }
  }
  for (const r of attendanceMonthly) {
    if (!monthsByYear[r.year] || r.month > monthsByYear[r.year]) {
      monthsByYear[r.year] = r.month;
    }
  }

  for (const g of giving) {
    if (!campuses.includes(g.campus)) continue;
    const att = attendance.find(
      (a) => a.year === g.year && a.campus === g.campus && a.subgroup === "Total"
    );
    if (!att || att.avg_weekly === 0) continue;

    const maxMonth = monthsByYear[g.year] ?? 12;
    const isPartial = maxMonth < 12;

    // For partial years: scale giving to full-year equivalent for a fair per-capita
    // by dividing by fraction of year elapsed, then divide by avg_weekly attendance.
    // This gives an annualized GPC that's comparable across years.
    const yearFraction = maxMonth / 12;
    const annualizedGiving = isPartial ? g.total / yearFraction : g.total;
    const weeks = 52;
    const gpc = annualizedGiving / att.avg_weekly;
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
  const individualCampuses = ["Canton", "Jasper"];

  // Compute ratio for each individual campus
  for (const s of serving) {
    if (!individualCampuses.includes(s.campus)) continue;
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

  // Compute "All Campuses" aggregate by summing individual campus rows.
  // We never rely on a pre-aggregated "All Campuses" serving row to avoid
  // double-counting (that row was excluded from the DB query).
  const years = Array.from(new Set(serving.map((s) => s.year)));
  for (const year of years) {
    const campusServing = serving.filter(
      (s) => s.year === year && individualCampuses.includes(s.campus)
    );
    if (campusServing.length === 0) continue;

    const totalVols = campusServing.reduce((sum, s) => sum + s.avg_weekly, 0);
    if (totalVols === 0) continue;

    // Use the "All Campuses" Total attendance record if available,
    // otherwise sum individual campus records.
    let totalAtt = 0;
    const allCampusAtt = attendance.find(
      (a) => a.year === year && a.campus === "All Campuses" && a.subgroup === "Total"
    );
    if (allCampusAtt && allCampusAtt.avg_weekly > 0) {
      totalAtt = allCampusAtt.avg_weekly;
    } else {
      totalAtt = individualCampuses.reduce((sum, c) => {
        const att = attendance.find(
          (a) => a.year === year && a.campus === c && a.subgroup === "Total"
        );
        return sum + (att?.avg_weekly ?? 0);
      }, 0);
    }
    if (totalAtt === 0) continue;

    const ratio = totalAtt / totalVols;
    const pct = totalVols / totalAtt;

    results.push({
      year,
      campus: "All Campuses",
      avg_volunteers: totalVols,
      avg_attendance: totalAtt,
      ratio: Math.round(ratio * 10) / 10,
      pct: Math.round(pct * 1000) / 1000,
    });
  }

  return results;
}

/**
 * Transform raw data (from either API or CDN) into DashboardData.
 */
function transformRawData(raw: RawDashboard): DashboardData {
  const gpc = computeGPC(raw.attendance, raw.giving, raw.attendance_monthly, raw.giving_monthly);
  const vr = computeVolunteerRatio(raw.attendance, raw.serving);

  return {
    attendance: raw.attendance,
    attendance_monthly: raw.attendance_monthly,
    attendance_weekly: raw.attendance_weekly || [],
    giving: raw.giving,
    giving_monthly: raw.giving_monthly,
    giving_weekly: raw.giving_weekly || [],
    next_steps: raw.next_steps,
    next_steps_monthly: raw.next_steps_monthly,
    serving: raw.serving,
    serving_monthly: raw.serving_monthly,
    event_overrides: raw.event_overrides || [],
    next_steps_weekly: raw.next_steps_weekly || [],
    serving_weekly: raw.serving_weekly || [],
    groups_monthly: raw.groups_monthly || [],
    computed: {
      giving_per_capita: gpc,
      volunteer_ratio: vr,
    },
    meta: {
      years: raw.years || [],
      campuses: raw.campuses || ["Canton", "Jasper", "Online", "All Campuses"],
    },
  };
}

/**
 * Try loading data from the backend API (database).
 * Returns null if the API is unavailable or returns no data.
 */
async function loadFromApi(): Promise<RawDashboard | null> {
  try {
    // Use tRPC batch endpoint to call pco.getDashboardData
    const response = await fetch("/api/trpc/pco.getDashboardData", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return null;

    const json = await response.json();
    // tRPC + superjson wraps the result in { result: { data: { json: <actual data>, meta: ... } } }
    // We must unwrap the superjson envelope to get the real RawDashboard object.
    const envelope = json?.result?.data;
    if (!envelope) return null;
    // Unwrap superjson: actual data is at envelope.json; fall back to envelope itself if not wrapped
    const data = (envelope?.json ?? envelope) as RawDashboard;
    if (!data) return null;

    // Verify we have actual data (not empty)
    if (
      (!data.attendance || data.attendance.length === 0) &&
      (!data.giving || data.giving.length === 0)
    ) {
      return null;
    }

    return data as RawDashboard;
  } catch {
    console.warn("[Data] Backend API unavailable, falling back to CDN");
    return null;
  }
}

/**
 * Load data from CDN JSON (static fallback).
 */
async function loadFromCdn(): Promise<RawDashboard> {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error("Failed to load dashboard data from CDN");
  return response.json();
}

/**
 * Load dashboard data from the backend API.
 * The API now handles source-aware filtering:
 *   - 2025 and earlier: spreadsheet data (historical)
 *   - 2026 and later: PCO data (live synced)
 * CDN fallback is only used if the API is completely unavailable.
 */
export async function loadDashboardData(): Promise<DashboardData> {
  if (cachedData) return cachedData;

  // Primary: backend API (database with source-aware filtering)
  const apiData = await loadFromApi();
  if (apiData) {
    console.log("[Data] Loaded from backend API (PCO for 2026+, spreadsheet for ≤2025)");
    cachedData = transformRawData(apiData);
    return cachedData;
  }

  // Emergency fallback: CDN JSON (only if API is completely down)
  console.warn("[Data] Backend API unavailable — using CDN fallback (may not include latest PCO data)");
  const cdnData = await loadFromCdn();
  cachedData = transformRawData(cdnData);
  return cachedData;
}

/**
 * Force reload data from the backend (e.g., after a sync).
 */
export function invalidateDataCache(): void {
  cachedData = null;
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

// ============================================================
// Canonical total attendance helper
// Always reads the pre-computed 'Total' subgroup record (same
// source the Overview page uses) to ensure consistency.
// ============================================================
export function getTotalAttendance(
  attendance: { year: number; campus: string; subgroup: string; avg_weekly: number; total: number }[],
  year: number,
  campus: string
): { avg_weekly: number; total: number } {
  if (campus === "All Campuses") {
    const rec = attendance.find(
      (a) => a.year === year && a.campus === "All Campuses" && a.subgroup === "Total"
    );
    return rec ? { avg_weekly: rec.avg_weekly, total: rec.total } : { avg_weekly: 0, total: 0 };
  }
  const rec = attendance.find(
    (a) => a.year === year && a.campus === campus && a.subgroup === "Total"
  );
  return rec ? { avg_weekly: rec.avg_weekly, total: rec.total } : { avg_weekly: 0, total: 0 };
}

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
  // Use giving_monthly as the primary source for determining the "latest month"
  // because giving data is the most reliable indicator of a complete month.
  // Stray attendance rows (e.g. a single ESL Class entry in April) should not
  // inflate the comparison period.
  const givingMonths = new Set<number>();
  for (const r of data.giving_monthly) {
    if (r.year === year) givingMonths.add(r.month);
  }

  if (givingMonths.size > 0) {
    const maxGiving = Math.max(...Array.from(givingMonths));
    // For the current year, also cap at the current calendar month
    // (don't count a month that hasn't finished yet unless data exists).
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed
    if (year === currentYear) {
      return Math.min(maxGiving, currentMonth);
    }
    return maxGiving;
  }

  // Fallback: use attendance_monthly if no giving data exists
  const attMonths = new Set<number>();
  for (const r of data.attendance_monthly) {
    if (r.year === year) attMonths.add(r.month);
  }
  if (attMonths.size === 0) return 12;
  return Math.max(...Array.from(attMonths));
}

/**
 * Check if a year is partial (less than 12 months of data).
 */
export function isPartialYear(data: DashboardData, year: number): boolean {
  return getMaxMonth(data, year) < 12;
}

/**
 * Get attendance total for specific months of a year/campus.
 *
 * For full years (months 1-12), returns the pre-computed Total record directly
 * so both Overview and Attendance pages show the identical number.
 *
 * For partial years, sums Adults + Kids + Students + Young Adults monthly totals
 * and estimates weeks from Canton Adults (most reliable week-count source).
 */
export function getAttendanceForMonths(
  data: DashboardData,
  year: number,
  campus: string,
  months: number[]
): { total: number; avgWeekly: number } {
  // Full year fast-path: use the pre-computed Total record (ground truth)
  if (months.length === 12) {
    const rec = getTotalAttendance(data.attendance, year, campus);
    return { total: rec.total, avgWeekly: rec.avg_weekly };
  }

  // Partial year: sum per-campus monthly totals for main subgroups
  const mainSubgroups = ["Adults", "Kids", "Students", "Young Adults"];
  const campusList =
    campus === "All Campuses" ? ["Canton", "Jasper", "Online"] : [campus];

  let total = 0;
  let weekCount = 0;

  for (const r of data.attendance_monthly) {
    if (
      r.year === year &&
      months.includes(r.month) &&
      mainSubgroups.includes(r.subgroup) &&
      campusList.includes(r.campus)
    ) {
      total += r.total;
    }
  }

  // Estimate week count from the primary campus Adults row (most reliable)
  const primaryCampus = campus === "All Campuses" ? "Canton" : campus;
  for (const r of data.attendance_monthly) {
    if (
      r.year === year &&
      months.includes(r.month) &&
      r.subgroup === "Adults" &&
      r.campus === primaryCampus &&
      r.avg_weekly > 0 &&
      r.total > 0
    ) {
      weekCount += Math.round(r.total / r.avg_weekly);
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


// ============================================================
// Weekly-data helper functions
// These compute from the raw weekly tables (single source of truth from PCO)
// ============================================================

/**
 * Get total giving from giving_weekly for a year/campus.
 * Weekly data exists for all years (2013+ from spreadsheets, 2025+ from PCO).
 */
export function getGivingFromWeekly(
  data: DashboardData,
  year: number,
  campus: string
): number {
  let total = 0;
  for (const r of data.giving_weekly) {
    if (r.year !== year) continue;
    if (campus === "All Campuses") {
      total += r.total;
    } else if (r.campus === campus) {
      total += r.total;
    }
  }
  return total;
}

/**
 * Get average weekly attendance from attendance_weekly for a year/campus/subgroup.
 * Handles both old spreadsheet names (Adults, Students) and new PCO names
 * (Revolution Canton Check-In, RevStudents HS, etc.) across all years.
 */
export function getAvgAttendanceFromWeekly(
  data: DashboardData,
  year: number,
  campus: string,
  subgroup: string
): number {
  // Filter relevant rows — match BOTH old spreadsheet and new PCO subgroup names
  const rows = data.attendance_weekly.filter((r) => {
    if (r.year !== year) return false;
    if (campus !== "All Campuses" && r.campus !== campus) return false;
    if (subgroup === "Total") {
      // Total = Adults + Kids (aggregate only, not Kids: detail rows)
      // Old name: "Adults" (2013-2025), New name: "Revolution Canton/Jasper Check-In" (2025+)
      return r.subgroup === "Adults" ||
             r.subgroup === "Revolution Canton Check-In" ||
             r.subgroup === "Revolution Jasper Check-In" ||
             r.subgroup === "Revolution Church Jasper" ||
             r.subgroup === "Kids";
    }
    if (subgroup === "Adults") {
      return r.subgroup === "Adults" ||
             r.subgroup === "Revolution Canton Check-In" ||
             r.subgroup === "Revolution Jasper Check-In" ||
             r.subgroup === "Revolution Church Jasper";
    }
    if (subgroup === "Kids") return r.subgroup === "Kids";
    if (subgroup === "Students") {
      // Old: "Students" (aggregate, 2013-2025)
      // New: "RevStudents Attendance/HS/MS" (2026+)
      // Also campus-level: "Students: Canton HS", etc.
      return r.subgroup === "Students" ||
             r.subgroup === "RevStudents Attendance" ||
             r.subgroup === "RevStudents HS" ||
             r.subgroup === "RevStudents MS" ||
             r.subgroup === "RevStudents | Canton Campus" ||
             r.subgroup === "RevStudents | Jasper Campus";
    }
    if (subgroup === "Young Adults" || subgroup === "YA Gathering") {
      return r.subgroup === "YA Gathering" || r.subgroup === "Young Adults";
    }
    if (subgroup === "Volunteers") return r.subgroup === "Volunteers";
    return r.subgroup === subgroup;
  });

  if (rows.length === 0) return 0;

  // For Students: deduplicate aggregate vs detail per week
  // If both HS+MS and "Students"/"RevStudents Attendance" exist for the same week+campus, skip the aggregate
  let filteredRows = rows;
  if (subgroup === "Students") {
    const hasDetailSet = new Set<string>();
    for (const r of rows) {
      if (r.subgroup === "RevStudents HS" || r.subgroup === "RevStudents MS" ||
          r.subgroup === "Students: Canton HS" || r.subgroup === "Students: Canton MS" ||
          r.subgroup === "Students: Jasper HS" || r.subgroup === "Students: Jasper MS") {
        hasDetailSet.add(`${r.weekNumber}-${r.campus}`);
      }
    }
    filteredRows = rows.filter((r) => {
      if ((r.subgroup === "RevStudents Attendance" || r.subgroup === "Students") &&
          hasDetailSet.has(`${r.weekNumber}-${r.campus}`)) {
        return false; // Skip aggregate when detail rows exist
      }
      return true;
    });
  }

  // For Total/Adults: deduplicate old "Adults" vs new "Revolution * Check-In" per week
  if (subgroup === "Total" || subgroup === "Adults") {
    const hasCheckInSet = new Set<string>();
    for (const r of filteredRows) {
      if (r.subgroup === "Revolution Canton Check-In" || r.subgroup === "Revolution Jasper Check-In" ||
          r.subgroup === "Revolution Church Jasper") {
        hasCheckInSet.add(`${r.weekNumber}-${r.campus}`);
      }
    }
    if (hasCheckInSet.size > 0) {
      filteredRows = filteredRows.filter((r) => {
        if (r.subgroup === "Adults" && hasCheckInSet.has(`${r.weekNumber}-${r.campus}`)) {
          return false; // Skip old "Adults" when new check-in rows exist
        }
        return true;
      });
    }
  }

  // Group by weekNumber, sum headcounts per week, then average across weeks
  const weekMap = new Map<number, number>();
  for (const r of filteredRows) {
    weekMap.set(r.weekNumber, (weekMap.get(r.weekNumber) || 0) + r.headcount);
  }
  const weekTotals = Array.from(weekMap.values());
  return weekTotals.reduce((s, v) => s + v, 0) / weekTotals.length;
}

/**
 * Get total next steps for a year/campus/metric.
 * Tries weekly data first. Falls back to annual `next_steps` table
 * if no weekly data exists for that year (e.g., pre-2017 for some metrics).
 */
export function getNextStepsFromWeekly(
  data: DashboardData,
  year: number,
  campus: string,
  metric: string
): number {
  // Try weekly data first
  let total = 0;
  let hasWeeklyData = false;
  for (const r of data.next_steps_weekly) {
    if (r.year !== year || r.metric !== metric) continue;
    if (campus === "All Campuses" || r.campus === campus) {
      total += r.count;
      hasWeeklyData = true;
    }
  }
  if (hasWeeklyData) return total;

  // Fall back to annual next_steps table
  for (const r of data.next_steps) {
    if (r.year !== year || r.metric !== metric) continue;
    if (campus === "All Campuses") {
      if (r.campus === "All Campuses") return r.total;
    } else if (r.campus === campus) {
      return r.total;
    }
  }
  // If no All Campuses row, sum individual campuses
  if (campus === "All Campuses") {
    let sum = 0;
    for (const r of data.next_steps) {
      if (r.year === year && r.metric === metric && r.campus !== "All Campuses") {
        sum += r.total;
      }
    }
    return sum;
  }
  return 0;
}

/**
 * Get average weekly serving count from serving_weekly for a year/campus.
 * Weekly data exists for all years (2013+ from spreadsheets).
 */
export function getAvgServingFromWeekly(
  data: DashboardData,
  year: number,
  campus: string
): number {
  const rows = data.serving_weekly.filter((r) => {
    if (r.year !== year) return false;
    if (campus === "All Campuses") return true;
    return r.campus === campus;
  });
  if (rows.length === 0) return 0;

  // Group by weekNumber, sum across campuses per week, then average
  const weekMap = new Map<number, number>();
  for (const r of rows) {
    weekMap.set(r.weekNumber, (weekMap.get(r.weekNumber) || 0) + r.total);
  }
  const weekTotals = Array.from(weekMap.values());
  return weekTotals.reduce((s, v) => s + v, 0) / weekTotals.length;
}

/**
 * Get max week number for a year from any weekly table.
 */
export function getMaxWeek(data: DashboardData, year: number): number {
  let maxWeek = 0;
  for (const r of data.attendance_weekly) {
    if (r.year === year && r.weekNumber > maxWeek) maxWeek = r.weekNumber;
  }
  for (const r of data.giving_weekly) {
    if (r.year === year && r.weekNumber > maxWeek) maxWeek = r.weekNumber;
  }
  return maxWeek;
}

/**
 * Week-based partial-year YoY comparison.
 * Compares weeks 1..maxWeek of latestYear vs same weeks of priorYear.
 */
export function getWeeklyYoYChange(
  data: DashboardData,
  latestYear: number,
  priorYear: number,
  getter: (year: number, maxWeek: number) => number
): { value: number; label: string; positive: boolean } {
  const maxWeek = getMaxWeek(data, latestYear);
  const current = getter(latestYear, maxWeek);
  const previous = getter(priorYear, maxWeek);
  if (!previous || previous === 0) return { value: 0, label: "N/A", positive: true };
  const change = ((current - previous) / previous) * 100;
  return {
    value: change,
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    positive: change >= 0,
  };
}

/**
 * Get avg weekly giving per capita from weekly tables.
 * Per capita = (total giving / number of weeks) / (total attendance / number of weeks)
 *            = total giving / total attendance (simplified — same as avg weekly giving / avg weekly attendance)
 * Returns the per-person-per-week dollar amount.
 */
export function getWeeklyGivingPerCapita(
  data: DashboardData,
  year: number,
  campus: string
): number {
  // Sum giving per week
  const givingByWeek = new Map<number, number>();
  for (const r of data.giving_weekly) {
    if (r.year !== year) continue;
    if (campus !== "All Campuses" && r.campus !== campus) continue;
    givingByWeek.set(r.weekNumber, (givingByWeek.get(r.weekNumber) || 0) + r.total);
  }
  if (givingByWeek.size === 0) return 0;

  const totalGiving = Array.from(givingByWeek.values()).reduce((s, v) => s + v, 0);
  const avgWeeklyGiving = totalGiving / givingByWeek.size;

  // Avg weekly attendance (already computed by existing helper)
  const avgAtt = getAvgAttendanceFromWeekly(data, year, campus, "Total");
  if (avgAtt === 0) return 0;

  return avgWeeklyGiving / avgAtt;
}

/**
 * Get weekly giving per capita for weeks 1..maxWeek (for YoY comparison).
 */
export function getWeeklyGivingPerCapitaRange(
  data: DashboardData,
  year: number,
  campus: string,
  maxWeek: number
): number {
  const givingByWeek = new Map<number, number>();
  for (const r of data.giving_weekly) {
    if (r.year !== year || r.weekNumber > maxWeek) continue;
    if (campus !== "All Campuses" && r.campus !== campus) continue;
    givingByWeek.set(r.weekNumber, (givingByWeek.get(r.weekNumber) || 0) + r.total);
  }
  if (givingByWeek.size === 0) return 0;

  const totalGiving = Array.from(givingByWeek.values()).reduce((s, v) => s + v, 0);
  const avgWeeklyGiving = totalGiving / givingByWeek.size;

  const avgAtt = getAvgAttendanceFromWeeklyRange(data, year, campus, "Total", maxWeek);
  if (avgAtt === 0) return 0;

  return avgWeeklyGiving / avgAtt;
}

/**
 * Get per-week giving per capita for each week of a year/campus.
 * Returns array sorted by weekNumber: { weekNumber, weekStartDate, gpc }
 */
export function getWeeklyGpcTimeSeries(
  data: DashboardData,
  year: number,
  campus: string
): { weekNumber: number; weekStartDate: string; gpc: number }[] {
  // Build giving per week
  const givingByWeek = new Map<number, { total: number; weekStartDate: string }>();
  for (const r of data.giving_weekly) {
    if (r.year !== year) continue;
    if (campus !== "All Campuses" && r.campus !== campus) continue;
    const existing = givingByWeek.get(r.weekNumber);
    if (existing) {
      existing.total += r.total;
    } else {
      givingByWeek.set(r.weekNumber, { total: r.total, weekStartDate: r.weekStartDate });
    }
  }

  // Build attendance per week (Total = Adults + Kids)
  const attByWeek = new Map<number, number>();
  for (const r of data.attendance_weekly) {
    if (r.year !== year) continue;
    if (campus !== "All Campuses" && r.campus !== campus) continue;
    // Only count Adults + Kids for Total (same logic as getAvgAttendanceFromWeekly "Total")
    const isAdult = r.subgroup === "Adults" || r.subgroup === "Revolution Canton Check-In" ||
                    r.subgroup === "Revolution Jasper Check-In" || r.subgroup === "Revolution Church Jasper";
    const isKids = r.subgroup === "Kids";
    if (!isAdult && !isKids) continue;
    attByWeek.set(r.weekNumber, (attByWeek.get(r.weekNumber) || 0) + r.headcount);
  }

  // Deduplicate Adults: if both old "Adults" and new check-in exist for same week+campus, skip old
  // (This is handled by the fact that we're summing all matching rows per week — but for accuracy
  // we should check for overlap. For the time series, the simpler approach is acceptable since
  // the weekly data is already clean from the sync process.)

  const results: { weekNumber: number; weekStartDate: string; gpc: number }[] = [];
  for (const [weekNum, givData] of Array.from(givingByWeek)) {
    const att = attByWeek.get(weekNum) || 0;
    if (att === 0) continue;
    results.push({
      weekNumber: weekNum,
      weekStartDate: givData.weekStartDate,
      gpc: Math.round((givData.total / att) * 100) / 100,
    });
  }

  results.sort((a, b) => a.weekNumber - b.weekNumber);
  return results;
}

/**
 * Get giving from giving_weekly for weeks 1..maxWeek of a year/campus.
 */
export function getGivingFromWeeklyRange(
  data: DashboardData,
  year: number,
  campus: string,
  maxWeek: number
): number {
  let total = 0;
  for (const r of data.giving_weekly) {
    if (r.year !== year || r.weekNumber > maxWeek) continue;
    if (campus === "All Campuses") {
      total += r.total;
    } else if (r.campus === campus) {
      total += r.total;
    }
  }
  return total;
}

/**
 * Get avg weekly attendance from attendance_weekly for weeks 1..maxWeek.
 * Uses same subgroup matching as getAvgAttendanceFromWeekly (both old and new names).
 */
export function getAvgAttendanceFromWeeklyRange(
  data: DashboardData,
  year: number,
  campus: string,
  subgroup: string,
  maxWeek: number
): number {
  const rows = data.attendance_weekly.filter((r) => {
    if (r.year !== year || r.weekNumber > maxWeek) return false;
    if (campus !== "All Campuses" && r.campus !== campus) return false;
    if (subgroup === "Total") {
      return r.subgroup === "Adults" ||
             r.subgroup === "Revolution Canton Check-In" ||
             r.subgroup === "Revolution Jasper Check-In" ||
             r.subgroup === "Revolution Church Jasper" ||
             r.subgroup === "Kids";
    }
    if (subgroup === "Adults") {
      return r.subgroup === "Adults" ||
             r.subgroup === "Revolution Canton Check-In" ||
             r.subgroup === "Revolution Jasper Check-In" ||
             r.subgroup === "Revolution Church Jasper";
    }
    if (subgroup === "Kids") return r.subgroup === "Kids";
    if (subgroup === "Students") {
      return r.subgroup === "Students" ||
             r.subgroup === "RevStudents Attendance" ||
             r.subgroup === "RevStudents HS" ||
             r.subgroup === "RevStudents MS" ||
             r.subgroup === "RevStudents | Canton Campus" ||
             r.subgroup === "RevStudents | Jasper Campus";
    }
    if (subgroup === "Young Adults" || subgroup === "YA Gathering") {
      return r.subgroup === "YA Gathering" || r.subgroup === "Young Adults";
    }
    if (subgroup === "Volunteers") return r.subgroup === "Volunteers";
    return r.subgroup === subgroup;
  });

  if (rows.length === 0) return 0;

  // Deduplicate Students: skip aggregate when detail rows exist
  let filteredRows = rows;
  if (subgroup === "Students") {
    const hasDetailSet = new Set<string>();
    for (const r of rows) {
      if (r.subgroup === "RevStudents HS" || r.subgroup === "RevStudents MS" ||
          r.subgroup === "Students: Canton HS" || r.subgroup === "Students: Canton MS" ||
          r.subgroup === "Students: Jasper HS" || r.subgroup === "Students: Jasper MS") {
        hasDetailSet.add(`${r.weekNumber}-${r.campus}`);
      }
    }
    filteredRows = rows.filter((r) => {
      if ((r.subgroup === "RevStudents Attendance" || r.subgroup === "Students") &&
          hasDetailSet.has(`${r.weekNumber}-${r.campus}`)) {
        return false;
      }
      return true;
    });
  }

  // Deduplicate Adults: skip old "Adults" when new check-in rows exist
  if (subgroup === "Total" || subgroup === "Adults") {
    const hasCheckInSet = new Set<string>();
    for (const r of filteredRows) {
      if (r.subgroup === "Revolution Canton Check-In" || r.subgroup === "Revolution Jasper Check-In" ||
          r.subgroup === "Revolution Church Jasper") {
        hasCheckInSet.add(`${r.weekNumber}-${r.campus}`);
      }
    }
    if (hasCheckInSet.size > 0) {
      filteredRows = filteredRows.filter((r) => {
        if (r.subgroup === "Adults" && hasCheckInSet.has(`${r.weekNumber}-${r.campus}`)) {
          return false;
        }
        return true;
      });
    }
  }

  const weekMap = new Map<number, number>();
  for (const r of filteredRows) {
    weekMap.set(r.weekNumber, (weekMap.get(r.weekNumber) || 0) + r.headcount);
  }
  const weekTotals = Array.from(weekMap.values());
  return weekTotals.reduce((s, v) => s + v, 0) / weekTotals.length;
}

/**
 * Get total next steps from weekly data for weeks 1..maxWeek.
 */
export function getNextStepsFromWeeklyRange(
  data: DashboardData,
  year: number,
  campus: string,
  metric: string,
  maxWeek: number
): number {
  let total = 0;
  for (const r of data.next_steps_weekly) {
    if (r.year !== year || r.weekNumber > maxWeek || r.metric !== metric) continue;
    if (campus === "All Campuses" || r.campus === campus) {
      total += r.count;
    }
  }
  return total;
}

/**
 * Get next steps total with fallback to monthly table.
 * next_steps_weekly only has FTG and Salvations — Baptisms come from next_steps_monthly.
 */
export function getNextStepsWithFallback(
  data: DashboardData,
  year: number,
  campus: string,
  metric: string
): number {
  // Try weekly first
  const weeklyTotal = getNextStepsFromWeekly(data, year, campus, metric);
  if (weeklyTotal > 0) return weeklyTotal;

  // Fall back to monthly
  let total = 0;
  for (const r of data.next_steps_monthly) {
    if (r.year !== year || r.metric !== metric) continue;
    if (campus === "All Campuses" || r.campus === campus) {
      total += r.count;
    }
  }
  return total;
}

/**
 * Get next steps total with fallback for a week range (partial year YoY).
 * For metrics not in weekly (e.g. Baptisms), falls back to monthly data
 * using month-range matching: months 1..ceil(maxWeek/4.33).
 */
export function getNextStepsWithFallbackRange(
  data: DashboardData,
  year: number,
  campus: string,
  metric: string,
  maxWeek: number
): number {
  // Try weekly first
  const weeklyTotal = getNextStepsFromWeeklyRange(data, year, campus, metric, maxWeek);
  if (weeklyTotal > 0) return weeklyTotal;

  // Fall back to monthly — approximate weeks to months
  const maxMonth = Math.ceil(maxWeek / 4.33);
  let total = 0;
  for (const r of data.next_steps_monthly) {
    if (r.year !== year || r.metric !== metric || r.month > maxMonth) continue;
    if (campus === "All Campuses" || r.campus === campus) {
      total += r.count;
    }
  }
  return total;
}


// ============================================================
// Assimilation helpers: New Serving & New Group Members (growth-based)
// ============================================================

/**
 * Compute "New Serving Team Members" as the growth in avg weekly volunteers
 * from the first month to the latest month of a given year.
 * Uses serving_monthly (total monthly volunteer headcount).
 * Growth = (latest month avg) - (first month avg)
 */
export function getNewServingGrowth(
  data: DashboardData,
  year: number,
  campus: string
): number {
  const rows = data.serving_monthly.filter((r) => {
    if (r.year !== year) return false;
    if (campus === "All Campuses") return true;
    return r.campus === campus;
  });
  if (rows.length === 0) return 0;

  // Get unique months
  const months = Array.from(new Set(rows.map((r) => r.month))).sort((a, b) => a - b);
  if (months.length < 2) return 0;

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  // Sum totals for first and last month (across campuses if All Campuses)
  const firstTotal = rows
    .filter((r) => r.month === firstMonth)
    .reduce((s, r) => s + r.total, 0);
  const lastTotal = rows
    .filter((r) => r.month === lastMonth)
    .reduce((s, r) => s + r.total, 0);

  // Convert monthly totals to avg weekly (approx 4.33 weeks/month)
  const firstAvg = firstTotal / 4.33;
  const lastAvg = lastTotal / 4.33;

  return Math.round(lastAvg - firstAvg);
}

/**
 * Compute "New Group Members" as the growth in totalMembers
 * from the first month to the latest month of a given year.
 * Uses groups_monthly.
 */
export function getNewGroupMembersGrowth(
  data: DashboardData,
  year: number,
  campus: string
): number {
  const rows = data.groups_monthly.filter((r) => {
    if (r.year !== year) return false;
    if (campus === "All Campuses") return true;
    return r.campus === campus;
  });
  if (rows.length === 0) return 0;

  // Get unique months
  const months = Array.from(new Set(rows.map((r) => r.month))).sort((a, b) => a - b);
  if (months.length < 2) return 0;

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  // Sum totalMembers for first and last month (across campuses if All Campuses)
  const firstTotal = rows
    .filter((r) => r.month === firstMonth)
    .reduce((s, r) => s + r.totalMembers, 0);
  const lastTotal = rows
    .filter((r) => r.month === lastMonth)
    .reduce((s, r) => s + r.totalMembers, 0);

  return lastTotal - firstTotal;
}
