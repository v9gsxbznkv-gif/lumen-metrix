/**
 * Team Members Tab (renamed from Volunteers) — weekly / monthly / yearly views
 * Shows both Scheduled and Confirmed (checked-in) counts.
 * Confirmed is the primary weekly number used for averages.
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
  Legend,
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
    const weekMap = new Map<number, { weekNumber: number; weekStartDate: string; total: number; scheduled: number; confirmed: number; campuses: Record<string, number> }>();
    for (const row of rows) {
      const existing = weekMap.get(row.weekNumber);
      if (existing) {
        existing.total += row.total;
        existing.scheduled += (row.scheduled || 0);
        existing.confirmed += (row.confirmed || 0);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        weekMap.set(row.weekNumber, {
          weekNumber: row.weekNumber,
          weekStartDate: row.weekStartDate,
          total: row.total,
          scheduled: row.scheduled || 0,
          confirmed: row.confirmed || 0,
          campuses: { [row.campus]: row.total },
        });
      }
    }
    return Array.from(weekMap.values()).sort((a, b) => b.weekNumber - a.weekNumber);
  }, [rawData]);

  // ─── Monthly ──────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "monthly") return [];
    const rows = rawData.data as any[];
    const monthMap = new Map<number, { month: number; total: number; scheduled: number; confirmed: number; avgWeekly: number; avgScheduled: number; avgConfirmed: number; weekCount: number; campuses: Record<string, number> }>();
    for (const row of rows) {
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.total += row.total;
        existing.scheduled += (row.scheduled || 0);
        existing.confirmed += (row.confirmed || 0);
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        monthMap.set(row.month, {
          month: row.month,
          total: row.total,
          scheduled: row.scheduled || 0,
          confirmed: row.confirmed || 0,
          avgWeekly: 0,
          avgScheduled: 0,
          avgConfirmed: 0,
          weekCount: row.weekCount,
          campuses: { [row.campus]: row.total },
        });
      }
    }
    return Array.from(monthMap.values())
      .map(m => ({
        ...m,
        avgWeekly: m.weekCount > 0 ? Math.round(m.total / m.weekCount) : 0,
        avgScheduled: m.weekCount > 0 ? Math.round(m.scheduled / m.weekCount) : 0,
        avgConfirmed: m.weekCount > 0 ? Math.round(m.confirmed / m.weekCount) : 0,
      }))
      .sort((a, b) => a.month - b.month);
  }, [rawData]);

  // ─── Yearly ───────────────────────────────────────────────
  const yearlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "yearly") return [];
    const rows = rawData.data as any[];
    const yearMap = new Map<number, { year: number; total: number; scheduled: number; confirmed: number; avgWeekly: number; avgScheduled: number; avgConfirmed: number; weekCount: number; campuses: Record<string, number> }>();
    for (const row of rows) {
      const existing = yearMap.get(row.year);
      if (existing) {
        existing.total += row.total;
        existing.scheduled += (row.scheduled || 0);
        existing.confirmed += (row.confirmed || 0);
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        yearMap.set(row.year, {
          year: row.year,
          total: row.total,
          scheduled: row.scheduled || 0,
          confirmed: row.confirmed || 0,
          avgWeekly: 0,
          avgScheduled: 0,
          avgConfirmed: 0,
          weekCount: row.weekCount,
          campuses: { [row.campus]: row.total },
        });
      }
    }
    return Array.from(yearMap.values())
      .map(y => ({
        ...y,
        avgWeekly: y.weekCount > 0 ? Math.round(y.total / y.weekCount) : 0,
        avgScheduled: y.weekCount > 0 ? Math.round(y.scheduled / y.weekCount) : 0,
        avgConfirmed: y.weekCount > 0 ? Math.round(y.confirmed / y.weekCount) : 0,
      }))
      .sort((a, b) => b.year - a.year);
  }, [rawData]);

  const chartData = useMemo(() => {
    if (viewMode === "weekly") return weeklyData.slice().reverse().map(w => ({
      label: w.weekStartDate.slice(5),
      Scheduled: w.scheduled,
      "Checked In": w.confirmed,
    }));
    if (viewMode === "monthly") return monthlyData.map(m => ({
      label: MONTH_NAMES[m.month - 1],
      Scheduled: m.avgScheduled,
      "Checked In": m.avgConfirmed,
    }));
    return yearlyData.slice().reverse().map(y => ({
      label: String(y.year),
      Scheduled: y.avgScheduled,
      "Checked In": y.avgConfirmed,
    }));
  }, [viewMode, weeklyData, monthlyData, yearlyData]);

  const kpis = useMemo(() => {
    if (viewMode === "weekly" && weeklyData.length > 0) {
      const latest = weeklyData[0];
      const prior = weeklyData[1];
      const avgConfirmed = Math.round(weeklyData.reduce((s, w) => s + w.confirmed, 0) / weeklyData.length);
      const avgScheduled = Math.round(weeklyData.reduce((s, w) => s + w.scheduled, 0) / weeklyData.length);
      return {
        latestConfirmed: latest.confirmed,
        latestScheduled: latest.scheduled,
        latestDate: latest.weekStartDate,
        avgConfirmed,
        avgScheduled,
        priorConfirmed: prior?.confirmed ?? 0,
        weekCount: weeklyData.length,
      };
    }
    if (viewMode === "yearly" && yearlyData.length > 0) {
      const latest = yearlyData[0];
      const prior = yearlyData[1];
      return {
        latestConfirmed: latest.avgConfirmed,
        latestScheduled: latest.avgScheduled,
        latestDate: String(latest.year),
        avgConfirmed: latest.avgConfirmed,
        avgScheduled: latest.avgScheduled,
        priorConfirmed: prior?.avgConfirmed ?? 0,
        weekCount: latest.weekCount,
      };
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                label="Checked In"
                value={formatNumber(kpis.latestConfirmed)}
                subtitle={viewMode === "yearly" ? `avg weekly ${kpis.latestDate}` : formatDate(kpis.latestDate)}
                borderColor="#4A7C59"
                change={kpis.priorConfirmed > 0 ? getYoYChange(kpis.latestConfirmed, kpis.priorConfirmed) : undefined}
              />
              <KpiCard
                label="Scheduled"
                value={formatNumber(kpis.latestScheduled)}
                subtitle={viewMode === "yearly" ? `avg weekly ${kpis.latestDate}` : formatDate(kpis.latestDate)}
                borderColor="#4A7FB5"
              />
              <KpiCard
                label="Avg Checked In"
                value={formatNumber(kpis.avgConfirmed)}
                subtitle={`${kpis.weekCount} weeks`}
                borderColor="#C45B4A"
              />
              <KpiCard
                label="Show Rate"
                value={kpis.avgScheduled > 0 ? `${Math.round((kpis.avgConfirmed / kpis.avgScheduled) * 100)}%` : "—"}
                subtitle="confirmed / scheduled"
                borderColor="#E8913A"
              />
            </div>
          )}

          {chartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>
                {viewMode === "weekly" && `Scheduled vs Checked In — ${year}`}
                {viewMode === "monthly" && `Monthly Avg Scheduled vs Checked In — ${year}`}
                {viewMode === "yearly" && "Avg Weekly Scheduled vs Checked In by Year"}
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                {viewMode === "yearly" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Scheduled" fill="#4A7FB5" radius={[3, 3, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Checked In" fill="#4A7C59" radius={[3, 3, 0, 0]} maxBarSize={30} />
                  </BarChart>
                ) : (
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="sched-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4A7FB5" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#4A7FB5" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="conf-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4A7C59" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#4A7C59" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} interval={viewMode === "weekly" ? Math.max(0, Math.floor(chartData.length / 12)) : 0} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TT} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="Scheduled" stroke="#4A7FB5" strokeWidth={2} fill="url(#sched-grad)" dot={viewMode === "monthly" ? { r: 3 } : false} />
                    <Area type="monotone" dataKey="Checked In" stroke="#4A7C59" strokeWidth={2} fill="url(#conf-grad)" dot={viewMode === "monthly" ? { r: 3 } : false} />
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
                    <TableHead className="text-xs text-right">Scheduled</TableHead>
                    <TableHead className="text-xs text-right">Checked In</TableHead>
                    <TableHead className="text-xs text-right">Show Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.map(w => {
                    const showRate = w.scheduled > 0 ? Math.round((w.confirmed / w.scheduled) * 100) : 0;
                    return (
                      <TableRow key={w.weekNumber}>
                        <TableCell className="text-xs font-medium">{formatDate(w.weekStartDate)}</TableCell>
                        <TableCell className="text-xs text-right font-mono" style={{ color: "#4A7FB5" }}>{formatNumber(w.scheduled)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: "#4A7C59" }}>{formatNumber(w.confirmed)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{w.scheduled > 0 ? `${showRate}%` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {weeklyData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Average</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: "#4A7FB5" }}>
                        {formatNumber(Math.round(weeklyData.reduce((s, w) => s + w.scheduled, 0) / weeklyData.length))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: "#4A7C59" }}>
                        {formatNumber(Math.round(weeklyData.reduce((s, w) => s + w.confirmed, 0) / weeklyData.length))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {(() => {
                          const totalSched = weeklyData.reduce((s, w) => s + w.scheduled, 0);
                          const totalConf = weeklyData.reduce((s, w) => s + w.confirmed, 0);
                          return totalSched > 0 ? `${Math.round((totalConf / totalSched) * 100)}%` : "—";
                        })()}
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
                    <TableHead className="text-xs text-right">Avg Scheduled</TableHead>
                    <TableHead className="text-xs text-right">Avg Checked In</TableHead>
                    <TableHead className="text-xs text-right">Show Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map(m => {
                    const showRate = m.avgScheduled > 0 ? Math.round((m.avgConfirmed / m.avgScheduled) * 100) : 0;
                    return (
                      <TableRow key={m.month}>
                        <TableCell className="text-xs font-medium">{MONTH_NAMES[m.month - 1]}</TableCell>
                        <TableCell className="text-xs text-right font-mono" style={{ color: "#4A7FB5" }}>{formatNumber(m.avgScheduled)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: "#4A7C59" }}>{formatNumber(m.avgConfirmed)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{m.avgScheduled > 0 ? `${showRate}%` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {viewMode === "yearly" && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Year</TableHead>
                    <TableHead className="text-xs text-right">Avg Scheduled</TableHead>
                    <TableHead className="text-xs text-right">Avg Checked In</TableHead>
                    <TableHead className="text-xs text-right">Show Rate</TableHead>
                    <TableHead className="text-xs text-right">Weeks</TableHead>
                    <TableHead className="text-xs text-right">YoY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlyData.map((y, i) => {
                    const prior = yearlyData[i + 1];
                    const change = prior ? getYoYChange(y.avgConfirmed, prior.avgConfirmed) : null;
                    const showRate = y.avgScheduled > 0 ? Math.round((y.avgConfirmed / y.avgScheduled) * 100) : 0;
                    return (
                      <TableRow key={y.year}>
                        <TableCell className="text-xs font-medium">{y.year}</TableCell>
                        <TableCell className="text-xs text-right font-mono" style={{ color: "#4A7FB5" }}>{formatNumber(y.avgScheduled)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: "#4A7C59" }}>{formatNumber(y.avgConfirmed)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{y.avgScheduled > 0 ? `${showRate}%` : "—"}</TableCell>
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
