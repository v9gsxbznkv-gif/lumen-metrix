/**
 * Team Members Tab (renamed from Volunteers) — weekly / monthly / yearly views
 * Shows both Scheduled and Checked In (confirmed) counts.
 * Checked In is the primary weekly number used for averages.
 * Falls back to `total` for legacy data (pre-2026) where scheduled/confirmed are 0.
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
  d.setDate(d.getDate() + 6); // Monday → Sunday display
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

  // Roster data: total unique active team members + % of adult attendance
  const rosterQuery = trpc.dataViews.serving.getRoster.useQuery(
    { campus: campus === "all" ? undefined : campus },
  );
  const roster = rosterQuery.data;

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

  // Detect if the data has real confirmed (check-in) data.
  // hasConfirmedData = true → show dual Scheduled vs Checked In columns
  // hasConfirmedData = false → show single "Team Members" column using total
  // NOTE: We only show dual columns when CONFIRMED data exists (actual check-ins).
  // When scheduled=total (same PCO Services source) showing two identical columns is misleading.
  const hasConfirmedData = useMemo(() => {
    if (!rawData) return false;
    const rows = rawData.data as any[];
    return rows.some(r => (r.confirmed || 0) > 0);
  }, [rawData]);

  const hasScheduledData = hasConfirmedData;

  // ─── Weekly ───────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    if (!rawData || rawData.viewMode !== "weekly") return [];
    const rows = rawData.data as any[];
    const weekMap = new Map<number, { weekNumber: number; weekStartDate: string; total: number; scheduled: number; confirmed: number; campuses: Record<string, number> }>();
    for (const row of rows) {
      const existing = weekMap.get(row.weekNumber);
      const scheduled = row.scheduled || 0;
      const confirmed = row.confirmed || 0;
      if (existing) {
        existing.total += row.total;
        existing.scheduled += scheduled;
        existing.confirmed += confirmed;
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        weekMap.set(row.weekNumber, {
          weekNumber: row.weekNumber,
          weekStartDate: row.weekStartDate,
          total: row.total,
          scheduled,
          confirmed,
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
      const scheduled = row.scheduled || 0;
      const confirmed = row.confirmed || 0;
      const existing = monthMap.get(row.month);
      if (existing) {
        existing.total += row.total;
        existing.scheduled += scheduled;
        existing.confirmed += confirmed;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        monthMap.set(row.month, {
          month: row.month,
          total: row.total,
          scheduled,
          confirmed,
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
      const scheduled = row.scheduled || 0;
      const confirmed = row.confirmed || 0;
      const existing = yearMap.get(row.year);
      if (existing) {
        existing.total += row.total;
        existing.scheduled += scheduled;
        existing.confirmed += confirmed;
        existing.weekCount = Math.max(existing.weekCount, row.weekCount);
        existing.campuses[row.campus] = (existing.campuses[row.campus] || 0) + row.total;
      } else {
        yearMap.set(row.year, {
          year: row.year,
          total: row.total,
          scheduled,
          confirmed,
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

  // Helper: get the "primary" number for a row
  // When we have confirmed data → use confirmed (actual check-ins)
  // When no confirmed data → use total (which equals scheduled from Services, or legacy spreadsheet data)
  const getPrimary = (row: { confirmed: number; total: number }) =>
    hasConfirmedData ? row.confirmed : row.total;
  const getPrimaryAvg = (row: { avgConfirmed: number; avgWeekly: number }) =>
    hasConfirmedData ? row.avgConfirmed : row.avgWeekly;

  const chartData = useMemo(() => {
    if (hasScheduledData) {
      // Show Scheduled vs Checked In
      if (viewMode === "weekly") return weeklyData.slice().reverse().map(w => ({
        label: formatDate(w.weekStartDate),
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
    } else {
      // Legacy: just show Total
      if (viewMode === "weekly") return weeklyData.slice().reverse().map(w => ({
        label: formatDate(w.weekStartDate),
        "Team Members": w.total,
      }));
      if (viewMode === "monthly") return monthlyData.map(m => ({
        label: MONTH_NAMES[m.month - 1],
        "Team Members": m.avgWeekly,
      }));
      return yearlyData.slice().reverse().map(y => ({
        label: String(y.year),
        "Team Members": y.avgWeekly,
      }));
    }
  }, [viewMode, weeklyData, monthlyData, yearlyData, hasScheduledData]);

  const kpis = useMemo(() => {
    if (viewMode === "weekly" && weeklyData.length > 0) {
      const latest = weeklyData[0];
      const prior = weeklyData[1];
      const primaryLatest = getPrimary(latest);
      const primaryPrior = prior ? getPrimary(prior) : 0;
      const avgPrimary = Math.round(weeklyData.reduce((s, w) => s + getPrimary(w), 0) / weeklyData.length);
      const avgScheduled = Math.round(weeklyData.reduce((s, w) => s + w.scheduled, 0) / weeklyData.length);
      return {
        latestPrimary: primaryLatest,
        latestScheduled: latest.scheduled,
        latestDate: latest.weekStartDate,
        avgPrimary,
        avgScheduled,
        priorPrimary: primaryPrior,
        weekCount: weeklyData.length,
      };
    }
    if (viewMode === "monthly" && monthlyData.length > 0) {
      const latest = monthlyData[monthlyData.length - 1];
      const prior = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : null;
      const avgPrimary = Math.round(monthlyData.reduce((s, m) => s + getPrimaryAvg(m), 0) / monthlyData.length);
      const avgScheduled = Math.round(monthlyData.reduce((s, m) => s + m.avgScheduled, 0) / monthlyData.length);
      return {
        latestPrimary: getPrimaryAvg(latest),
        latestScheduled: latest.avgScheduled,
        latestDate: MONTH_NAMES[latest.month - 1],
        avgPrimary,
        avgScheduled,
        priorPrimary: prior ? getPrimaryAvg(prior) : 0,
        weekCount: monthlyData.reduce((s, m) => s + m.weekCount, 0),
      };
    }
    if (viewMode === "yearly" && yearlyData.length > 0) {
      const latest = yearlyData[0];
      const prior = yearlyData[1];
      return {
        latestPrimary: getPrimaryAvg(latest),
        latestScheduled: latest.avgScheduled,
        latestDate: String(latest.year),
        avgPrimary: getPrimaryAvg(latest),
        avgScheduled: latest.avgScheduled,
        priorPrimary: prior ? getPrimaryAvg(prior) : 0,
        weekCount: latest.weekCount,
      };
    }
    return null;
  }, [viewMode, weeklyData, monthlyData, yearlyData, hasScheduledData]);

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

      {/* Roster KPIs — Total Active Team Members & % of Adult Attendance */}
      {roster && roster.totalVolunteers > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <KpiCard
            label="Active Team Members"
            value={formatNumber(roster.totalVolunteers)}
            subtitle="unique people on serving teams"
            borderColor="#7C3AED"
          />
          <KpiCard
            label="% of Adult Attendance"
            value={`${roster.percentOfAdultAttendance}%`}
            subtitle={`÷ ${formatNumber(roster.avgWeeklyAdultAttendance)} avg adults (${roster.year})`}
            borderColor="#E8913A"
          />
          <KpiCard
            label="Avg Adult Attendance"
            value={formatNumber(roster.avgWeeklyAdultAttendance)}
            subtitle={`weekly avg ${roster.year} (excl. kids)`}
            borderColor="#4A7FB5"
          />
        </div>
      )}

      {!isLoading && rawData && (
        <>
          {kpis && (
            <div className={`grid gap-3 ${hasScheduledData ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
              <KpiCard
                label={hasScheduledData ? "Checked In" : "Team Members"}
                value={formatNumber(kpis.latestPrimary)}
                subtitle={viewMode === "yearly" ? `avg weekly ${kpis.latestDate}` : viewMode === "monthly" ? `avg weekly ${kpis.latestDate}` : formatDate(kpis.latestDate)}
                borderColor="#4A7C59"
              />
              {hasScheduledData && (
                <KpiCard
                  label="Scheduled"
                  value={formatNumber(kpis.latestScheduled)}
                  subtitle={viewMode === "yearly" ? `avg weekly ${kpis.latestDate}` : viewMode === "monthly" ? `avg weekly ${kpis.latestDate}` : formatDate(kpis.latestDate)}
                  borderColor="#4A7FB5"
                />
              )}
              <KpiCard
                label={hasScheduledData ? "Avg Checked In" : "Avg Weekly"}
                value={formatNumber(kpis.avgPrimary)}
                subtitle={`${kpis.weekCount} weeks`}
                borderColor="#C45B4A"
              />
              {hasScheduledData && (
                <KpiCard
                  label="Show Rate"
                  value={kpis.avgScheduled > 0 ? `${Math.round((kpis.avgPrimary / kpis.avgScheduled) * 100)}%` : "—"}
                  subtitle="confirmed / scheduled"
                  borderColor="#E8913A"
                />
              )}
            </div>
          )}

          {chartData.length > 0 && (
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>
                {hasScheduledData ? (
                  <>
                    {viewMode === "weekly" && `Scheduled vs Checked In — ${year}`}
                    {viewMode === "monthly" && `Monthly Avg Scheduled vs Checked In — ${year}`}
                    {viewMode === "yearly" && "Avg Weekly Scheduled vs Checked In by Year"}
                  </>
                ) : (
                  <>
                    {viewMode === "weekly" && `Weekly Team Members — ${year}`}
                    {viewMode === "monthly" && `Monthly Avg Team Members — ${year}`}
                    {viewMode === "yearly" && "Avg Weekly Team Members by Year"}
                  </>
                )}
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                {hasScheduledData ? (
                  viewMode === "yearly" ? (
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
                  )
                ) : (
                  viewMode === "yearly" ? (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TT} />
                      <Bar dataKey="Team Members" fill="#E8913A" radius={[3, 3, 0, 0]} maxBarSize={30} />
                    </BarChart>
                  ) : (
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="tm-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E8913A" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#E8913A" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} interval={viewMode === "weekly" ? Math.max(0, Math.floor(chartData.length / 12)) : 0} />
                      <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TT} />
                      <Area type="monotone" dataKey="Team Members" stroke="#E8913A" strokeWidth={2} fill="url(#tm-grad)" dot={viewMode === "monthly" ? { r: 3 } : false} />
                    </AreaChart>
                  )
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
                    {hasScheduledData && <TableHead className="text-xs text-right">Scheduled</TableHead>}
                    <TableHead className="text-xs text-right">{hasScheduledData ? "Checked In" : "Team Members"}</TableHead>
                    {hasScheduledData && <TableHead className="text-xs text-right">Show Rate</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.map(w => {
                    const primary = getPrimary(w);
                    const showRate = w.scheduled > 0 ? Math.round((w.confirmed / w.scheduled) * 100) : 0;
                    return (
                      <TableRow key={w.weekNumber}>
                        <TableCell className="text-xs font-medium">{formatDate(w.weekStartDate)}</TableCell>
                        {hasScheduledData && <TableCell className="text-xs text-right font-mono" style={{ color: "#4A7FB5" }}>{formatNumber(w.scheduled)}</TableCell>}
                        <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: hasScheduledData ? "#4A7C59" : "#E8913A" }}>{formatNumber(primary)}</TableCell>
                        {hasScheduledData && <TableCell className="text-xs text-right font-mono">{w.scheduled > 0 ? `${showRate}%` : "—"}</TableCell>}
                      </TableRow>
                    );
                  })}
                </TableBody>
                {weeklyData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="text-xs font-semibold">Average</TableCell>
                      {hasScheduledData && (
                        <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: "#4A7FB5" }}>
                          {formatNumber(Math.round(weeklyData.reduce((s, w) => s + w.scheduled, 0) / weeklyData.length))}
                        </TableCell>
                      )}
                      <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: hasScheduledData ? "#4A7C59" : "#E8913A" }}>
                        {formatNumber(Math.round(weeklyData.reduce((s, w) => s + getPrimary(w), 0) / weeklyData.length))}
                      </TableCell>
                      {hasScheduledData && (
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          {(() => {
                            const totalSched = weeklyData.reduce((s, w) => s + w.scheduled, 0);
                            const totalConf = weeklyData.reduce((s, w) => s + w.confirmed, 0);
                            return totalSched > 0 ? `${Math.round((totalConf / totalSched) * 100)}%` : "—";
                          })()}
                        </TableCell>
                      )}
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
                    {hasScheduledData && <TableHead className="text-xs text-right">Avg Scheduled</TableHead>}
                    <TableHead className="text-xs text-right">{hasScheduledData ? "Avg Checked In" : "Avg Weekly"}</TableHead>
                    {hasScheduledData && <TableHead className="text-xs text-right">Show Rate</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map(m => {
                    const primary = getPrimaryAvg(m);
                    const showRate = m.avgScheduled > 0 ? Math.round((m.avgConfirmed / m.avgScheduled) * 100) : 0;
                    return (
                      <TableRow key={m.month}>
                        <TableCell className="text-xs font-medium">{MONTH_NAMES[m.month - 1]}</TableCell>
                        {hasScheduledData && <TableCell className="text-xs text-right font-mono" style={{ color: "#4A7FB5" }}>{formatNumber(m.avgScheduled)}</TableCell>}
                        <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: hasScheduledData ? "#4A7C59" : "#E8913A" }}>{formatNumber(primary)}</TableCell>
                        {hasScheduledData && <TableCell className="text-xs text-right font-mono">{m.avgScheduled > 0 ? `${showRate}%` : "—"}</TableCell>}
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
                    {hasScheduledData && <TableHead className="text-xs text-right">Avg Scheduled</TableHead>}
                    <TableHead className="text-xs text-right">{hasScheduledData ? "Avg Checked In" : "Avg Weekly"}</TableHead>
                    {hasScheduledData && <TableHead className="text-xs text-right">Show Rate</TableHead>}
                    <TableHead className="text-xs text-right">Weeks</TableHead>
                    <TableHead className="text-xs text-right">YoY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearlyData.map((y, i) => {
                    const primary = getPrimaryAvg(y);
                    const prior = yearlyData[i + 1];
                    const priorPrimary = prior ? getPrimaryAvg(prior) : 0;
                    const change = prior ? getYoYChange(primary, priorPrimary) : null;
                    const showRate = y.avgScheduled > 0 ? Math.round((y.avgConfirmed / y.avgScheduled) * 100) : 0;
                    return (
                      <TableRow key={y.year}>
                        <TableCell className="text-xs font-medium">{y.year}</TableCell>
                        {hasScheduledData && <TableCell className="text-xs text-right font-mono" style={{ color: "#4A7FB5" }}>{formatNumber(y.avgScheduled)}</TableCell>}
                        <TableCell className="text-xs text-right font-mono font-semibold" style={{ color: hasScheduledData ? "#4A7C59" : "#E8913A" }}>{formatNumber(primary)}</TableCell>
                        {hasScheduledData && <TableCell className="text-xs text-right font-mono">{y.avgScheduled > 0 ? `${showRate}%` : "—"}</TableCell>}
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
