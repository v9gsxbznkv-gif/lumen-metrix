/**
 * Attendance Tab — weekly / monthly / yearly views
 * Powered by trpc.dataViews.attendance endpoints
 *
 * Backend returns normalized data per week/month/year with fields:
 *   adults, kids, students, online, volunteers, youngAdults, ftg, total
 * where total = adults + kids (the main service attendance metric)
 *
 * Also includes a Kids Room-Level Breakdown section showing per-room
 * averages from "Kids: {Campus} {Room}" subgroups in attendance_weekly.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import KpiCard from "@/components/KpiCard";
import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { formatNumber, MONTH_NAMES } from "@/lib/data";

type ViewMode = "weekly" | "monthly" | "yearly";

/** Metric columns to display — order matters */
const METRICS = [
  { key: "total", label: "Total", color: "#4A7C59" },
  { key: "adults", label: "Adults", color: "#5B8A68" },
  { key: "kids", label: "Kids", color: "#E8913A" },
  { key: "students", label: "Students", color: "#4A7FB5" },
  { key: "online", label: "Online", color: "#8B6DAF" },
  { key: "volunteers", label: "Volunteers", color: "#C45B4A" },
  { key: "youngAdults", label: "Young Adults", color: "#D4A843" },
  { key: "ftg", label: "FTG", color: "#C2703E" },
] as const;

/** Metrics to show on the chart (not total, since it's adults+kids) */
const CHART_METRICS = METRICS.filter(m => m.key !== "total");

/** Color palette for breakdown bars — cycles through for dynamic rooms */
const BAR_COLORS = [
  "#F4A261", "#E76F51", "#2A9D8F", "#264653", "#E9C46A",
  "#287271", "#8B6DAF", "#4A7FB5", "#C2703E", "#5B8A68",
  "#D4A843", "#C45B4A", "#6A8D73", "#B5838D", "#3D5A80",
];

/** Student level colors */
const STUDENT_COLORS: Record<string, string> = {
  "MS": "#4A7FB5",
  "HS": "#E76F51",
};

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 6); // Monday → Sunday display
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getYoYChange(current: number, prior: number) {
  if (prior === 0) return { label: "N/A", positive: true, value: 0 };
  const pct = ((current - prior) / prior) * 100;
  return {
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    positive: pct >= 0,
    value: pct,
  };
}

export default function AttendanceTab2() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [year, setYear] = useState<number>(2026);
  const [campus, setCampus] = useState<string>("all");

  const yearsQuery = trpc.dataViews.attendance.getYears.useQuery();
  const years = yearsQuery.data ?? [2026];

  const dataQuery = trpc.dataViews.attendance.getData.useQuery({
    viewMode,
    campus: campus === "all" ? undefined : campus,
    year: viewMode === "yearly" ? undefined : year,
    startYear: viewMode === "yearly" ? Math.min(...years) : undefined,
    endYear: viewMode === "yearly" ? Math.max(...years) : undefined,
  });

  // Prior year data for YTD comparison (same weeks)
  const priorYearQuery = trpc.dataViews.attendance.getData.useQuery(
    {
      viewMode: "weekly",
      campus: campus === "all" ? undefined : campus,
      year: year - 1,
    },
    { enabled: viewMode === "weekly" }
  );

  // Kids room breakdown — try selected year first, fallback to most recent year with data
  const primaryKidsYear = viewMode === "yearly" ? Math.max(...years) : year;
  const primaryKidsRoomQuery = trpc.dataViews.attendance.getKidsRoomBreakdown.useQuery({
    year: primaryKidsYear,
    campus: campus === "all" ? undefined : campus,
  });

  // If primary year has no data, try 2025 as fallback (most recent spreadsheet year)
  const needsFallback = !primaryKidsRoomQuery.isLoading && (primaryKidsRoomQuery.data?.length ?? 0) === 0 && primaryKidsYear !== 2025;
  const fallbackKidsRoomQuery = trpc.dataViews.attendance.getKidsRoomBreakdown.useQuery(
    { year: 2025, campus: campus === "all" ? undefined : campus },
    { enabled: needsFallback }
  );

  // Use primary data if available, otherwise fallback
  const kidsRoomQueryData = (primaryKidsRoomQuery.data?.length ?? 0) > 0
    ? primaryKidsRoomQuery.data
    : fallbackKidsRoomQuery.data;
  const kidsYear = (primaryKidsRoomQuery.data?.length ?? 0) > 0 ? primaryKidsYear : 2025;
  const kidsRoomLoading = primaryKidsRoomQuery.isLoading || (needsFallback && fallbackKidsRoomQuery.isLoading);
  const kidsIsFallback = needsFallback && (fallbackKidsRoomQuery.data?.length ?? 0) > 0;

  // Students breakdown — same fallback logic
  const primaryStudentsYear = viewMode === "yearly" ? Math.max(...years) : year;
  const primaryStudentsQuery = trpc.dataViews.attendance.getStudentsBreakdown.useQuery({
    year: primaryStudentsYear,
    campus: campus === "all" ? undefined : campus,
  });
  const studentsNeedsFallback = !primaryStudentsQuery.isLoading && !primaryStudentsQuery.data?.hasBreakdown && primaryStudentsYear !== 2025;
  const fallbackStudentsQuery = trpc.dataViews.attendance.getStudentsBreakdown.useQuery(
    { year: 2025, campus: campus === "all" ? undefined : campus },
    { enabled: studentsNeedsFallback }
  );
  const studentsData = primaryStudentsQuery.data?.hasBreakdown
    ? primaryStudentsQuery.data
    : fallbackStudentsQuery.data;
  const studentsYear = primaryStudentsQuery.data?.hasBreakdown ? primaryStudentsYear : 2025;
  const studentsLoading = primaryStudentsQuery.isLoading || (studentsNeedsFallback && fallbackStudentsQuery.isLoading);
  const studentsIsFallback = studentsNeedsFallback && fallbackStudentsQuery.data?.hasBreakdown;

  const isLoading = dataQuery.isLoading;
  const rawData = dataQuery.data;

  // ─── Detect which metrics have data ────────────────────────
  // Young Adults meets once/month, not weekly. Exclude from weekly table (mostly dashes)
  // and don't divide by weekCount in monthly/yearly views (raw total = actual attendance).
  const MONTHLY_ONLY_METRICS = new Set(["youngAdults"]);

  const activeMetrics = useMemo(() => {
    if (!rawData) return METRICS;
    const data = rawData.data as any[];
    return METRICS.filter(m => {
      // Skip monthly-only metrics in weekly view
      if (viewMode === "weekly" && MONTHLY_ONLY_METRICS.has(m.key)) return false;
      return data.some(row => {
        const val = row[m.key] ?? row[`avgWeekly${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`];
        return val && val > 0;
      });
    });
  }, [rawData, viewMode]);

  const activeChartMetrics = useMemo(() => {
    return CHART_METRICS.filter(m => activeMetrics.some(am => am.key === m.key));
  }, [activeMetrics]);

  // ─── Weekly Data ──────────────────────────────────────────
  const weeklyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "weekly") return [];
    return (rawData.data as any[]).slice().sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.weekNumber - a.weekNumber;
    });
  }, [rawData]);

  // ─── Monthly Data ─────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "monthly") return [];
    return (rawData.data as any[]).slice().sort((a, b) => a.month - b.month);
  }, [rawData]);

  // ─── Yearly Data ──────────────────────────────────────────
  const yearlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "yearly") return [];
    return (rawData.data as any[]).slice().sort((a, b) => b.year - a.year);
  }, [rawData]);

  // ─── Prior Year Weekly Data (for YTD comparison) ──────────
  const priorYearWeeklyData = useMemo(() => {
    if (!priorYearQuery.data || priorYearQuery.data.viewMode !== "weekly") return [];
    return (priorYearQuery.data.data as any[]).slice().sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.weekNumber - a.weekNumber;
    });
  }, [priorYearQuery.data]);

  // ─── KPI Cards ────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (viewMode === "weekly" && weeklyData.length > 0) {
      // Determine if the latest week is still in progress (current calendar week)
      // Only skip it if today falls within that week (Sun-Sat)
      const latestWeek = weeklyData[0];
      const now = new Date();
      const latestStart = new Date(latestWeek.weekStartDate + "T00:00:00");
      const latestEnd = new Date(latestStart);
      latestEnd.setDate(latestEnd.getDate() + 6); // Saturday of that week
      const isCurrentWeekPartial = now >= latestStart && now <= latestEnd;

      const currentWeek = (isCurrentWeekPartial && weeklyData.length > 1)
        ? weeklyData[1]  // skip partial current week
        : weeklyData[0]; // latest week is fully complete

      // For averages and comparisons, exclude partial current week if applicable
      const fullWeeksForAvg = isCurrentWeekPartial && weeklyData.length > 1
        ? weeklyData.slice(1)
        : weeklyData;
      const avgTotal = Math.round(
        fullWeeksForAvg.reduce((s, w) => s + w.total, 0) / fullWeeksForAvg.length
      );
      const maxWeekNum = fullWeeksForAvg[0]?.weekNumber ?? 52;

      // YTD comparison: prior year same weeks (1 to maxWeekNum)
      const priorSamePeriod = priorYearWeeklyData.filter(w => w.weekNumber <= maxWeekNum);
      const priorAvg = priorSamePeriod.length > 0
        ? Math.round(priorSamePeriod.reduce((s: number, w: any) => s + w.total, 0) / priorSamePeriod.length)
        : 0;

      // Highest and lowest weeks — exclude partial current week
      const fullWeeks = isCurrentWeekPartial && weeklyData.length > 1
        ? weeklyData.slice(1)
        : weeklyData;
      const sorted = [...fullWeeks].sort((a, b) => b.total - a.total);
      const highest = sorted[0];
      const lowest = sorted[sorted.length - 1];

      return {
        currentWeekTotal: currentWeek.total,
        currentWeekDate: currentWeek.weekStartDate,
        avgTotal,
        priorAvg,
        weekCount: weeklyData.length,
        highest: { total: highest.total, date: highest.weekStartDate },
        lowest: { total: lowest.total, date: lowest.weekStartDate },
      };
    }
    if (viewMode === "monthly" && monthlyData.length > 0) {
      // Skip partial current month: if the latest month is the current calendar month
      // and has only 1 week, it's likely a partial week — show the prior full month instead
      const now = new Date();
      const currentCalMonth = now.getMonth() + 1; // 1-indexed
      const currentCalYear = now.getFullYear();
      let latestIdx = monthlyData.length - 1;
      const lastMonth = monthlyData[latestIdx];
      if (
        lastMonth.month === currentCalMonth &&
        lastMonth.year === currentCalYear &&
        lastMonth.weekCount <= 1 &&
        monthlyData.length > 1
      ) {
        latestIdx = monthlyData.length - 2;
      }
      const latest = monthlyData[latestIdx];
      // Compute yearly average from all full months (exclude partial current month)
      const fullMonths = monthlyData.slice(0, latestIdx + 1);
      const avgTotal = Math.round(
        fullMonths.reduce((s, m) => s + m.avgWeeklyTotal, 0) / fullMonths.length
      );
      const priorMonth = latestIdx > 0 ? monthlyData[latestIdx - 1] : null;
      return {
        currentWeekTotal: latest.avgWeeklyTotal,
        currentWeekDate: `${MONTH_NAMES[latest.month - 1]} ${latest.year}`,
        avgTotal,
        priorAvg: priorMonth ? priorMonth.avgWeeklyTotal : 0,
        weekCount: fullMonths.reduce((s, m) => s + m.weekCount, 0),
        highest: null,
        lowest: null,
      };
    }
    if (viewMode === "yearly" && yearlyData.length > 0) {
      const latest = yearlyData[0];
      const prior = yearlyData[1];
      return {
        currentWeekTotal: latest.avgWeeklyTotal,
        currentWeekDate: String(latest.year),
        avgTotal: latest.avgWeeklyTotal,
        priorAvg: prior?.avgWeeklyTotal ?? 0,
        weekCount: latest.weekCount,
        highest: null,
        lowest: null,
      };
    }
    return null;
  }, [viewMode, weeklyData, monthlyData, yearlyData, priorYearWeeklyData]);

  // ─── Chart Data ───────────────────────────────────────────
  const chartData = useMemo(() => {
    if (viewMode === "weekly") {
      return weeklyData.slice().reverse().map(w => ({
        label: formatDate(w.weekStartDate),
        total: w.total,
        adults: w.adults,
        kids: w.kids,
        students: w.students,
        online: w.online,
        volunteers: w.volunteers,
        youngAdults: w.youngAdults,
        ftg: w.ftg,
      }));
    }
    if (viewMode === "monthly") {
      return monthlyData.map(m => ({
        label: MONTH_NAMES[m.month - 1],
        total: m.avgWeeklyTotal,
        adults: m.avgWeeklyAdults,
        kids: m.avgWeeklyKids,
        students: m.avgWeeklyStudents,
        online: m.avgWeeklyOnline,
        volunteers: m.avgWeeklyVolunteers,
        youngAdults: m.youngAdults > 0 ? m.youngAdults : 0,  // YA meets once/month — raw total IS the attendance
        ftg: m.ftg > 0 ? Math.round(m.ftg / m.weekCount) : 0,
      }));
    }
    if (viewMode === "yearly") {
      return yearlyData.slice().reverse().map(y => ({
        label: String(y.year),
        total: y.avgWeeklyTotal,
        adults: y.avgWeeklyAdults,
        kids: y.avgWeeklyKids,
        students: y.avgWeeklyStudents,
        online: y.avgWeeklyOnline,
        volunteers: y.avgWeeklyVolunteers,
        youngAdults: y.youngAdults > 0 ? Math.round(y.youngAdults / (y.weekCount / 4.33)) : 0,  // YA meets ~monthly, not weekly — divide by months, not weeks
        ftg: y.ftg > 0 ? Math.round(y.ftg / y.weekCount) : 0,
      }));
    }
    return [];
  }, [viewMode, weeklyData, monthlyData, yearlyData]);

  // ─── Kids Room Breakdown (dynamic from API) ──────────────
  const kidsRoomData = kidsRoomQueryData ?? [];
  const kidsRoomSections = useMemo(() => {
    if (kidsRoomData.length === 0) return [];

    // Group by campus dynamically
    const campusMap = new Map<string, { label: string; avg: number; weeks: number }[]>();
    for (const r of kidsRoomData) {
      if (r.avgWeekly <= 0) continue;
      const items = campusMap.get(r.campus) ?? [];
      items.push({ label: r.room, avg: r.avgWeekly, weeks: r.weekCount });
      campusMap.set(r.campus, items);
    }

    // Sort rooms within each campus by avg descending
    const sections = Array.from(campusMap.entries())
      .map(([camp, items]) => ({
        title: `${camp} Kids`,
        campus: camp,
        items: items.sort((a, b) => b.avg - a.avg),
      }))
      .sort((a, b) => a.campus.localeCompare(b.campus));

    return sections;
  }, [kidsRoomData]);

  const maxKidsAvg = useMemo(() => {
    const allAvgs = kidsRoomSections.flatMap(s => s.items.map(i => i.avg));
    return Math.max(...allAvgs, 1);
  }, [kidsRoomSections]);

  // ─── Students Breakdown ───────────────────────────────────
  const studentsSections = useMemo(() => {
    if (!studentsData?.hasBreakdown) return [];
    // Group by campus
    const campusMap = new Map<string, { level: string; avg: number; weeks: number }[]>();
    for (const b of studentsData.breakdown) {
      const items = campusMap.get(b.campus) ?? [];
      items.push({ level: b.level, avg: b.avgWeekly, weeks: b.weekCount });
      campusMap.set(b.campus, items);
    }
    return Array.from(campusMap.entries())
      .map(([camp, items]) => ({
        title: `${camp} Students`,
        campus: camp,
        items: items.sort((a, b) => b.avg - a.avg),
        aggregate: studentsData.aggregates.find(a => a.campus === camp),
      }))
      .sort((a, b) => a.campus.localeCompare(b.campus));
  }, [studentsData]);

  const maxStudentAvg = useMemo(() => {
    const allAvgs = studentsSections.flatMap(s => s.items.map(i => i.avg));
    return Math.max(...allAvgs, 1);
  }, [studentsSections]);

  return (
    <div className="space-y-5">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="weekly" className="text-xs px-3">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs px-3">Monthly</TabsTrigger>
            <TabsTrigger value="yearly" className="text-xs px-3">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {viewMode !== "yearly" && (
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[90px] h-8 text-xs bg-card border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={campus} onValueChange={setCampus}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campuses</SelectItem>
              <SelectItem value="Canton">Canton</SelectItem>
              <SelectItem value="Jasper">Jasper</SelectItem>
              <SelectItem value="Online">Online</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#E8913A" }} />
        </div>
      )}

      {!isLoading && rawData && (
        <>
          {/* KPI Cards */}
          {kpis && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label={viewMode === "yearly" ? "Avg Weekly Attendance" : viewMode === "monthly" ? "Current Month" : "Current Week"}
                  value={formatNumber(kpis.currentWeekTotal)}
                  subtitle={viewMode === "yearly" ? kpis.currentWeekDate : viewMode === "monthly" ? kpis.currentWeekDate : formatDate(kpis.currentWeekDate)}
                  borderColor="#E8913A"
                />
                <KpiCard
                  label="Yearly Average"
                  value={formatNumber(kpis.avgTotal)}
                  subtitle={`Across ${kpis.weekCount} weeks`}
                  borderColor="#4A7FB5"
                  change={kpis.priorAvg > 0 ? getYoYChange(kpis.avgTotal, kpis.priorAvg) : undefined}
                  changeLabel="vs same period last year"
                />
              </div>
              {viewMode === "weekly" && kpis.highest && kpis.lowest && (
                <div className="grid grid-cols-2 gap-3">
                  <KpiCard
                    label="Highest Week"
                    value={formatNumber(kpis.highest.total)}
                    subtitle={formatDate(kpis.highest.date)}
                    borderColor="#4A7C59"
                  />
                  <KpiCard
                    label="Lowest Week"
                    value={formatNumber(kpis.lowest.total)}
                    subtitle={formatDate(kpis.lowest.date)}
                    borderColor="#C45B4A"
                  />
                </div>
              )}
            </div>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>
                {viewMode === "weekly" && `Weekly Attendance — ${year}`}
                {viewMode === "monthly" && `Monthly Avg Weekly Attendance — ${year}`}
                {viewMode === "yearly" && "Avg Weekly Attendance by Year"}
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                {viewMode === "yearly" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
                    {activeChartMetrics.map((m, i) => (
                      <Bar
                        key={m.key}
                        dataKey={m.key}
                        name={m.label}
                        stackId="a"
                        fill={m.color}
                        radius={i === activeChartMetrics.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        maxBarSize={40}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <AreaChart data={chartData}>
                    <defs>
                      {activeChartMetrics.map((m) => (
                        <linearGradient key={m.key} id={`att2-grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={m.color} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} interval={viewMode === "weekly" ? Math.max(0, Math.floor(chartData.length / 12)) : 0} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
                    {activeChartMetrics.map((m) => (
                      <Area
                        key={m.key}
                        type="monotone"
                        dataKey={m.key}
                        name={m.label}
                        stroke={m.color}
                        strokeWidth={2}
                        fill={`url(#att2-grad-${m.key})`}
                        dot={viewMode === "monthly" ? { r: 3 } : false}
                      />
                    ))}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          {/* Data Table */}
          <div className="bg-card rounded-lg border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="p-4 border-b border-border/40">
              <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans'" }}>
                {viewMode === "weekly" && `Weekly Breakdown — ${year}`}
                {viewMode === "monthly" && `Monthly Breakdown — ${year}`}
                {viewMode === "yearly" && "Yearly Breakdown"}
              </h3>
            </div>

            {viewMode === "weekly" && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      {activeMetrics.map(m => (
                        <TableHead key={m.key} className="text-xs text-right">{m.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyData.map((w) => (
                      <TableRow key={`${w.year}-${w.weekNumber}`}>
                        <TableCell className="text-xs font-medium">{formatDate(w.weekStartDate)}</TableCell>
                        {activeMetrics.map(m => (
                          <TableCell key={m.key} className={`text-xs text-right font-mono ${m.key === "total" ? "font-semibold" : ""}`}>
                            {w[m.key] > 0 ? formatNumber(w[m.key]) : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                  {weeklyData.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="text-xs font-semibold">Average</TableCell>
                        {activeMetrics.map(m => {
                          const vals = weeklyData.filter(w => w[m.key] > 0).map(w => w[m.key]);
                          const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
                          return (
                            <TableCell key={m.key} className={`text-xs text-right font-mono ${m.key === "total" ? "font-semibold" : ""}`}>
                              {avg > 0 ? formatNumber(avg) : "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}

            {viewMode === "monthly" && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Month</TableHead>
                      <TableHead className="text-xs text-right">Avg Weekly</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                      {activeMetrics.filter(m => m.key !== "total").map(m => (
                        <TableHead key={m.key} className="text-xs text-right">{m.label}</TableHead>
                      ))}
                      <TableHead className="text-xs text-right">Weeks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyData.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="text-xs font-medium">{MONTH_NAMES[m.month - 1]}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(m.avgWeeklyTotal)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatNumber(m.total)}</TableCell>
                        {activeMetrics.filter(am => am.key !== "total").map(am => {
                          const avgKey = `avgWeekly${am.key.charAt(0).toUpperCase() + am.key.slice(1)}`;
                          // Monthly-only metrics (YA) should show raw total, not divided by weekCount
                          const val = MONTHLY_ONLY_METRICS.has(am.key)
                            ? (m[am.key] > 0 ? m[am.key] : 0)
                            : (m[avgKey] ?? (m[am.key] > 0 ? Math.round(m[am.key] / m.weekCount) : 0));
                          return (
                            <TableCell key={am.key} className="text-xs text-right font-mono">
                              {val > 0 ? formatNumber(val) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-xs text-right font-mono">{m.weekCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {monthlyData.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="text-xs font-semibold">Year Avg</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          {formatNumber(Math.round(monthlyData.reduce((s, m) => s + m.avgWeeklyTotal, 0) / monthlyData.length))}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          {formatNumber(monthlyData.reduce((s, m) => s + m.total, 0))}
                        </TableCell>
                        {activeMetrics.filter(am => am.key !== "total").map(am => {
                          let avg: number;
                          if (MONTHLY_ONLY_METRICS.has(am.key)) {
                            // Monthly-only metrics: average of raw monthly totals (only months with data)
                            const vals = monthlyData.filter(m => (m[am.key] ?? 0) > 0).map(m => m[am.key]);
                            avg = vals.length > 0 ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length) : 0;
                          } else {
                            const avgKey = `avgWeekly${am.key.charAt(0).toUpperCase() + am.key.slice(1)}`;
                            const vals = monthlyData.filter(m => (m[avgKey] ?? 0) > 0).map(m => m[avgKey] ?? 0);
                            avg = vals.length > 0 ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length) : 0;
                          }
                          return (
                            <TableCell key={am.key} className="text-xs text-right font-mono">
                              {avg > 0 ? formatNumber(avg) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          {monthlyData.reduce((s, m) => s + m.weekCount, 0)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}

            {viewMode === "yearly" && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Year</TableHead>
                      <TableHead className="text-xs text-right">Avg Weekly</TableHead>
                      <TableHead className="text-xs text-right">Weeks</TableHead>
                      {activeMetrics.filter(m => m.key !== "total").map(m => (
                        <TableHead key={m.key} className="text-xs text-right">{m.label}</TableHead>
                      ))}
                      <TableHead className="text-xs text-right">YoY</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearlyData.map((y, i) => {
                      const prior = yearlyData[i + 1];
                      const change = prior ? getYoYChange(y.avgWeeklyTotal, prior.avgWeeklyTotal) : null;
                      return (
                        <TableRow key={y.year}>
                          <TableCell className="text-xs font-medium">{y.year}{y.year === new Date().getFullYear() ? " (YTD)" : ""}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(y.avgWeeklyTotal)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{y.weekCount}</TableCell>
                          {activeMetrics.filter(m => m.key !== "total").map(m => {
                            const avgKey = `avgWeekly${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`;
                            // Monthly-only metrics: divide by ~months, not weeks
                            const val = MONTHLY_ONLY_METRICS.has(m.key)
                              ? (y[m.key] > 0 ? Math.round(y[m.key] / Math.max(1, Math.round(y.weekCount / 4.33))) : 0)
                              : (y[avgKey] ?? (y[m.key] > 0 ? Math.round(y[m.key] / y.weekCount) : 0));
                            return (
                              <TableCell key={m.key} className="text-xs text-right font-mono">
                                {val > 0 ? formatNumber(val) : "—"}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-xs text-right">
                            {change ? (
                              <span className="font-semibold" style={{ color: change.positive ? "#4A7C59" : "#C45B4A" }}>
                                {change.label}
                              </span>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Kids Room-Level Breakdown */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans'" }}>
                  Kids Room Breakdown — {kidsYear} Avg
                </h3>
                {kidsIsFallback && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Showing {kidsYear} data (no room-level data for {primaryKidsYear} yet)
                  </p>
                )}
              </div>
              {kidsRoomLoading && (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#E8913A" }} />
              )}
            </div>

            {kidsRoomSections.length > 0 ? (
              <div className="space-y-5">
                {kidsRoomSections.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-xs font-semibold text-foreground/70 mb-2.5 uppercase tracking-wide">
                      {section.title}
                    </h4>
                    <div className="space-y-2.5">
                      {section.items.map((item, idx) => (
                        <div key={item.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-foreground/80">{item.label}</span>
                            <span className="font-semibold font-mono text-sm" style={{ color: "#4A7C59" }}>
                              {formatNumber(item.avg)}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (item.avg / maxKidsAvg) * 100)}%`,
                                backgroundColor: BAR_COLORS[idx % BAR_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Total kids across all rooms */}
                <div className="pt-3 border-t border-border/40">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-foreground/70 uppercase tracking-wide">Total Kids (Room Sum)</span>
                    <span className="font-semibold font-mono text-sm" style={{ color: "#E8913A" }}>
                      {formatNumber(kidsRoomSections.reduce((s, sec) => s + sec.items.reduce((ss, i) => ss + i.avg, 0), 0))}
                    </span>
                  </div>
                </div>
              </div>
            ) : !kidsRoomLoading ? (
              <p className="text-xs text-muted-foreground italic">
                No room-level kids data available. Room-level data is available for 2017–2025 from spreadsheet imports.
              </p>
            ) : null}
          </div>

          {/* Students Breakdown */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans'" }}>
                  Students Breakdown — {studentsYear} Avg
                </h3>
                {studentsIsFallback && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Showing {studentsYear} data (no MS/HS breakdown for {primaryStudentsYear} yet)
                  </p>
                )}
              </div>
              {studentsLoading && (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#4A7FB5" }} />
              )}
            </div>

            {studentsSections.length > 0 ? (
              <div className="space-y-5">
                {studentsSections.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-xs font-semibold text-foreground/70 mb-2.5 uppercase tracking-wide">
                      {section.title}
                    </h4>
                    <div className="space-y-2.5">
                      {section.items.map((item) => (
                        <div key={item.level}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-foreground/80">
                              {item.level === "MS" ? "Middle School" : item.level === "HS" ? "High School" : item.level}
                            </span>
                            <span className="font-semibold font-mono text-sm" style={{ color: "#4A7C59" }}>
                              {formatNumber(item.avg)}
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (item.avg / maxStudentAvg) * 100)}%`,
                                backgroundColor: STUDENT_COLORS[item.level] || "#4A7FB5",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {section.aggregate && (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Aggregate Total</span>
                          <span className="font-semibold font-mono text-sm" style={{ color: "#4A7FB5" }}>
                            {formatNumber(section.aggregate.avgWeekly)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Total students across all campuses */}
                <div className="pt-3 border-t border-border/40">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-foreground/70 uppercase tracking-wide">Total Students (MS + HS)</span>
                    <span className="font-semibold font-mono text-sm" style={{ color: "#4A7FB5" }}>
                      {formatNumber(studentsSections.reduce((s, sec) => s + sec.items.reduce((ss, i) => ss + i.avg, 0), 0))}
                    </span>
                  </div>
                </div>
              </div>
            ) : !studentsLoading ? (
              <p className="text-xs text-muted-foreground italic">
                No MS/HS breakdown available for this year. Breakdown data is available for 2017–2025 from spreadsheet imports.
              </p>
            ) : null}
          </div>
        </>
      )}

      {!isLoading && (!rawData || (rawData.data as any[]).length === 0) && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No attendance data available for this selection.
        </div>
      )}
    </div>
  );
}
