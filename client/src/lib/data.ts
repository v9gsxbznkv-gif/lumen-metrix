// Lumen Metrix — Data Layer
// "Light through measurement"

const DATA_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663419960068/EmzMXpmCwkQz2biKeRL4cm/dashboard_data_9744c33d.json";

export interface AttendanceRecord {
  year: number;
  week: number;
  month: number;
  campus: string;
  subgroup: string;
  count: number;
}

export interface AttendanceMonthly {
  year: number;
  month: number;
  campus: string;
  subgroup: string;
  avg_weekly: number;
  total: number;
  weeks_counted: number;
}

export interface AttendanceAnnual {
  year: number;
  campus: string;
  subgroup: string;
  avg_weekly: number;
  total: number;
  weeks_counted: number;
}

export interface TotalAnnual {
  year: number;
  campus: string;
  avg_weekly: number;
  total: number;
  weeks: number;
}

export interface GivingMonthly {
  year: number;
  month: number;
  campus: string;
  subgroup: string;
  total: number;
  avg_weekly: number;
  weeks: number;
}

export interface GivingAnnual {
  year: number;
  campus: string;
  subgroup: string;
  total: number;
  avg_weekly: number;
  weeks: number;
}

export interface TithesAnnual {
  year: number;
  campus: string;
  total: number;
  avg_weekly: number;
}

export interface ServingAnnual {
  year: number;
  campus: string;
  subgroup: string;
  avg_weekly: number;
  total: number;
  weeks: number;
}

export interface NextStepsMonthly {
  year: number;
  month: number;
  campus: string;
  metric: string;
  total: number;
}

export interface NextStepsAnnual {
  year: number;
  campus: string;
  metric: string;
  total: number;
}

export interface AssimilationAnnual {
  year: number;
  campus: string;
  category_clean: string;
  value: number;
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
  attendance: {
    weekly: AttendanceRecord[];
    monthly: AttendanceMonthly[];
    annual: AttendanceAnnual[];
    total_annual: TotalAnnual[];
  };
  giving: {
    monthly: GivingMonthly[];
    annual: GivingAnnual[];
    tithes_annual: TithesAnnual[];
  };
  serving: {
    annual: ServingAnnual[];
    total_annual: TotalAnnual[];
  };
  next_steps: {
    monthly: NextStepsMonthly[];
    annual: NextStepsAnnual[];
  };
  assimilation: {
    annual: AssimilationAnnual[];
  };
  computed: {
    giving_per_capita: GivingPerCapita[];
    volunteer_ratio: VolunteerRatio[];
  };
  meta: {
    years: number[];
    campuses: string[];
    attendance_subgroups: string[];
    offering_subgroups: string[];
    serving_subgroups: string[];
    next_step_metrics: string[];
    generated: string;
  };
}

let cachedData: DashboardData | null = null;

export async function loadDashboardData(): Promise<DashboardData> {
  if (cachedData) return cachedData;
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error("Failed to load dashboard data");
  cachedData = await response.json();
  return cachedData!;
}

// Lumen Metrix Brand Colors
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
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
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

export function getYoYChange(current: number, previous: number): { value: number; label: string; positive: boolean } {
  if (!previous || previous === 0) return { value: 0, label: "N/A", positive: true };
  const change = ((current - previous) / previous) * 100;
  return {
    value: change,
    label: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    positive: change >= 0,
  };
}
