/*
 * Lumen Metrix — Visitors Page
 * First-Time Guest focused view with trends, campus breakdown, and conversion tracking
 */
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  CAMPUS_COLORS, CHART_COLORS, formatNumber, getMaxMonth, isPartialYear,
  getNextStepsForMonths, getAttendanceForMonths, getPartialYoYChange, MONTH_NAMES,
} from "@/lib/data";
import { UserPlus, TrendingUp, Target, Repeat } from "lucide-react";

export default function VisitorsTab() {
  const { data, filters } = useData();
  if (!data) return null;

  const { campus, yearStart, yearEnd } = filters;
  const latestYear = yearEnd;
  const priorYear = latestYear - 1;
  const partial = isPartialYear(data, latestYear);
  const maxMonth = getMaxMonth(data, latestYear);
  const months = Array.from({ length: maxMonth }, (_, i) => i + 1);
  const monthLabel = partial ? `Jan–${MONTH_NAMES[maxMonth - 1]}` : "Full Year";

  // FTG totals
  const ftgNow = partial
    ? getNextStepsForMonths(data, latestYear, campus, "FTG", months)
    : data.next_steps.filter((r) => r.year === latestYear && r.metric === "FTG" && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.total, 0);

  const ftgChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "FTG", m));

  // Avg weekly FTG
  const weekCount = partial ? maxMonth * 4.33 : 52;
  const avgWeeklyFTG = Math.round(ftgNow / weekCount);

  // FTG as % of attendance
  const attNow = partial
    ? getAttendanceForMonths(data, latestYear, campus, months)
    : { total: data.attendance.filter((r) => r.year === latestYear && r.subgroup === "Total" && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.total, 0), avgWeekly: 0 };
  const ftgPctOfAttendance = attNow.total > 0 ? (ftgNow / attNow.total * 100) : 0;

  // FTG to Salvation conversion
  const salvNow = partial
    ? getNextStepsForMonths(data, latestYear, campus, "Salvations", months)
    : data.next_steps.filter((r) => r.year === latestYear && r.metric === "Salvations" && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.total, 0);
  const conversionRate = ftgNow > 0 ? (salvNow / ftgNow * 100) : 0;

  // Multi-year FTG trend
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);
  const trendData = years.map((y) => {
    const ftg = data.next_steps.filter((r) => r.year === y && r.metric === "FTG" && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.total, 0);
    const att = data.attendance.filter((r) => r.year === y && r.subgroup === "Total" && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.total, 0);
    return {
      year: y,
      FTG: ftg,
      "FTG Rate": att > 0 ? Math.round(ftg / att * 10000) / 100 : 0,
    };
  });

  // Monthly FTG for latest year
  const monthlyFTG = Array.from({ length: maxMonth }, (_, i) => {
    const m = i + 1;
    return {
      month: MONTH_NAMES[i],
      Canton: getNextStepsForMonths(data, latestYear, "Canton", "FTG", [m]),
      Jasper: getNextStepsForMonths(data, latestYear, "Jasper", "FTG", [m]),
    };
  });

  // Campus comparison
  const campusFTG = ["Canton", "Jasper", "Online"].map((c) => ({
    campus: c,
    ftg: data.next_steps.filter((r) => r.year === latestYear && r.metric === "FTG" && r.campus === c).reduce((s, r) => s + r.total, 0),
    salvations: data.next_steps.filter((r) => r.year === latestYear && r.metric === "Salvations" && r.campus === c).reduce((s, r) => s + r.total, 0),
  }));

  return (
    <div className="space-y-6">
      {partial && (
        <div className="px-3 py-2 rounded-md text-xs font-medium" style={{ background: "rgba(232,145,58,0.08)", color: "#E8913A" }}>
          {latestYear} YTD ({monthLabel}) — comparisons use same period from {priorYear}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total First-Time Guests" value={formatNumber(ftgNow)} change={ftgChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#E8913A" icon={<UserPlus className="w-4 h-4" />} />
        <KpiCard label="Avg Weekly FTG" value={formatNumber(avgWeeklyFTG)} subtitle="Per Sunday" borderColor="#4A7FB5" icon={<TrendingUp className="w-4 h-4" />} />
        <KpiCard label="FTG % of Attendance" value={`${ftgPctOfAttendance.toFixed(1)}%`} subtitle="Visitor rate" borderColor="#4A7C59" icon={<Target className="w-4 h-4" />} />
        <KpiCard label="FTG → Salvation Rate" value={`${conversionRate.toFixed(1)}%`} subtitle="Conversion" borderColor="#8B6DAF" icon={<Repeat className="w-4 h-4" />} />
      </div>

      {/* FTG Trend + Monthly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>FTG Multi-Year Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="FTG" stroke="#E8913A" fill="rgba(232,145,58,0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>{latestYear} Monthly FTG by Campus</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyFTG}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Canton" fill={CAMPUS_COLORS.Canton} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Jasper" fill={CAMPUS_COLORS.Jasper} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campus Scorecard */}
      <div className="bg-card rounded-lg border border-border/60 p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Campus Visitor Scorecard — {latestYear}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {campusFTG.map((c) => (
            <div key={c.campus} className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${CAMPUS_COLORS[c.campus]}30` }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full" style={{ background: CAMPUS_COLORS[c.campus] }} />
                <span className="text-sm font-semibold">{c.campus}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">FTG</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(c.ftg)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Salvations</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(c.salvations)}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground">
                  Conversion: <span className="font-bold" style={{ color: "#E8913A" }}>{c.ftg > 0 ? ((c.salvations / c.ftg) * 100).toFixed(1) : "0.0"}%</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
