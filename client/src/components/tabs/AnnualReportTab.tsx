/**
 * Lumen Metrix — Annual Report Tab
 * Comprehensive annual report with all metrics, CSV export, and print-friendly layout.
 */
import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import { formatNumber, formatCurrency, MONTH_NAMES } from "@/lib/data";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  FileText, Download, Printer, TrendingUp, TrendingDown,
  Minus, ChevronDown, Users, DollarSign, Heart, UserPlus,
  Activity, CalendarDays, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Constants ──────────────────────────────────────────────────────────────

const AMBER = "#E8913A";
const AMBER_LIGHT = "#F5C882";
const BLUE = "#3B82F6";
const GREEN = "#22C55E";
const RED = "#EF4444";
const GRAY = "#9CA3AF";
const CANTON_COLOR = "#E8913A";
const JASPER_COLOR = "#3B82F6";
const ONLINE_COLOR = "#8B5CF6";

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return formatNumber(n);
}

function fmtCur(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return formatCurrency(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function YoYBadge({ pct }: { pct: number }) {
  const positive = pct >= 0;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
      style={{
        color: positive ? GREEN : RED,
        background: positive ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
      }}
    >
      <Icon className="w-3 h-3" />
      {fmtPct(pct)}
    </span>
  );
}

function HealthDot({ status }: { status: string }) {
  const color = status === "healthy" ? GREEN : status === "warning" ? AMBER : RED;
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{ background: color }}
    />
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-8 print:mt-4">
      <Icon className="w-5 h-5" style={{ color: AMBER }} />
      <h2 className="text-lg font-semibold text-card-foreground">{title}</h2>
    </div>
  );
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

function generateCSV(data: any, year: number): string {
  const lines: string[] = [];
  const add = (row: string[]) => lines.push(row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));

  // Header
  add(["Lumen Metrix Annual Report", String(year)]);
  add([]);

  // Attendance Summary
  add(["ATTENDANCE SUMMARY"]);
  add(["Metric", String(year), String(year - 1), "Change"]);
  add(["Avg Weekly", String(data.attendance.current.avgWeekly), String(data.attendance.prior.avgWeekly), fmtPct(data.attendance.yoy.avgWeekly.changePct)]);
  add(["Total Annual", String(data.attendance.current.total), String(data.attendance.prior.total), fmtPct(data.attendance.yoy.total.changePct)]);
  add(["Canton", String(data.attendance.current.canton), String(data.attendance.prior.canton), ""]);
  add(["Jasper", String(data.attendance.current.jasper), String(data.attendance.prior.jasper), ""]);
  add(["Online", String(data.attendance.current.online), String(data.attendance.prior.online), ""]);
  add([]);

  // Attendance Monthly
  add(["ATTENDANCE BY MONTH"]);
  add(["Month", "Canton", "Jasper", "Online", "Total", `Prior Year (${year - 1})`]);
  data.attendance.monthly.forEach((m: any, i: number) => {
    const prior = data.attendance.monthlyPrior[i];
    add([MONTH_FULL[i], String(m.canton), String(m.jasper), String(m.online), String(m.total), String(prior?.total ?? 0)]);
  });
  add([]);

  // Giving Summary
  add(["GIVING SUMMARY"]);
  add(["Metric", String(year), String(year - 1), "Change"]);
  add(["Total Giving", String(data.giving.current.total), String(data.giving.prior.total), fmtPct(data.giving.yoy.total.changePct)]);
  add(["General", String(data.giving.current.general), String(data.giving.prior.general), ""]);
  add(["Designated", String(data.giving.current.designated), String(data.giving.prior.designated), ""]);
  add(["Per Capita", String(data.giving.current.perCapita), String(data.giving.prior.perCapita), fmtPct(data.giving.yoy.perCapita.changePct)]);
  add([]);

  // Giving Monthly
  add(["GIVING BY MONTH"]);
  add(["Month", "Canton", "Jasper", "Online", "Total", `Prior Year (${year - 1})`]);
  data.giving.monthly.forEach((m: any, i: number) => {
    const prior = data.giving.monthlyPrior[i];
    add([MONTH_FULL[i], String(m.canton), String(m.jasper), String(m.online), String(m.total), String(prior?.total ?? 0)]);
  });
  add([]);

  // Volunteers
  add(["VOLUNTEERS"]);
  add(["Metric", String(year), String(year - 1)]);
  add(["Avg Weekly", String(data.volunteers.current.avgWeekly), String(data.volunteers.prior.avgWeekly)]);
  add(["Canton", String(data.volunteers.current.canton), String(data.volunteers.prior.canton)]);
  add(["Jasper", String(data.volunteers.current.jasper), String(data.volunteers.prior.jasper)]);
  add(["Ratio (%)", String(data.volunteers.current.ratio), String(data.volunteers.prior.ratio)]);
  add([]);

  // Next Steps
  add(["NEXT STEPS"]);
  add(["Metric", String(year), String(year - 1), "Change"]);
  add(["First-Time Guests", String(data.nextSteps.ftg.current), String(data.nextSteps.ftg.prior), fmtPct(((data.nextSteps.ftg.current - data.nextSteps.ftg.prior) / (data.nextSteps.ftg.prior || 1)) * 100)]);
  add(["Salvations", String(data.nextSteps.salvations.current), String(data.nextSteps.salvations.prior), ""]);
  add(["Baptisms", String(data.nextSteps.baptisms.current), String(data.nextSteps.baptisms.prior), ""]);
  add(["FTG Rate (%)", String(data.nextSteps.ftg.rate), String(data.nextSteps.ftg.ratePrior), ""]);
  add([]);

  // Groups
  add(["GROUPS"]);
  add(["Metric", String(year), String(year - 1)]);
  add(["Active Groups", String(data.groups.current.activeGroups), String(data.groups.prior.activeGroups)]);
  add(["Total Members", String(data.groups.current.totalMembers), String(data.groups.prior.totalMembers)]);
  add(["Total Leaders", String(data.groups.current.totalLeaders), String(data.groups.prior.totalLeaders)]);
  add(["Avg Attendance", String(data.groups.current.avgAttendance), String(data.groups.prior.avgAttendance)]);
  add([]);

  // Events
  add(["SPECIAL EVENTS"]);
  add(["Event", "Attendance", "Giving", "FTG", "Salvations", "Source"]);
  data.events.current.forEach((e: any) => {
    add([e.name, String(e.attendance ?? ""), String(e.giving ?? ""), String(e.ftg ?? ""), String(e.salvations ?? ""), e.source]);
  });
  add([]);

  // Health
  add(["HEALTH METRICS"]);
  add(["Metric", "Value", "Prior", "Change", "Status"]);
  data.health.forEach((h: any) => {
    add([h.name, String(h.value), String(h.priorValue), String(h.change), h.status]);
  });

  // Volunteer Monthly
  add([]);
  add(["VOLUNTEERS BY MONTH"]);
  add(["Month", "Canton", "Jasper", "Total"]);
  data.volunteers.monthly.forEach((m: any, i: number) => {
    add([MONTH_FULL[i], String(m.canton), String(m.jasper), String(m.total)]);
  });

  // FTG Monthly
  add([]);
  add(["FIRST-TIME GUESTS BY MONTH"]);
  add(["Month", "Canton", "Jasper", "Online", "Total"]);
  data.nextSteps.ftg.monthly.forEach((m: any, i: number) => {
    add([MONTH_FULL[i], String(m.canton), String(m.jasper), String(m.online), String(m.total)]);
  });

  // Salvations Monthly
  add([]);
  add(["SALVATIONS BY MONTH"]);
  add(["Month", "Canton", "Jasper", "Online", "Total"]);
  data.nextSteps.salvations.monthly.forEach((m: any, i: number) => {
    add([MONTH_FULL[i], String(m.canton), String(m.jasper), String(m.online), String(m.total)]);
  });

  return lines.join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AnnualReportTab() {
  const { data: dashData } = useData();
  const currentYear = new Date().getFullYear();

  // Default to last completed year
  const [selectedYear, setSelectedYear] = useState(currentYear - 1);

  // Available years (completed only — exclude current year)
  const availableYears = useMemo(() => {
    if (!dashData) return [];
    return dashData.meta.years.filter((y) => y < currentYear).sort((a, b) => b - a);
  }, [dashData, currentYear]);

  const { data, isLoading, error } = trpc.annualReport.getData.useQuery(
    { year: selectedYear },
    { enabled: !!dashData }
  );

  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => window.print();

  const handleCSV = () => {
    if (!data) return;
    const csv = generateCSV(data, selectedYear);
    downloadCSV(csv, `Revolution_Church_Annual_Report_${selectedYear}.csv`);
  };

  // ── Loading / Error states ──────────────────────────────────
  if (!dashData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full" style={{ borderColor: AMBER }} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full mx-auto mb-3" style={{ borderColor: AMBER }} />
          <p className="text-sm text-muted-foreground">Generating annual report for {selectedYear}...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground">Unable to generate report. {error?.message}</p>
      </div>
    );
  }

  // ── Chart data ──────────────────────────────────────────────
  const attChartData = data.attendance.monthly.map((m, i) => ({
    month: MONTH_NAMES[i],
    Canton: m.canton,
    Jasper: m.jasper,
    Online: m.online,
    Total: m.total,
    Prior: data.attendance.monthlyPrior[i]?.total ?? 0,
  }));

  const givChartData = data.giving.monthly.map((m, i) => ({
    month: MONTH_NAMES[i],
    Total: Math.round(m.total),
    Prior: Math.round(data.giving.monthlyPrior[i]?.total ?? 0),
  }));

  const volChartData = data.volunteers.monthly.map((m, i) => ({
    month: MONTH_NAMES[i],
    Canton: m.canton,
    Jasper: m.jasper,
    Total: m.total,
  }));

  const ftgChartData = data.nextSteps.ftg.monthly.map((m, i) => ({
    month: MONTH_NAMES[i],
    Total: m.total,
  }));

  return (
    <div className="annual-report-container">
      {/* ── Toolbar (hidden in print) ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 print:hidden">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5" style={{ color: AMBER }} />
          <h1 className="text-xl font-semibold text-card-foreground">Annual Report</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleCSV} className="gap-1.5">
            <Download className="w-4 h-4" /> CSV Export
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      {/* ── Print Header (visible only in print) ───────────────── */}
      <div className="hidden print:block mb-6">
        <div className="text-center border-b-2 pb-4" style={{ borderColor: AMBER }}>
          <h1 className="text-2xl font-bold" style={{ color: AMBER }}>LUMEN METRIX</h1>
          <p className="text-sm text-muted-foreground">Revolution Church</p>
          <h2 className="text-xl font-semibold mt-2">{selectedYear} Annual Report</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
      </div>

      <div ref={reportRef}>
        {/* ── Executive Summary KPIs ─────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="Avg Weekly Attendance"
            value={fmtNum(data.attendance.current.avgWeekly)}
            change={{
              label: fmtPct(data.attendance.yoy.avgWeekly.changePct),
              positive: data.attendance.yoy.avgWeekly.changePct >= 0,
              value: data.attendance.yoy.avgWeekly.changePct,
            }}
            borderColor={AMBER}
            icon={<Users className="w-4 h-4" style={{ color: AMBER }} />}
          />
          <KpiCard
            label="Total Giving"
            value={fmtCur(data.giving.current.total)}
            change={{
              label: fmtPct(data.giving.yoy.total.changePct),
              positive: data.giving.yoy.total.changePct >= 0,
              value: data.giving.yoy.total.changePct,
            }}
            borderColor={GREEN}
            icon={<DollarSign className="w-4 h-4" style={{ color: GREEN }} />}
          />
          <KpiCard
            label="First-Time Guests"
            value={fmtNum(data.nextSteps.ftg.current)}
            change={{
              label: fmtPct(data.nextSteps.ftg.prior > 0 ? ((data.nextSteps.ftg.current - data.nextSteps.ftg.prior) / data.nextSteps.ftg.prior) * 100 : 0),
              positive: data.nextSteps.ftg.current >= data.nextSteps.ftg.prior,
              value: data.nextSteps.ftg.prior > 0 ? ((data.nextSteps.ftg.current - data.nextSteps.ftg.prior) / data.nextSteps.ftg.prior) * 100 : 0,
            }}
            borderColor={BLUE}
            icon={<UserPlus className="w-4 h-4" style={{ color: BLUE }} />}
          />
          <KpiCard
            label="Salvations"
            value={fmtNum(data.nextSteps.salvations.current)}
            change={{
              label: fmtPct(data.nextSteps.salvations.prior > 0 ? ((data.nextSteps.salvations.current - data.nextSteps.salvations.prior) / data.nextSteps.salvations.prior) * 100 : 0),
              positive: data.nextSteps.salvations.current >= data.nextSteps.salvations.prior,
              value: data.nextSteps.salvations.prior > 0 ? ((data.nextSteps.salvations.current - data.nextSteps.salvations.prior) / data.nextSteps.salvations.prior) * 100 : 0,
            }}
            borderColor={RED}
            icon={<Heart className="w-4 h-4" style={{ color: RED }} />}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════
            1. ATTENDANCE
           ══════════════════════════════════════════════════════════ */}
        <SectionHeader icon={Users} title="Attendance" />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Avg Weekly</p>
            <p className="text-xl font-bold text-card-foreground">{fmtNum(data.attendance.current.avgWeekly)}</p>
            <YoYBadge pct={data.attendance.yoy.avgWeekly.changePct} />
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Canton</p>
            <p className="text-xl font-bold" style={{ color: CANTON_COLOR }}>{fmtNum(data.attendance.current.canton)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Jasper</p>
            <p className="text-xl font-bold" style={{ color: JASPER_COLOR }}>{fmtNum(data.attendance.current.jasper)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Online</p>
            <p className="text-xl font-bold" style={{ color: ONLINE_COLOR }}>{fmtNum(data.attendance.current.online)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Annual</p>
            <p className="text-xl font-bold text-card-foreground">{fmtNum(data.attendance.current.total)}</p>
          </div>
        </div>

        {/* Attendance Chart */}
        <div className="bg-card rounded-lg p-4 border border-border/60 mb-4 print:break-inside-avoid">
          <p className="text-xs font-medium text-muted-foreground mb-3">Monthly Attendance — {selectedYear} vs {selectedYear - 1}</p>
          <div className="h-[250px] print:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attChartData} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Canton" fill={CANTON_COLOR} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Jasper" fill={JASPER_COLOR} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Online" fill={ONLINE_COLOR} radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="Prior" stroke={GRAY} strokeDasharray="5 5" dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attendance Monthly Table */}
        <div className="bg-card rounded-lg border border-border/60 overflow-x-auto mb-6 print:break-inside-avoid">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60" style={{ background: "rgba(232,145,58,0.04)" }}>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Month</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: CANTON_COLOR }}>Canton</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: JASPER_COLOR }}>Jasper</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: ONLINE_COLOR }}>Online</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">Total</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{selectedYear - 1}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">YoY</th>
              </tr>
            </thead>
            <tbody>
              {data.attendance.monthly.map((m, i) => {
                const prior = data.attendance.monthlyPrior[i];
                const pct = prior && prior.total > 0 ? ((m.total - prior.total) / prior.total) * 100 : null;
                return (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium text-card-foreground">{MONTH_FULL[i]}</td>
                    <td className="text-right px-3 py-1.5">{fmtNum(m.canton)}</td>
                    <td className="text-right px-3 py-1.5">{fmtNum(m.jasper)}</td>
                    <td className="text-right px-3 py-1.5">{fmtNum(m.online)}</td>
                    <td className="text-right px-3 py-1.5 font-semibold">{fmtNum(m.total)}</td>
                    <td className="text-right px-3 py-1.5 text-muted-foreground">{fmtNum(prior?.total)}</td>
                    <td className="text-right px-3 py-1.5">
                      {pct !== null ? <YoYBadge pct={pct} /> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ══════════════════════════════════════════════════════════
            2. GIVING
           ══════════════════════════════════════════════════════════ */}
        <SectionHeader icon={DollarSign} title="Giving" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Giving</p>
            <p className="text-xl font-bold text-card-foreground">{fmtCur(data.giving.current.total)}</p>
            <YoYBadge pct={data.giving.yoy.total.changePct} />
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">General</p>
            <p className="text-xl font-bold text-card-foreground">{fmtCur(data.giving.current.general)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Designated</p>
            <p className="text-xl font-bold text-card-foreground">{fmtCur(data.giving.current.designated)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Per Capita</p>
            <p className="text-xl font-bold text-card-foreground">${fmtNum(data.giving.current.perCapita)}</p>
            <YoYBadge pct={data.giving.yoy.perCapita.changePct} />
          </div>
        </div>

        {/* Giving Chart */}
        <div className="bg-card rounded-lg p-4 border border-border/60 mb-4 print:break-inside-avoid">
          <p className="text-xs font-medium text-muted-foreground mb-3">Monthly Giving — {selectedYear} vs {selectedYear - 1}</p>
          <div className="h-[250px] print:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={givChartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Total" fill={GREEN} radius={[2, 2, 0, 0]} name={String(selectedYear)} />
                <Bar dataKey="Prior" fill={GRAY} radius={[2, 2, 0, 0]} name={String(selectedYear - 1)} opacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Giving Monthly Table */}
        <div className="bg-card rounded-lg border border-border/60 overflow-x-auto mb-6 print:break-inside-avoid">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60" style={{ background: "rgba(34,197,94,0.04)" }}>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Month</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: CANTON_COLOR }}>Canton</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: JASPER_COLOR }}>Jasper</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: ONLINE_COLOR }}>Online</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">Total</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{selectedYear - 1}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">YoY</th>
              </tr>
            </thead>
            <tbody>
              {data.giving.monthly.map((m, i) => {
                const prior = data.giving.monthlyPrior[i];
                const pct = prior && prior.total > 0 ? ((m.total - prior.total) / prior.total) * 100 : null;
                return (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium text-card-foreground">{MONTH_FULL[i]}</td>
                    <td className="text-right px-3 py-1.5">{fmtCur(m.canton)}</td>
                    <td className="text-right px-3 py-1.5">{fmtCur(m.jasper)}</td>
                    <td className="text-right px-3 py-1.5">{fmtCur(m.online)}</td>
                    <td className="text-right px-3 py-1.5 font-semibold">{fmtCur(m.total)}</td>
                    <td className="text-right px-3 py-1.5 text-muted-foreground">{fmtCur(prior?.total)}</td>
                    <td className="text-right px-3 py-1.5">
                      {pct !== null ? <YoYBadge pct={pct} /> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ══════════════════════════════════════════════════════════
            3. VOLUNTEERS
           ══════════════════════════════════════════════════════════ */}
        <SectionHeader icon={Activity} title="Volunteers" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Avg Weekly</p>
            <p className="text-xl font-bold text-card-foreground">{fmtNum(data.volunteers.current.avgWeekly)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Canton</p>
            <p className="text-xl font-bold" style={{ color: CANTON_COLOR }}>{fmtNum(data.volunteers.current.canton)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Jasper</p>
            <p className="text-xl font-bold" style={{ color: JASPER_COLOR }}>{fmtNum(data.volunteers.current.jasper)}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ratio</p>
            <p className="text-xl font-bold text-card-foreground">{data.volunteers.current.ratio}%</p>
            <span className="text-[10px] text-muted-foreground">Prior: {data.volunteers.prior.ratio}%</span>
          </div>
        </div>

        {/* Volunteer Chart */}
        <div className="bg-card rounded-lg p-4 border border-border/60 mb-6 print:break-inside-avoid">
          <p className="text-xs font-medium text-muted-foreground mb-3">Monthly Volunteers — {selectedYear}</p>
          <div className="h-[220px] print:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Canton" fill={CANTON_COLOR} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Jasper" fill={JASPER_COLOR} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            4. NEXT STEPS (FTG, Salvations, Baptisms)
           ══════════════════════════════════════════════════════════ */}
        <SectionHeader icon={UserPlus} title="Next Steps — FTG, Salvations & Baptisms" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">First-Time Guests</p>
            <p className="text-xl font-bold text-card-foreground">{fmtNum(data.nextSteps.ftg.current)}</p>
            <span className="text-[10px] text-muted-foreground">Prior: {fmtNum(data.nextSteps.ftg.prior)}</span>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">FTG Rate</p>
            <p className="text-xl font-bold text-card-foreground">{data.nextSteps.ftg.rate}%</p>
            <span className="text-[10px] text-muted-foreground">Prior: {data.nextSteps.ftg.ratePrior}%</span>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Salvations</p>
            <p className="text-xl font-bold" style={{ color: RED }}>{fmtNum(data.nextSteps.salvations.current)}</p>
            <span className="text-[10px] text-muted-foreground">Prior: {fmtNum(data.nextSteps.salvations.prior)}</span>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border/60">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Baptisms</p>
            <p className="text-xl font-bold" style={{ color: BLUE }}>{fmtNum(data.nextSteps.baptisms.current)}</p>
            <span className="text-[10px] text-muted-foreground">Prior: {fmtNum(data.nextSteps.baptisms.prior)}</span>
          </div>
        </div>

        {/* FTG Monthly Chart */}
        <div className="bg-card rounded-lg p-4 border border-border/60 mb-6 print:break-inside-avoid">
          <p className="text-xs font-medium text-muted-foreground mb-3">First-Time Guests by Month — {selectedYear}</p>
          <div className="h-[220px] print:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ftgChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Bar dataKey="Total" fill={BLUE} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FTG Monthly Table */}
        <div className="bg-card rounded-lg border border-border/60 overflow-x-auto mb-6 print:break-inside-avoid">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60" style={{ background: "rgba(59,130,246,0.04)" }}>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Month</th>
                <th className="text-right px-3 py-2 font-medium">FTG</th>
                <th className="text-right px-3 py-2 font-medium">Salvations</th>
                <th className="text-right px-3 py-2 font-medium">Baptisms</th>
              </tr>
            </thead>
            <tbody>
              {data.nextSteps.ftg.monthly.map((m, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-medium text-card-foreground">{MONTH_FULL[i]}</td>
                  <td className="text-right px-3 py-1.5">{fmtNum(m.total)}</td>
                  <td className="text-right px-3 py-1.5">{fmtNum(data.nextSteps.salvations.monthly[i]?.total)}</td>
                  <td className="text-right px-3 py-1.5">{fmtNum(data.nextSteps.baptisms.monthly[i]?.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ══════════════════════════════════════════════════════════
            5. GROUPS
           ══════════════════════════════════════════════════════════ */}
        <SectionHeader icon={Users} title="Groups" />

        <div className="bg-card rounded-lg border border-border/60 overflow-x-auto mb-6 print:break-inside-avoid">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60" style={{ background: "rgba(232,145,58,0.04)" }}>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Metric</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">{selectedYear}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{selectedYear - 1}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Change</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Active Groups", cur: data.groups.current.activeGroups, prior: data.groups.prior.activeGroups },
                { label: "Total Members", cur: data.groups.current.totalMembers, prior: data.groups.prior.totalMembers },
                { label: "Total Leaders", cur: data.groups.current.totalLeaders, prior: data.groups.prior.totalLeaders },
                { label: "Avg Attendance", cur: data.groups.current.avgAttendance, prior: data.groups.prior.avgAttendance },
              ].map((row) => {
                const pct = row.prior > 0 ? ((row.cur - row.prior) / row.prior) * 100 : null;
                return (
                  <tr key={row.label} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium text-card-foreground">{row.label}</td>
                    <td className="text-right px-3 py-2 font-semibold">{fmtNum(row.cur)}</td>
                    <td className="text-right px-3 py-2 text-muted-foreground">{fmtNum(row.prior)}</td>
                    <td className="text-right px-3 py-2">{pct !== null ? <YoYBadge pct={pct} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ══════════════════════════════════════════════════════════
            6. SPECIAL EVENTS
           ══════════════════════════════════════════════════════════ */}
        <SectionHeader icon={CalendarDays} title="Special Events" />

        <div className="bg-card rounded-lg border border-border/60 overflow-x-auto mb-6 print:break-inside-avoid">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60" style={{ background: "rgba(232,145,58,0.04)" }}>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">Attendance</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">Giving</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">FTG</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">Salvations</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.events.current.map((evt) => (
                <tr key={evt.name} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium text-card-foreground">{evt.name}</td>
                  <td className="text-right px-3 py-2">{fmtNum(evt.attendance)}</td>
                  <td className="text-right px-3 py-2">{fmtCur(evt.giving)}</td>
                  <td className="text-right px-3 py-2">{fmtNum(evt.ftg)}</td>
                  <td className="text-right px-3 py-2">{fmtNum(evt.salvations)}</td>
                  <td className="text-center px-3 py-2">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: evt.source === "override" ? "rgba(232,145,58,0.1)" : evt.source === "weekly" ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)",
                        color: evt.source === "override" ? AMBER : evt.source === "weekly" ? GREEN : GRAY,
                      }}
                    >
                      {evt.source === "override" ? "Manual" : evt.source === "weekly" ? "PCO" : "Est."}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Prior Year Events Comparison */}
        <div className="bg-card rounded-lg border border-border/60 overflow-x-auto mb-6 print:break-inside-avoid">
          <p className="text-xs font-medium text-muted-foreground px-3 pt-3 mb-2">Prior Year ({selectedYear - 1}) Events</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Attendance</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Giving</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.events.prior.map((evt) => (
                <tr key={evt.name} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground">{evt.name}</td>
                  <td className="text-right px-3 py-1.5 text-muted-foreground">{fmtNum(evt.attendance)}</td>
                  <td className="text-right px-3 py-1.5 text-muted-foreground">{fmtCur(evt.giving)}</td>
                  <td className="text-center px-3 py-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(156,163,175,0.1)", color: GRAY }}>
                      {evt.source === "override" ? "Manual" : evt.source === "weekly" ? "PCO" : "Est."}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ══════════════════════════════════════════════════════════
            7. HEALTH METRICS SUMMARY
           ══════════════════════════════════════════════════════════ */}
        <SectionHeader icon={BarChart3} title="Health Metrics Summary" />

        <div className="bg-card rounded-lg border border-border/60 overflow-x-auto mb-6 print:break-inside-avoid">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60" style={{ background: "rgba(232,145,58,0.04)" }}>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground w-8">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Metric</th>
                <th className="text-right px-3 py-2 font-medium text-card-foreground">{selectedYear}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{selectedYear - 1}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Change</th>
              </tr>
            </thead>
            <tbody>
              {data.health.map((h) => {
                const isPercent = h.name.includes("Growth") || h.name.includes("Ratio") || h.name.includes("Rate");
                const fmtVal = (v: number) => {
                  if (h.name === "Giving Per Capita") return `$${fmtNum(v)}`;
                  if (isPercent) return `${v.toFixed(1)}%`;
                  return fmtNum(v);
                };
                return (
                  <tr key={h.name} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="text-center px-3 py-2"><HealthDot status={h.status} /></td>
                    <td className="px-3 py-2 font-medium text-card-foreground">{h.name}</td>
                    <td className="text-right px-3 py-2 font-semibold">{fmtVal(h.value)}</td>
                    <td className="text-right px-3 py-2 text-muted-foreground">{fmtVal(h.priorValue)}</td>
                    <td className="text-right px-3 py-2">
                      <YoYBadge pct={h.change} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="text-center py-4 border-t border-border/40 mt-8 print:mt-4">
          <p className="text-[10px] text-muted-foreground">
            Revolution Church — {selectedYear} Annual Report — Generated by Lumen Metrix
          </p>
        </div>
      </div>
    </div>
  );
}
