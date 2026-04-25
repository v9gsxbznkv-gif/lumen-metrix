/**
 * Team Members Tab (renamed from Volunteers) — weekly / monthly / yearly views
 * Powered by trpc.dataViews.serving endpoints
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatNumber, CAMPUS_COLORS, MONTH_NAMES } from "@/lib/data";

type ViewMode = "weekly" | "monthly" | "yearly";

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
  return { label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, positive: pct >= 0, value: pct };
}

export default function TeamMembersTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [year, setYear] = useState<number>(2026);
  const [campus, setCampus] = useState<string>("all");

  const yearsQuery = trpc.dataViews.serving.getYears.useQuery();
  const years = yearsQuery.data ?? [2026];

  const campusFilter = campus === "all" ? undefined : campus;

  const dataQuery = trpc.dataViews.serving.getData.useQuery({
    viewMode,
    campus: campusFilter,
    year: viewMode === "yearly" ? undefined : year,
    startYear: viewMode === "yearly" ? Math.min(...years) : undefined,
    endYear: viewMode === "yearly" ? Math.max(...years) : undefined,
  });

  const isLoading = dataQuery.isLoading;
  const rawData = dataQuery.data;

  // ─── Weekly ───────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "weekly") return [];
    const rows = rawData.data as any[];
    const weekMap = new Map<number, { weekNumber: number; weekStartDate: string; total: number; campuses: Record<string, number> }>();
    for (const row of rows) {
      const existing = weekMap.get(row.weekNumber);
      if (existing) {
        existing.total += row.total;
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        weekMap.set(row.weekNumber, { weekNumber: row.weekNumber, weekStartDate: row.weekStartDate, total: row.total, campuses: { [row.campus]: row.total } });
      }
    }
    return Array.from(weekMap.values()).sort((a, b) => b.weekNumber - a.weekNumber);
  }, [rawData]);

  // ─── Monthly ──────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "monthly") return [];
    const rows = rawData.data as any[];
    const monthMap = new Map<number, { month: number; total: number; avgWeekly: number; weekCount: number; campuses: Record<string, number> }>();
    for (const row of rows) {
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.total += row.total;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        monthMap.set(row.month, { month: row.month, total: row.total, avgWeekly: 0, weekCount: row.weekCount, campuses: { [row.campus]: row.total } });
      }
    }
    return Array.from(monthMap.values())
      .map(m => ({ ...m, avgWeekly: m.weekCount > 0 ? Math.round(m.total / m.weekCount) : 0 }))
      .sort((a, b) => a.month - b.month);
  }, [rawData]);

  // ─── Yearly ───────────────────────────────────────────────
  const yearlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "yearly") return [];
    const rows = rawData.data as any[];
    const yearMap = new Map<number, { year: number; total: number; avgWeekly: number; weekCount: number; campuses: Record<string, number> }>();
    for (const row of rows) {
      const existing = yearMap.get(row.year);
      if (existing) {
        existing.total += row.total;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        yearMap.set(row.year, { year: row.year, total: row.total, avgWeekly: 0, weekCount: row.weekCount, campuses: { [row.campus]: row.total } });
      }
    }
    return Array.from(yearMap.values())
      .map(y => ({ ...y, avgWeekly: y.weekCount > 0 ? Math.round(y.total / y.weekCount) : 0 }))
      .sort((a, b) => b.year - a.year);
  }, [rawData]);

  const chartData = useMemo(() => {
    if (viewMode === "weekly") return weeklyData.slice().reverse().map(w => ({ label: w.weekStartDate.slice(5), Total: w.total }));
    if (viewMode === "monthly") return monthlyData.map(m => ({ label: MONTH_NAMES[m.month - 1], Total: m.avgWeekly }));
    return yearlyData.slice().reverse().map(y => ({ label: String(y.year), Total: y.avgWeekly }));
  }, [viewMode, weeklyData, monthlyData, yearlyData]);

  const kpis = useMemo(() => {
    if (viewMode === "weekly" && weeklyData.length > 0) {
      const latest = weeklyData[0];
      const prior = weeklyData[1];
      const avg = Math.round(weeklyData.reduce((s, w) => s + w.total, 0) / weeklyData.length);
      return { latestTotal: latest.total, latestDate: latest.weekStartDate, avg, priorTotal: prior?.total ?? 0, weekCount: weeklyData.length };
    }
    if (viewMode === "yearly" && yearlyData.length > 0) {
      const latest = yearlyData[0];
      const prior = yearlyData[1];
      return { latestTotal: latest.avgWeekly, latestDate: String(latest.year), avg: latest.avgWeekly, priorTotal: prior?.avgWeekly ?? 0, weekCount: latest.weekCount };
    }
    return null;
  }, [viewMode, weeklyData, yearlyData]);

  return (
    <div className="space-y-5">
      {/* Controls */}
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
              <SelectTrigger className="w-[90px] h-8 text-xs bg-card border-border/60"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={campus} onValueChange={setCampus}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border/60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campuses</SelectItem>
              <SelectItem value="Canton">Canton</SelectItem>
              <SelectItem value="Jasper">Jasper</SelectItem>
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
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard
                label={viewMode === "yearly" ? "Avg Weekly Serving" : "Latest Week"}
                value={formatNumber(kpis.latestTotal)}
                subtitle={viewMode === "yearly" ? kpis.latestDate : formatDate(kpis.latestDate)}
                borderColor="#C45B4A"
                change={kpis.priorTotal > 0 ? getYoYChange(kpis.latestTotal, kpis.priorTotal) : undefined}
              />
              <KpiCard
                label={viewMode === "weekly" ? "Season Average" : "Weeks of Data"}
                value={viewMode === "weekly" ? formatNumber(kpis.avg) : String(kpis.weekCount)}
                subtitle={viewMode === "weekly" ? `${kpis.weekCount} weeks in ${year}` : "in latest year"}
                borderColor="#4A7FB5"
              />
            </div>
          )}

          {chartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>
                {viewMode === "weekly" && `Weekly Team Members — ${year}`}
                {viewMode === "monthly" && `Monthly Avg Team Members — ${year}`}
                {viewMode === "yearly" && "Avg Weekly Team Members by Year"}
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                {viewMode === "yearly" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} />
                    <Bar dataKey="Total" fill="#C45B4A" radius={[3, 3, 0, 0]} maxBarSize={40} />
                  </BarChart>
                ) : (
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="serv-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C45B4A" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#C45B4A" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} interval={viewMode === "weekly" ? Math.max(0, Math.floor(chartData.length / 12)) : 0} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} />
                    <Area type="monotone" dataKey="Total" stroke="#C45B4A" strokeWidth={2} fill="url(#serv-grad)" dot={viewMode === "monthly" ? { r: 3 } : false} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
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
                    <TableHead className="text-xs text-right">Total Serving</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.map(w => (
                    <TableRow key={w.weekNumber}>
                      <TableCell className="text-xs font-medium">{formatDate(w.weekStartDate)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(w.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {weeklyData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Average</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {formatNumber(Math.round(weeklyData.reduce((s, w) => s + w.total, 0) / weeklyData.length))}
                      </TableCell>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map(m => (
                    <TableRow key={m.month}>
                      <TableCell className="text-xs font-medium">{MONTH_NAMES[m.month - 1]}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(m.avgWeekly)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatNumber(m.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {viewMode === "yearly" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Year</TableHead>
                    <TableHead className="text-xs text-right">Avg Weekly</TableHead>
                    <TableHead className="text-xs text-right">Weeks</TableHead>
                    <TableHead className="text-xs text-right">YoY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlyData.map((y, i) => {
                    const prior = yearlyData[i + 1];
                    const change = prior ? getYoYChange(y.avgWeekly, prior.avgWeekly) : null;
                    return (
                      <TableRow key={y.year}>
                        <TableCell className="text-xs font-medium">{y.year}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">{formatNumber(y.avgWeekly)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{y.weekCount}</TableCell>
                        <TableCell className="text-xs text-right">
                          {change ? <span className="font-semibold" style={{ color: change.positive ? "#4A7C59" : "#C45B4A" }}>{change.label}</span> : "—"}
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
          No team member data available for this selection.
        </div>
      )}
    </div>
  );
}
