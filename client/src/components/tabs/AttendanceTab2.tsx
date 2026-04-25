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

/** Kids room color palette */
const KIDS_ROOM_COLORS: Record<string, string> = {
  "Babies": "#F4A261",
  "Toddlers": "#E76F51",
  "Pre-K": "#2A9D8F",
  "Campground": "#264653",
  "Treehouse": "#E9C46A",
  "Cove": "#287271",
  "Reruns": "#8B6DAF",
  "Nursery": "#F4A261",
  "Elementary": "#4A7FB5",
};

/** Section groupings for kids rooms */
const KIDS_SECTIONS = [
  {
    title: "Canton Sunday RevKids",
    campus: "Canton",
    rooms: ["Babies", "Toddlers", "Pre-K", "Campground", "Treehouse", "Cove", "Reruns"],
  },
  {
    title: "Jasper Kids",
    campus: "Jasper",
    rooms: ["Nursery", "Pre-K", "Treehouse", "Cove", "Reruns"],
  },
];

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
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

  const isLoading = dataQuery.isLoading;
  const rawData = dataQuery.data;

  // ─── Detect which metrics have data ────────────────────────
  const activeMetrics = useMemo(() => {
    if (!rawData) return METRICS;
    const data = rawData.data as any[];
    return METRICS.filter(m =>
      data.some(row => {
        const val = row[m.key] ?? row[`avgWeekly${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`];
        return val && val > 0;
      })
    );
  }, [rawData]);

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

  // ─── KPI Cards ────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (viewMode === "weekly" && weeklyData.length > 0) {
      const latest = weeklyData[0];
      const prior = weeklyData[1];
      const avgTotal = Math.round(
        weeklyData.reduce((s, w) => s + w.total, 0) / weeklyData.length
      );
      return {
        latestTotal: latest.total,
        latestDate: latest.weekStartDate,
        avgTotal,
        priorTotal: prior?.total ?? 0,
        weekCount: weeklyData.length,
      };
    }
    if (viewMode === "monthly" && monthlyData.length > 0) {
      const latest = monthlyData[monthlyData.length - 1];
      const avgTotal = Math.round(
        monthlyData.reduce((s, m) => s + m.avgWeeklyTotal, 0) / monthlyData.length
      );
      return {
        latestTotal: latest.avgWeeklyTotal,
        latestDate: `${MONTH_NAMES[latest.month - 1]} ${latest.year}`,
        avgTotal,
        priorTotal: monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].avgWeeklyTotal : 0,
        weekCount: monthlyData.reduce((s, m) => s + m.weekCount, 0),
      };
    }
    if (viewMode === "yearly" && yearlyData.length > 0) {
      const latest = yearlyData[0];
      const prior = yearlyData[1];
      return {
        latestTotal: latest.avgWeeklyTotal,
        latestDate: String(latest.year),
        avgTotal: latest.avgWeeklyTotal,
        priorTotal: prior?.avgWeeklyTotal ?? 0,
        weekCount: latest.weekCount,
      };
    }
    return null;
  }, [viewMode, weeklyData, monthlyData, yearlyData]);

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
        youngAdults: m.youngAdults > 0 ? Math.round(m.youngAdults / m.weekCount) : 0,
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
        youngAdults: y.youngAdults > 0 ? Math.round(y.youngAdults / y.weekCount) : 0,
        ftg: y.ftg > 0 ? Math.round(y.ftg / y.weekCount) : 0,
      }));
    }
    return [];
  }, [viewMode, weeklyData, monthlyData, yearlyData]);

  // ─── Kids Room Breakdown ──────────────────────────────────
  const kidsRoomData = kidsRoomQueryData ?? [];
  const kidsRoomSections = useMemo(() => {
    if (kidsRoomData.length === 0) return [];

    // Filter sections based on campus selection
    const filteredSections = campus === "all" || !campus
      ? KIDS_SECTIONS
      : KIDS_SECTIONS.filter(s => s.campus === campus);

    return filteredSections.map(section => {
      const sectionRooms = section.rooms
        .map(roomName => {
          const match = kidsRoomData.find(
            r => r.campus === section.campus && r.room === roomName
          );
          return match ? { label: roomName, avg: match.avgWeekly, weeks: match.weekCount } : null;
        })
        .filter((r): r is { label: string; avg: number; weeks: number } => r !== null && r.avg > 0);

      return { title: section.title, campus: section.campus, items: sectionRooms };
    }).filter(s => s.items.length > 0);
  }, [kidsRoomData, campus]);

  const maxKidsAvg = useMemo(() => {
    const allAvgs = kidsRoomSections.flatMap(s => s.items.map(i => i.avg));
    return Math.max(...allAvgs, 1);
  }, [kidsRoomSections]);

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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label={viewMode === "yearly" ? "Avg Weekly Attendance" : viewMode === "monthly" ? "Latest Month Avg" : "Latest Week Total"}
                value={formatNumber(kpis.latestTotal)}
                subtitle={viewMode === "yearly" ? kpis.latestDate : viewMode === "monthly" ? kpis.latestDate : formatDate(kpis.latestDate)}
                borderColor="#E8913A"
                change={kpis.priorTotal > 0 ? getYoYChange(kpis.latestTotal, kpis.priorTotal) : undefined}
              />
              <KpiCard
                label={viewMode === "weekly" ? "Season Average" : "Weeks of Data"}
                value={viewMode === "weekly" ? formatNumber(kpis.avgTotal) : String(kpis.weekCount)}
                subtitle={viewMode === "weekly" ? `Across ${kpis.weekCount} weeks` : "Total weeks in period"}
                borderColor="#4A7FB5"
              />
              {viewMode === "weekly" && kpis.priorTotal > 0 && (
                <KpiCard
                  label="Prior Week"
                  value={formatNumber(kpis.priorTotal)}
                  subtitle="Previous Sunday"
                  borderColor="#4A7C59"
                />
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
                          const val = m[avgKey] ?? (m[am.key] > 0 ? Math.round(m[am.key] / m.weekCount) : 0);
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
                          const avgKey = `avgWeekly${am.key.charAt(0).toUpperCase() + am.key.slice(1)}`;
                          const vals = monthlyData.filter(m => (m[avgKey] ?? 0) > 0).map(m => m[avgKey] ?? 0);
                          const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
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
                            const val = y[avgKey] ?? (y[m.key] > 0 ? Math.round(y[m.key] / y.weekCount) : 0);
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
                      {section.items.map((item) => (
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
                                backgroundColor: KIDS_ROOM_COLORS[item.label] || "#E8913A",
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
