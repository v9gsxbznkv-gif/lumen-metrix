/**
 * Attendance Tab — weekly / monthly / yearly views
 * Powered by trpc.dataViews.attendance endpoints
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  formatNumber,
  CAMPUS_COLORS,
  MONTH_NAMES,
} from "@/lib/data";

type ViewMode = "weekly" | "monthly" | "yearly";

const SUBGROUP_COLORS: Record<string, string> = {
  Adults: "#4A7C59",
  Kids: "#E8913A",
  Students: "#4A7FB5",
  "Young Adults": "#8B6DAF",
  Online: "#8B6DAF",
  Volunteers: "#C45B4A",
  FTG: "#C2703E",
};

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

// Primary subgroups to show in the main summary
const PRIMARY_SUBGROUPS = ["Adults", "Kids", "Students", "Young Adults", "Online"];

export default function AttendanceTab2() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [year, setYear] = useState<number>(2026);
  const [campus, setCampus] = useState<string>("all");

  const yearsQuery = trpc.dataViews.attendance.getYears.useQuery();
  const years = yearsQuery.data ?? [2026];

  const campusFilter = campus === "all" ? undefined : campus;

  const dataQuery = trpc.dataViews.attendance.getData.useQuery({
    viewMode,
    campus: campusFilter,
    year: viewMode === "yearly" ? undefined : year,
    startYear: viewMode === "yearly" ? Math.min(...years) : undefined,
    endYear: viewMode === "yearly" ? Math.max(...years) : undefined,
  });

  const isLoading = dataQuery.isLoading;
  const rawData = dataQuery.data;

  // ─── Weekly View ──────────────────────────────────────────
  const weeklyTableData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "weekly") return [];
    const rows = rawData.data as any[];

    // Group by weekNumber + weekStartDate, aggregate subgroups
    const weekMap = new Map<number, {
      weekNumber: number;
      weekStartDate: string;
      subgroups: Record<string, number>;
      total: number;
    }>();

    for (const row of rows) {
      const existing = weekMap.get(row.weekNumber);
      if (existing) {
        existing.subgroups[row.subgroup] = (existing.subgroups[row.subgroup] || 0) + row.headcount;
        existing.total += row.headcount;
      } else {
        weekMap.set(row.weekNumber, {
          weekNumber: row.weekNumber,
          weekStartDate: row.weekStartDate,
          subgroups: { [row.subgroup]: row.headcount },
          total: row.headcount,
        });
      }
    }

    return Array.from(weekMap.values()).sort((a, b) => b.weekNumber - a.weekNumber);
  }, [rawData]);

  // ─── Monthly View ─────────────────────────────────────────
  const monthlyTableData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "monthly") return [];
    const rows = rawData.data as any[];

    // Group by month, aggregate subgroups
    const monthMap = new Map<number, {
      month: number;
      subgroups: Record<string, { total: number; avgWeekly: number }>;
      totalHeadcount: number;
      avgWeekly: number;
      weekCount: number;
    }>();

    for (const row of rows) {
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.subgroups[row.subgroup] = {
          total: row.totalHeadcount,
          avgWeekly: row.avgWeekly,
        };
        existing.totalHeadcount += row.totalHeadcount;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
      } else {
        monthMap.set(row.month, {
          month: row.month,
          subgroups: {
            [row.subgroup]: {
              total: row.totalHeadcount,
              avgWeekly: row.avgWeekly,
            },
          },
          totalHeadcount: row.totalHeadcount,
          avgWeekly: 0,
          weekCount: row.weekCount,
        });
      }
    }

    // Calculate total avg weekly for each month
    return Array.from(monthMap.values())
      .map((m) => ({
        ...m,
        avgWeekly: m.weekCount > 0 ? Math.round(m.totalHeadcount / m.weekCount) : 0,
      }))
      .sort((a, b) => a.month - b.month);
  }, [rawData]);

  // ─── Yearly View ──────────────────────────────────────────
  const yearlyTableData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "yearly") return [];
    const rows = rawData.data as any[];

    // Group by year, aggregate subgroups
    const yearMap = new Map<number, {
      year: number;
      subgroups: Record<string, { total: number; avgWeekly: number }>;
      totalHeadcount: number;
      avgWeekly: number;
      weekCount: number;
    }>();

    for (const row of rows) {
      const existing = yearMap.get(row.year);
      if (existing) {
        existing.subgroups[row.subgroup] = {
          total: row.totalHeadcount,
          avgWeekly: row.avgWeekly,
        };
        existing.totalHeadcount += row.totalHeadcount;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
      } else {
        yearMap.set(row.year, {
          year: row.year,
          subgroups: {
            [row.subgroup]: {
              total: row.totalHeadcount,
              avgWeekly: row.avgWeekly,
            },
          },
          totalHeadcount: row.totalHeadcount,
          avgWeekly: 0,
          weekCount: row.weekCount,
        });
      }
    }

    return Array.from(yearMap.values())
      .map((y) => ({
        ...y,
        avgWeekly: y.weekCount > 0 ? Math.round(y.totalHeadcount / y.weekCount) : 0,
      }))
      .sort((a, b) => b.year - a.year);
  }, [rawData]);

  // ─── KPI Cards ────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!rawData) return null;

    if (viewMode === "weekly" && weeklyTableData.length > 0) {
      const latest = weeklyTableData[0];
      const prior = weeklyTableData[1];
      const avgTotal = Math.round(
        weeklyTableData.reduce((s, w) => s + w.total, 0) / weeklyTableData.length
      );
      return {
        latestTotal: latest.total,
        latestDate: latest.weekStartDate,
        avgTotal,
        priorTotal: prior?.total ?? 0,
        weekCount: weeklyTableData.length,
      };
    }

    if (viewMode === "yearly" && yearlyTableData.length > 0) {
      const latest = yearlyTableData[0];
      const prior = yearlyTableData[1];
      return {
        latestTotal: latest.avgWeekly,
        latestDate: String(latest.year),
        avgTotal: latest.avgWeekly,
        priorTotal: prior?.avgWeekly ?? 0,
        weekCount: latest.weekCount,
      };
    }

    return null;
  }, [rawData, viewMode, weeklyTableData, yearlyTableData]);

  // ─── Chart Data ───────────────────────────────────────────
  const chartData = useMemo(() => {
    if (viewMode === "weekly") {
      return weeklyTableData
        .slice()
        .reverse()
        .map((w) => ({
          label: w.weekStartDate.slice(5), // MM-DD
          total: w.total,
          ...Object.fromEntries(
            PRIMARY_SUBGROUPS.filter((s) => w.subgroups[s]).map((s) => [s, w.subgroups[s]])
          ),
        }));
    }

    if (viewMode === "monthly") {
      return monthlyTableData.map((m) => ({
        label: MONTH_NAMES[m.month - 1],
        total: m.avgWeekly,
        ...Object.fromEntries(
          PRIMARY_SUBGROUPS.filter((s) => m.subgroups[s]).map((s) => [s, m.subgroups[s]?.avgWeekly ?? 0])
        ),
      }));
    }

    if (viewMode === "yearly") {
      return yearlyTableData
        .slice()
        .reverse()
        .map((y) => ({
          label: String(y.year),
          total: y.avgWeekly,
          ...Object.fromEntries(
            PRIMARY_SUBGROUPS.filter((s) => y.subgroups[s]).map((s) => [s, y.subgroups[s]?.avgWeekly ?? 0])
          ),
        }));
    }

    return [];
  }, [viewMode, weeklyTableData, monthlyTableData, yearlyTableData]);

  // Detect which subgroups are present in the data
  const activeSubgroups = useMemo(() => {
    return PRIMARY_SUBGROUPS.filter((s) =>
      chartData.some((d) => (d as any)[s] > 0)
    );
  }, [chartData]);

  // ─── Format date for display ──────────────────────────────
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
                label={viewMode === "yearly" ? "Avg Weekly Attendance" : "Latest Week Total"}
                value={formatNumber(kpis.latestTotal)}
                subtitle={viewMode === "yearly" ? `${kpis.latestDate}` : formatDate(kpis.latestDate)}
                borderColor="#E8913A"
                change={kpis.priorTotal > 0 ? getYoYChange(kpis.latestTotal, kpis.priorTotal) : undefined}
              />
              <KpiCard
                label={viewMode === "weekly" ? "Season Average" : "Weeks of Data"}
                value={viewMode === "weekly" ? formatNumber(kpis.avgTotal) : String(kpis.weekCount)}
                subtitle={viewMode === "weekly" ? `${kpis.weekCount} weeks in ${year}` : viewMode === "yearly" ? "in latest year" : `in ${year}`}
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
                    {activeSubgroups.map((sg) => (
                      <Bar
                        key={sg}
                        dataKey={sg}
                        stackId="a"
                        fill={SUBGROUP_COLORS[sg] || "#9CA3AF"}
                        radius={sg === activeSubgroups[activeSubgroups.length - 1] ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        maxBarSize={40}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <AreaChart data={chartData}>
                    <defs>
                      {activeSubgroups.map((sg) => (
                        <linearGradient key={sg} id={`att2-grad-${sg}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SUBGROUP_COLORS[sg] || "#9CA3AF"} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={SUBGROUP_COLORS[sg] || "#9CA3AF"} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} interval={viewMode === "weekly" ? Math.max(0, Math.floor(chartData.length / 12)) : 0} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
                    {activeSubgroups.map((sg) => (
                      <Area
                        key={sg}
                        type="monotone"
                        dataKey={sg}
                        stroke={SUBGROUP_COLORS[sg] || "#9CA3AF"}
                        strokeWidth={2}
                        fill={`url(#att2-grad-${sg})`}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    {PRIMARY_SUBGROUPS.filter((s) => weeklyTableData.some((w) => w.subgroups[s])).map((sg) => (
                      <TableHead key={sg} className="text-xs text-right">{sg}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyTableData.map((w) => (
                    <TableRow key={w.weekNumber}>
                      <TableCell className="text-xs font-medium">{formatDate(w.weekStartDate)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(w.total)}</TableCell>
                      {PRIMARY_SUBGROUPS.filter((s) => weeklyTableData.some((wk) => wk.subgroups[s])).map((sg) => (
                        <TableCell key={sg} className="text-xs text-right font-mono">
                          {w.subgroups[sg] ? formatNumber(w.subgroups[sg]) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                {weeklyTableData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Average</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {formatNumber(Math.round(weeklyTableData.reduce((s, w) => s + w.total, 0) / weeklyTableData.length))}
                      </TableCell>
                      {PRIMARY_SUBGROUPS.filter((s) => weeklyTableData.some((wk) => wk.subgroups[s])).map((sg) => {
                        const vals = weeklyTableData.filter((w) => w.subgroups[sg]).map((w) => w.subgroups[sg]);
                        const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
                        return (
                          <TableCell key={sg} className="text-xs text-right font-mono">
                            {avg > 0 ? formatNumber(avg) : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            )}

            {viewMode === "monthly" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Month</TableHead>
                    <TableHead className="text-xs text-right">Avg Weekly</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    {PRIMARY_SUBGROUPS.filter((s) => monthlyTableData.some((m) => m.subgroups[s])).map((sg) => (
                      <TableHead key={sg} className="text-xs text-right">{sg}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTableData.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="text-xs font-medium">{MONTH_NAMES[m.month - 1]}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(m.avgWeekly)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatNumber(m.totalHeadcount)}</TableCell>
                      {PRIMARY_SUBGROUPS.filter((s) => monthlyTableData.some((mo) => mo.subgroups[s])).map((sg) => (
                        <TableCell key={sg} className="text-xs text-right font-mono">
                          {m.subgroups[sg] ? formatNumber(m.subgroups[sg].avgWeekly) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                {monthlyTableData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Year Avg</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {formatNumber(Math.round(monthlyTableData.reduce((s, m) => s + m.avgWeekly, 0) / monthlyTableData.length))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {formatNumber(monthlyTableData.reduce((s, m) => s + m.totalHeadcount, 0))}
                      </TableCell>
                      {PRIMARY_SUBGROUPS.filter((s) => monthlyTableData.some((mo) => mo.subgroups[s])).map((sg) => {
                        const vals = monthlyTableData.filter((m) => m.subgroups[sg]).map((m) => m.subgroups[sg]!.avgWeekly);
                        const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
                        return (
                          <TableCell key={sg} className="text-xs text-right font-mono">
                            {avg > 0 ? formatNumber(avg) : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            )}

            {viewMode === "yearly" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Year</TableHead>
                    <TableHead className="text-xs text-right">Avg Weekly</TableHead>
                    <TableHead className="text-xs text-right">Weeks</TableHead>
                    {PRIMARY_SUBGROUPS.filter((s) => yearlyTableData.some((y) => y.subgroups[s])).map((sg) => (
                      <TableHead key={sg} className="text-xs text-right">{sg}</TableHead>
                    ))}
                    <TableHead className="text-xs text-right">YoY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlyTableData.map((y, i) => {
                    const prior = yearlyTableData[i + 1];
                    const change = prior ? getYoYChange(y.avgWeekly, prior.avgWeekly) : null;
                    return (
                      <TableRow key={y.year}>
                        <TableCell className="text-xs font-medium">{y.year}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(y.avgWeekly)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{y.weekCount}</TableCell>
                        {PRIMARY_SUBGROUPS.filter((s) => yearlyTableData.some((yr) => yr.subgroups[s])).map((sg) => (
                          <TableCell key={sg} className="text-xs text-right font-mono">
                            {y.subgroups[sg] ? formatNumber(y.subgroups[sg].avgWeekly) : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs text-right">
                          {change ? (
                            <span
                              className="font-semibold"
                              style={{ color: change.positive ? "#4A7C59" : "#C45B4A" }}
                            >
                              {change.label}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
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
