/**
 * Giving Tab — weekly / monthly / yearly views
 * Powered by trpc.dataViews.giving endpoints
 * Includes Per Capita KPI + YoY weekly chart
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

// National benchmark: $30/person/week (Christian Standard Church Report 2025, combined attendance)
const NATIONAL_AVG_GPC = 30;
import {
  formatCurrency,
  CAMPUS_COLORS,
  MONTH_NAMES,
} from "@/lib/data";

type ViewMode = "weekly" | "monthly" | "yearly";

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

function fmtDollars(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDollarsFull(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

export default function GivingTab2() {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [year, setYear] = useState<number>(2026);
  const [campus, setCampus] = useState<string>("all");

  const yearsQuery = trpc.dataViews.giving.getYears.useQuery();
  const years = yearsQuery.data ?? [2026];

  const campusFilter = campus === "all" ? undefined : campus;

  const dataQuery = trpc.dataViews.giving.getData.useQuery({
    viewMode,
    campus: campusFilter,
    year: viewMode === "yearly" ? undefined : year,
    startYear: viewMode === "yearly" ? Math.min(...years) : undefined,
    endYear: viewMode === "yearly" ? Math.max(...years) : undefined,
  });

  // Prior year data for YTD comparison (weekly view only)
  const priorYearQuery = trpc.dataViews.giving.getData.useQuery(
    { viewMode: "weekly", campus: campusFilter, year: year - 1 },
    { enabled: viewMode === "weekly" }
  );

  // Per capita data (always fetched for the selected year)
  const perCapitaQuery = trpc.dataViews.giving.getPerCapita.useQuery({
    year,
    campus: campusFilter,
  });

  const isLoading = dataQuery.isLoading;
  const rawData = dataQuery.data;

  // ─── Weekly View ──────────────────────────────────────────
  const weeklyTableData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "weekly") return [];
    const rows = rawData.data as any[];

    // Group by weekNumber — sum across campuses for "all" view
    const weekMap = new Map<number, {
      weekNumber: number;
      weekStartDate: string;
      total: number;
      general: number;
      designated: number;
      donationCount: number;
      campuses: Record<string, number>;
    }>();

    for (const row of rows) {
      const existing = weekMap.get(row.weekNumber);
      if (existing) {
        existing.total += row.total;
        existing.general += row.general;
        existing.designated += row.designated;
        existing.donationCount += row.donationCount;
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        weekMap.set(row.weekNumber, {
          weekNumber: row.weekNumber,
          weekStartDate: row.weekStartDate,
          total: row.total,
          general: row.general,
          designated: row.designated,
          donationCount: row.donationCount,
          campuses: { [row.campus]: row.total },
        });
      }
    }

    return Array.from(weekMap.values()).sort((a, b) => b.weekNumber - a.weekNumber);
  }, [rawData]);

  // ─── Monthly View ─────────────────────────────────────────
  const monthlyTableData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "monthly") return [];
    const rows = rawData.data as any[];

    const monthMap = new Map<number, {
      month: number;
      total: number;
      general: number;
      designated: number;
      avgWeekly: number;
      weekCount: number;
      campuses: Record<string, number>;
    }>();

    for (const row of rows) {
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.total += row.total;
        existing.general += row.general;
        existing.designated += row.designated;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        monthMap.set(row.month, {
          month: row.month,
          total: row.total,
          general: row.general,
          designated: row.designated,
          avgWeekly: 0,
          weekCount: row.weekCount,
          campuses: { [row.campus]: row.total },
        });
      }
    }

    return Array.from(monthMap.values())
      .map((m) => ({
        ...m,
        avgWeekly: m.weekCount > 0 ? m.total / m.weekCount : 0,
      }))
      .sort((a, b) => a.month - b.month);
  }, [rawData]);

  // ─── Yearly View ──────────────────────────────────────────
  const yearlyTableData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "yearly") return [];
    const rows = rawData.data as any[];

    const yearMap = new Map<number, {
      year: number;
      total: number;
      general: number;
      designated: number;
      avgWeekly: number;
      weekCount: number;
      campuses: Record<string, number>;
    }>();

    for (const row of rows) {
      const existing = yearMap.get(row.year);
      if (existing) {
        existing.total += row.total;
        existing.general += row.general;
        existing.designated += row.designated;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        yearMap.set(row.year, {
          year: row.year,
          total: row.total,
          general: row.general,
          designated: row.designated,
          avgWeekly: 0,
          weekCount: row.weekCount,
          campuses: { [row.campus]: row.total },
        });
      }
    }

    return Array.from(yearMap.values())
      .map((y) => ({
        ...y,
        avgWeekly: y.weekCount > 0 ? y.total / y.weekCount : 0,
      }))
      .sort((a, b) => b.year - a.year);
  }, [rawData]);

  // ─── KPI Cards ────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!rawData) return null;

    if (viewMode === "weekly" && weeklyTableData.length > 0) {
      // "Current Week" = last full week (skip partial/incomplete latest week)
      // A week is considered partial if its total is less than 30% of the season average
      const ytdTotal = weeklyTableData.reduce((s, w) => s + w.total, 0);
      const avgWeekly = ytdTotal / weeklyTableData.length;
      const threshold = avgWeekly * 0.3;

      // Find the first week from the top (most recent) that exceeds threshold
      let currentWeekIdx = 0;
      if (weeklyTableData[0].total < threshold && weeklyTableData.length > 1) {
        currentWeekIdx = 1;
      }
      const currentWeek = weeklyTableData[currentWeekIdx];
      const priorWeek = weeklyTableData[currentWeekIdx + 1];

      // Prior year same-period YTD comparison
      let ytdChange: { label: string; positive: boolean; value: number } | undefined;
      if (priorYearQuery.data && priorYearQuery.data.viewMode === "weekly") {
        const priorRows = priorYearQuery.data.data as any[];
        const maxWeekNum = weeklyTableData[0]?.weekNumber ?? 52;
        const priorSamePeriod = priorRows.filter((w: any) => w.weekNumber <= maxWeekNum);
        const priorYtdTotal = priorSamePeriod.reduce((s: number, w: any) => s + (w.total || 0), 0);
        if (priorYtdTotal > 0) {
          ytdChange = getYoYChange(ytdTotal, priorYtdTotal);
        }
      }

      return { latest: currentWeek, prior: priorWeek, ytdTotal, avgWeekly, weekCount: weeklyTableData.length, ytdChange };
    }

    if (viewMode === "yearly" && yearlyTableData.length > 0) {
      const latest = yearlyTableData[0];
      const prior = yearlyTableData[1];
      return { latest, prior, ytdTotal: latest.total, avgWeekly: latest.avgWeekly, weekCount: latest.weekCount };
    }

    if (viewMode === "monthly" && monthlyTableData.length > 0) {
      const ytdTotal = monthlyTableData.reduce((s, m) => s + m.total, 0);
      const avgWeekly = ytdTotal / monthlyTableData.reduce((s, m) => s + m.weekCount, 0);
      return { ytdTotal, avgWeekly, weekCount: monthlyTableData.length };
    }

    return null;
  }, [rawData, viewMode, weeklyTableData, yearlyTableData, monthlyTableData, priorYearQuery.data]);

  // ─── Per Capita KPI ───────────────────────────────────────
  const perCapitaKpi = useMemo(() => {
    const pc = perCapitaQuery.data;
    if (!pc) return null;
    const change = pc.priorYearAvgGpc > 0
      ? getYoYChange(pc.currentYearAvgGpc, pc.priorYearAvgGpc)
      : null;
    return {
      avgGpc: pc.currentYearAvgGpc,
      change,
    };
  }, [perCapitaQuery.data]);

  // ─── Per Capita YoY Chart Data ────────────────────────────
  const perCapitaChartData = useMemo(() => {
    const pc = perCapitaQuery.data;
    if (!pc) return [];

    // Build a map of weekNumber -> { current, prior }
    const weekMap = new Map<number, { weekNumber: number; label: string; current?: number; prior?: number }>();

    for (const w of pc.currentYearWeeks) {
      weekMap.set(w.weekNumber, {
        weekNumber: w.weekNumber,
        label: `Wk ${w.weekNumber}`,
        current: w.gpc,
      });
    }

    for (const w of pc.priorYearWeeks) {
      const existing = weekMap.get(w.weekNumber);
      if (existing) {
        existing.prior = w.gpc;
      } else {
        weekMap.set(w.weekNumber, {
          weekNumber: w.weekNumber,
          label: `Wk ${w.weekNumber}`,
          prior: w.gpc,
        });
      }
    }

    return Array.from(weekMap.values()).sort((a, b) => a.weekNumber - b.weekNumber);
  }, [perCapitaQuery.data]);

  // ─── Chart Data ───────────────────────────────────────────
  const chartData = useMemo(() => {
    if (viewMode === "weekly") {
      return weeklyTableData
        .slice()
        .reverse()
        .map((w) => ({
          label: formatDate(w.weekStartDate),
          Total: w.total,
          General: w.general,
          Designated: w.designated,
        }));
    }

    if (viewMode === "monthly") {
      return monthlyTableData.map((m) => ({
        label: MONTH_NAMES[m.month - 1],
        Total: m.total,
        General: m.general,
        Designated: m.designated,
      }));
    }

    if (viewMode === "yearly") {
      return yearlyTableData
        .slice()
        .reverse()
        .map((y) => ({
          label: String(y.year),
          Total: y.total,
          General: y.general,
          Designated: y.designated,
        }));
    }

    return [];
  }, [viewMode, weeklyTableData, monthlyTableData, yearlyTableData]);

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
              {viewMode === "weekly" && kpis.latest && (
                <>
                  <KpiCard
                    label="Current Week"
                    value={formatCurrency(kpis.latest.total)}
                    subtitle={formatDate((kpis.latest as any).weekStartDate)}
                    borderColor="#4A7C59"
                    change={kpis.prior ? getYoYChange(kpis.latest.total, kpis.prior.total) : undefined}
                    changeLabel="vs prior week"
                  />
                  <KpiCard
                    label={`${year} YTD`}
                    value={formatCurrency(kpis.ytdTotal)}
                    subtitle={`${kpis.weekCount} weeks`}
                    borderColor="#E8913A"
                    change={(kpis as any).ytdChange}
                    changeLabel={`vs same period ${year - 1}`}
                  />
                  <KpiCard
                    label="Avg Weekly"
                    value={formatCurrency(kpis.avgWeekly)}
                    subtitle={`${year} average`}
                    borderColor="#4A7FB5"
                  />
                  {perCapitaKpi && (
                    <KpiCard
                      label="Per Capita"
                      value={`$${Math.round(perCapitaKpi.avgGpc)}`}
                      subtitle={`Natl avg: $${NATIONAL_AVG_GPC}/wk`}
                      borderColor="#8B5CF6"
                      change={perCapitaKpi.change ?? undefined}
                      changeLabel={`vs same weeks ${year - 1}`}
                    />
                  )}
                </>
              )}
              {viewMode === "monthly" && (
                <>
                  <KpiCard
                    label={`${year} YTD`}
                    value={formatCurrency(kpis.ytdTotal)}
                    subtitle={`${kpis.weekCount} months`}
                    borderColor="#E8913A"
                  />
                  <KpiCard
                    label="Avg Weekly"
                    value={formatCurrency(kpis.avgWeekly)}
                    subtitle={`${year} average`}
                    borderColor="#4A7FB5"
                  />
                  {perCapitaKpi && (
                    <KpiCard
                      label="Per Capita"
                      value={`$${Math.round(perCapitaKpi.avgGpc)}`}
                      subtitle={`Natl avg: $${NATIONAL_AVG_GPC}/wk`}
                      borderColor="#8B5CF6"
                      change={perCapitaKpi.change ?? undefined}
                      changeLabel={`vs same weeks ${year - 1}`}
                    />
                  )}
                </>
              )}
              {viewMode === "yearly" && kpis.latest && (
                <>
                  <KpiCard
                    label={`${(kpis.latest as any).year} Total`}
                    value={formatCurrency(kpis.latest.total)}
                    subtitle={`${(kpis.latest as any).weekCount} weeks`}
                    borderColor="#E8913A"
                    change={kpis.prior ? getYoYChange(kpis.latest.total, kpis.prior.total) : undefined}
                  />
                  <KpiCard
                    label="Avg Weekly"
                    value={formatCurrency((kpis.latest as any).avgWeekly)}
                    subtitle={`${(kpis.latest as any).year}`}
                    borderColor="#4A7FB5"
                    change={kpis.prior ? getYoYChange((kpis.latest as any).avgWeekly, (kpis.prior as any).avgWeekly) : undefined}
                  />
                  {perCapitaKpi && (
                    <KpiCard
                      label="Per Capita"
                      value={`$${Math.round(perCapitaKpi.avgGpc)}`}
                      subtitle={`Natl avg: $${NATIONAL_AVG_GPC}/wk`}
                      borderColor="#8B5CF6"
                      change={perCapitaKpi.change ?? undefined}
                      changeLabel={`vs same weeks ${year - 1}`}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Per Capita YoY Chart */}
          {perCapitaChartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>
                Per Capita — {year} vs {year - 1}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={perCapitaChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fontFamily: "'Inter'" }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.max(0, Math.floor(perCapitaChartData.length / 14))}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: "'DM Mono'" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={TT}
                    formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
                  <ReferenceLine
                    y={NATIONAL_AVG_GPC}
                    stroke="#DC2626"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Natl Avg $${NATIONAL_AVG_GPC}`,
                      position: "insideTopRight",
                      fill: "#DC2626",
                      fontSize: 10,
                      fontFamily: "'Inter'",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name={String(year)}
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="prior"
                    name={String(year - 1)}
                    stroke="#D1D5DB"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Giving Chart */}
          {chartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>
                {viewMode === "weekly" && `Weekly Giving — ${year}`}
                {viewMode === "monthly" && `Monthly Giving — ${year}`}
                {viewMode === "yearly" && "Annual Giving by Year"}
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                {viewMode === "yearly" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip contentStyle={TT} formatter={(v: number) => fmtDollars(v)} />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
                    <Bar dataKey="General" stackId="a" fill="#4A7C59" maxBarSize={40} />
                    <Bar dataKey="Designated" stackId="a" fill="#E8913A" radius={[3, 3, 0, 0]} maxBarSize={40} />
                  </BarChart>
                ) : (
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="giv-grad-total" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4A7C59" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#4A7C59" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} interval={viewMode === "weekly" ? Math.max(0, Math.floor(chartData.length / 12)) : 0} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip contentStyle={TT} formatter={(v: number) => fmtDollarsFull(v)} />
                    <Area type="monotone" dataKey="Total" stroke="#4A7C59" strokeWidth={2} fill="url(#giv-grad-total)" dot={viewMode === "monthly" ? { r: 3 } : false} />
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
                    <TableHead className="text-xs text-right">General</TableHead>
                    <TableHead className="text-xs text-right">Designated</TableHead>
                    <TableHead className="text-xs text-right">Donations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyTableData.map((w) => (
                    <TableRow key={w.weekNumber}>
                      <TableCell className="text-xs font-medium">{formatDate(w.weekStartDate)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{fmtDollarsFull(w.total)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(w.general)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(w.designated)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{w.donationCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {weeklyTableData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">YTD Total</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {fmtDollarsFull(weeklyTableData.reduce((s, w) => s + w.total, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {fmtDollarsFull(weeklyTableData.reduce((s, w) => s + w.general, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {fmtDollarsFull(weeklyTableData.reduce((s, w) => s + w.designated, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {weeklyTableData.reduce((s, w) => s + w.donationCount, 0)}
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
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Avg Weekly</TableHead>
                    <TableHead className="text-xs text-right">General</TableHead>
                    <TableHead className="text-xs text-right">Designated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTableData.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="text-xs font-medium">{MONTH_NAMES[m.month - 1]}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{fmtDollarsFull(m.total)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(m.avgWeekly)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(m.general)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(m.designated)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {monthlyTableData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Year Total</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {fmtDollarsFull(monthlyTableData.reduce((s, m) => s + m.total, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {fmtDollarsFull(monthlyTableData.reduce((s, m) => s + m.total, 0) / monthlyTableData.reduce((s, m) => s + m.weekCount, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {fmtDollarsFull(monthlyTableData.reduce((s, m) => s + m.general, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">
                        {fmtDollarsFull(monthlyTableData.reduce((s, m) => s + m.designated, 0))}
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
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Avg Weekly</TableHead>
                    <TableHead className="text-xs text-right">General</TableHead>
                    <TableHead className="text-xs text-right">Designated</TableHead>
                    <TableHead className="text-xs text-right">YoY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlyTableData.map((y, i) => {
                    const prior = yearlyTableData[i + 1];
                    const change = prior ? getYoYChange(y.total, prior.total) : null;
                    return (
                      <TableRow key={y.year}>
                        <TableCell className="text-xs font-medium">{y.year}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">{fmtDollarsFull(y.total)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(y.avgWeekly)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(y.general)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtDollarsFull(y.designated)}</TableCell>
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
            )}
          </div>
        </>
      )}

      {!isLoading && (!rawData || (rawData.data as any[]).length === 0) && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No giving data available for this selection.
        </div>
      )}
    </div>
  );
}
