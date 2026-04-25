/**
 * Assimilation Tab (renamed from People) — weekly / monthly / yearly views
 * Metrics: First-Time Guests, Salvations, Baptisms, Stewardship
 * Powered by trpc.dataViews.nextSteps endpoints
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
import { formatNumber, MONTH_NAMES } from "@/lib/data";

type ViewMode = "weekly" | "monthly" | "yearly";

const METRIC_COLORS: Record<string, string> = {
  ftg: "#E8913A",
  salvation: "#4A7C59",
  baptism: "#4A7FB5",
  stewardship: "#8B6AAE",
};

const METRIC_LABELS: Record<string, string> = {
  ftg: "First-Time Guests",
  salvation: "Salvations",
  baptism: "Baptisms",
  stewardship: "Stewardship",
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getYoYChange(current: number, prior: number) {
  if (prior === 0) return { label: "N/A", positive: true, value: 0 };
  const pct = ((current - prior) / prior) * 100;
  return { label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, positive: pct >= 0, value: pct };
}

export default function AssimilationTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [year, setYear] = useState<number>(2026);
  const [campus, setCampus] = useState<string>("all");
  const [selectedMetric, setSelectedMetric] = useState<string>("all");

  const yearsQuery = trpc.dataViews.nextSteps.getYears.useQuery();
  const years = yearsQuery.data ?? [2026];
  const metricsQuery = trpc.dataViews.nextSteps.getMetrics.useQuery();
  const metrics = metricsQuery.data ?? [];

  const campusFilter = campus === "all" ? undefined : campus;
  const metricFilter = selectedMetric === "all" ? undefined : selectedMetric;

  const dataQuery = trpc.dataViews.nextSteps.getData.useQuery({
    viewMode,
    campus: campusFilter,
    year: viewMode === "yearly" ? undefined : year,
    startYear: viewMode === "yearly" ? Math.min(...years) : undefined,
    endYear: viewMode === "yearly" ? Math.max(...years) : undefined,
    metric: metricFilter,
  });

  const isLoading = dataQuery.isLoading;
  const rawData = dataQuery.data;

  // ─── Weekly ───────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "weekly") return [];
    const rows = rawData.data as any[];

    // Group by weekNumber, then by metric
    const weekMap = new Map<number, {
      weekNumber: number;
      weekStartDate: string;
      metrics: Record<string, number>;
      total: number;
    }>();

    for (const row of rows) {
      const existing = weekMap.get(row.weekNumber);
      if (existing) {
        existing.metrics[row.metric] = (existing.metrics[row.metric] || 0) + row.count;
        existing.total += row.count;
      } else {
        weekMap.set(row.weekNumber, {
          weekNumber: row.weekNumber,
          weekStartDate: row.weekStartDate,
          metrics: { [row.metric]: row.count },
          total: row.count,
        });
      }
    }

    return Array.from(weekMap.values()).sort((a, b) => b.weekNumber - a.weekNumber);
  }, [rawData]);

  // ─── Monthly ──────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "monthly") return [];
    const rows = rawData.data as any[];

    const monthMap = new Map<number, {
      month: number;
      metrics: Record<string, number>;
      total: number;
      weekCount: number;
    }>();

    for (const row of rows) {
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.metrics[row.metric] = (existing.metrics[row.metric] || 0) + row.count;
        existing.total += row.count;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
      } else {
        monthMap.set(row.month, {
          month: row.month,
          metrics: { [row.metric]: row.count },
          total: row.count,
          weekCount: row.weekCount,
        });
      }
    }

    return Array.from(monthMap.values()).sort((a, b) => a.month - b.month);
  }, [rawData]);

  // ─── Yearly ───────────────────────────────────────────────
  const yearlyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "yearly") return [];
    const rows = rawData.data as any[];

    const yearMap = new Map<number, {
      year: number;
      metrics: Record<string, number>;
      total: number;
      weekCount: number;
    }>();

    for (const row of rows) {
      const existing = yearMap.get(row.year);
      if (existing) {
        existing.metrics[row.metric] = (existing.metrics[row.metric] || 0) + row.count;
        existing.total += row.count;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
      } else {
        yearMap.set(row.year, {
          year: row.year,
          metrics: { [row.metric]: row.count },
          total: row.count,
          weekCount: row.weekCount,
        });
      }
    }

    return Array.from(yearMap.values()).sort((a, b) => b.year - a.year);
  }, [rawData]);

  // Determine which metrics are active in the data
  const activeMetrics = useMemo(() => {
    const allMetrics = new Set<string>();
    const source = viewMode === "weekly" ? weeklyData : viewMode === "monthly" ? monthlyData : yearlyData;
    for (const row of source) {
      for (const m of Object.keys(row.metrics)) allMetrics.add(m);
    }
    return Array.from(allMetrics).sort();
  }, [viewMode, weeklyData, monthlyData, yearlyData]);

  // ─── Chart Data ───────────────────────────────────────────
  const chartData = useMemo(() => {
    if (viewMode === "weekly") {
      return weeklyData.slice().reverse().map(w => {
        const entry: any = { label: w.weekStartDate.slice(5) };
        for (const m of activeMetrics) entry[METRIC_LABELS[m] || m] = w.metrics[m] || 0;
        return entry;
      });
    }
    if (viewMode === "monthly") {
      return monthlyData.map(m => {
        const entry: any = { label: MONTH_NAMES[m.month - 1] };
        for (const met of activeMetrics) entry[METRIC_LABELS[met] || met] = m.metrics[met] || 0;
        return entry;
      });
    }
    return yearlyData.slice().reverse().map(y => {
      const entry: any = { label: String(y.year) };
      for (const m of activeMetrics) entry[METRIC_LABELS[m] || m] = y.metrics[m] || 0;
      return entry;
    });
  }, [viewMode, weeklyData, monthlyData, yearlyData, activeMetrics]);

  // ─── KPIs ─────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (viewMode === "weekly" && weeklyData.length > 0) {
      const ytd: Record<string, number> = {};
      for (const w of weeklyData) {
        for (const [m, c] of Object.entries(w.metrics)) ytd[m] = (ytd[m] || 0) + c;
      }
      return { ytd, weekCount: weeklyData.length };
    }
    if (viewMode === "yearly" && yearlyData.length > 0) {
      return { ytd: yearlyData[0].metrics, weekCount: yearlyData[0].weekCount, prior: yearlyData[1]?.metrics };
    }
    if (viewMode === "monthly" && monthlyData.length > 0) {
      const ytd: Record<string, number> = {};
      for (const m of monthlyData) {
        for (const [met, c] of Object.entries(m.metrics)) ytd[met] = (ytd[met] || 0) + c;
      }
      return { ytd, weekCount: monthlyData.length };
    }
    return null;
  }, [viewMode, weeklyData, yearlyData, monthlyData]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="weekly" className="text-xs px-3">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs px-3">Monthly</TabsTrigger>
            <TabsTrigger value="yearly" className="text-xs px-3">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 flex-wrap">
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

          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-[160px] h-8 text-xs bg-card border-border/60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Metrics</SelectItem>
              {metrics.map(m => <SelectItem key={m} value={m}>{METRIC_LABELS[m] || m}</SelectItem>)}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {activeMetrics.map(m => (
                <KpiCard
                  key={m}
                  label={METRIC_LABELS[m] || m}
                  value={formatNumber(kpis.ytd[m] || 0)}
                  subtitle={viewMode === "yearly" ? `${yearlyData[0]?.year ?? year}` : `${year} YTD`}
                  borderColor={METRIC_COLORS[m] || "#888"}
                  change={kpis.prior ? getYoYChange(kpis.ytd[m] || 0, kpis.prior[m] || 0) : undefined}
                />
              ))}
            </div>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>
                {viewMode === "weekly" && `Weekly Assimilation — ${year}`}
                {viewMode === "monthly" && `Monthly Assimilation — ${year}`}
                {viewMode === "yearly" && "Annual Assimilation by Year"}
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} interval={viewMode === "weekly" ? Math.max(0, Math.floor(chartData.length / 12)) : 0} />
                  <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TT} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
                  {activeMetrics.map((m, i) => (
                    <Bar
                      key={m}
                      dataKey={METRIC_LABELS[m] || m}
                      fill={METRIC_COLORS[m] || "#888"}
                      maxBarSize={viewMode === "yearly" ? 40 : 20}
                      radius={i === activeMetrics.length - 1 ? [2, 2, 0, 0] : undefined}
                    />
                  ))}
                </BarChart>
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
                    {activeMetrics.map(m => (
                      <TableHead key={m} className="text-xs text-right">{METRIC_LABELS[m] || m}</TableHead>
                    ))}
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.map(w => (
                    <TableRow key={w.weekNumber}>
                      <TableCell className="text-xs font-medium">{formatDate(w.weekStartDate)}</TableCell>
                      {activeMetrics.map(m => (
                        <TableCell key={m} className="text-xs text-right font-mono">{w.metrics[m] || 0}</TableCell>
                      ))}
                      <TableCell className="text-xs text-right font-mono font-semibold">{w.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {weeklyData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">YTD Total</TableCell>
                      {activeMetrics.map(m => (
                        <TableCell key={m} className="text-xs text-right font-mono font-semibold">
                          {weeklyData.reduce((s, w) => s + (w.metrics[m] || 0), 0)}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {weeklyData.reduce((s, w) => s + w.total, 0)}
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
                    {activeMetrics.map(m => (
                      <TableHead key={m} className="text-xs text-right">{METRIC_LABELS[m] || m}</TableHead>
                    ))}
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map(m => (
                    <TableRow key={m.month}>
                      <TableCell className="text-xs font-medium">{MONTH_NAMES[m.month - 1]}</TableCell>
                      {activeMetrics.map(met => (
                        <TableCell key={met} className="text-xs text-right font-mono">{m.metrics[met] || 0}</TableCell>
                      ))}
                      <TableCell className="text-xs text-right font-mono font-semibold">{m.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {monthlyData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Year Total</TableCell>
                      {activeMetrics.map(met => (
                        <TableCell key={met} className="text-xs text-right font-mono font-semibold">
                          {monthlyData.reduce((s, m) => s + (m.metrics[met] || 0), 0)}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {monthlyData.reduce((s, m) => s + m.total, 0)}
                      </TableCell>
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
                    {activeMetrics.map(m => (
                      <TableHead key={m} className="text-xs text-right">{METRIC_LABELS[m] || m}</TableHead>
                    ))}
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">YoY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlyData.map((y, i) => {
                    const prior = yearlyData[i + 1];
                    const change = prior ? getYoYChange(y.total, prior.total) : null;
                    return (
                      <TableRow key={y.year}>
                        <TableCell className="text-xs font-medium">{y.year}</TableCell>
                        {activeMetrics.map(m => (
                          <TableCell key={m} className="text-xs text-right font-mono">{y.metrics[m] || 0}</TableCell>
                        ))}
                        <TableCell className="text-xs text-right font-mono font-semibold">{y.total}</TableCell>
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
          No assimilation data available for this selection.
        </div>
      )}
    </div>
  );
}
