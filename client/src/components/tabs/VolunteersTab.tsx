/*
 * Lumen Metrix — Volunteers Page
 * Volunteer counts, ratios, campus breakdown, and multi-year trends
 */
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  CAMPUS_COLORS, CHART_COLORS, formatNumber, getMaxMonth, isPartialYear,
  getPartialYoYChange, MONTH_NAMES,
} from "@/lib/data";
import { Users, Percent, TrendingUp, Building2 } from "lucide-react";

export default function VolunteersTab() {
  const { data, filters } = useData();
  if (!data) return null;

  const { campus, yearStart, yearEnd } = filters;
  const latestYear = yearEnd;
  const priorYear = latestYear - 1;
  const partial = isPartialYear(data, latestYear);
  const maxMonth = getMaxMonth(data, latestYear);
  const monthLabel = partial ? `Jan–${MONTH_NAMES[maxMonth - 1]}` : "Full Year";

  // Current year serving
  const servNow = data.serving.filter((r) => r.year === latestYear && (campus === "All Campuses" || r.campus === campus));
  const avgVolunteers = servNow.reduce((s, r) => s + r.avg_weekly, 0);

  // Attendance for ratio
  const attNow = data.attendance.filter((r) => r.year === latestYear && r.subgroup === "Total" && (campus === "All Campuses" || r.campus === campus));
  const avgAttendance = attNow.reduce((s, r) => s + r.avg_weekly, 0);
  const volunteerRatio = avgAttendance > 0 ? (avgAttendance / avgVolunteers) : 0;
  const volunteerPct = avgAttendance > 0 ? (avgVolunteers / avgAttendance * 100) : 0;

  // YoY change for volunteers
  const servPrior = data.serving.filter((r) => r.year === priorYear && (campus === "All Campuses" || r.campus === campus));
  const avgVolPrior = servPrior.reduce((s, r) => s + r.avg_weekly, 0);
  const volChange = avgVolPrior > 0
    ? { value: ((avgVolunteers - avgVolPrior) / avgVolPrior) * 100, label: `${((avgVolunteers - avgVolPrior) / avgVolPrior * 100) >= 0 ? "+" : ""}${((avgVolunteers - avgVolPrior) / avgVolPrior * 100).toFixed(1)}%`, positive: avgVolunteers >= avgVolPrior }
    : { value: 0, label: "N/A", positive: true };

  // Multi-year trend
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);
  const trendData = years.map((y) => {
    const vol = data.serving.filter((r) => r.year === y && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.avg_weekly, 0);
    const att = data.attendance.filter((r) => r.year === y && r.subgroup === "Total" && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.avg_weekly, 0);
    return {
      year: y,
      Volunteers: vol,
      Attendance: att,
      Ratio: att > 0 ? Math.round(att / vol * 10) / 10 : 0,
      Pct: att > 0 ? Math.round(vol / att * 1000) / 10 : 0,
    };
  });

  // Monthly breakdown for latest year
  const monthlyData = Array.from({ length: maxMonth }, (_, i) => {
    const m = i + 1;
    const vol = data.serving_monthly.filter((r) => r.year === latestYear && r.month === m && (campus === "All Campuses" || r.campus === campus)).reduce((s, r) => s + r.total, 0);
    return { month: MONTH_NAMES[i], Volunteers: vol };
  });

  // Campus breakdown
  const campusData = ["Canton", "Jasper"].map((c) => {
    const vol = data.serving.filter((r) => r.year === latestYear && r.campus === c).reduce((s, r) => s + r.avg_weekly, 0);
    const att = data.attendance.filter((r) => r.year === latestYear && r.subgroup === "Total" && r.campus === c).reduce((s, r) => s + r.avg_weekly, 0);
    return {
      campus: c,
      avgVolunteers: vol,
      avgAttendance: att,
      ratio: att > 0 ? Math.round(att / vol * 10) / 10 : 0,
      pct: att > 0 ? Math.round(vol / att * 1000) / 10 : 0,
    };
  });

  return (
    <div className="space-y-6">
      {partial && (
        <div className="px-3 py-2 rounded-md text-xs font-medium" style={{ background: "rgba(232,145,58,0.08)", color: "#E8913A" }}>
          {latestYear} YTD ({monthLabel}) — comparisons use same period from {priorYear}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Avg Weekly Volunteers" value={formatNumber(avgVolunteers)} change={volChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#E8913A" icon={<Users className="w-4 h-4" />} />
        <KpiCard label="Volunteer %" value={`${volunteerPct.toFixed(1)}%`} subtitle="Of total attendance" borderColor="#4A7C59" icon={<Percent className="w-4 h-4" />} />
        <KpiCard label="Attendee:Volunteer" value={`${volunteerRatio.toFixed(1)}:1`} subtitle="Ratio" borderColor="#4A7FB5" icon={<TrendingUp className="w-4 h-4" />} />
        <KpiCard label="Avg Attendance" value={formatNumber(avgAttendance)} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#8B6DAF" icon={<Building2 className="w-4 h-4" />} />
      </div>

      {/* Multi-year Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Volunteer Trend (Avg Weekly)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="Volunteers" stroke="#E8913A" fill="rgba(232,145,58,0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Volunteer % of Attendance</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} unit="%" />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `${v}%`} />
              <Line type="monotone" dataKey="Pct" stroke="#4A7C59" strokeWidth={2} dot={{ fill: "#4A7C59", r: 3 }} name="Volunteer %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly + Campus */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>{latestYear} Monthly Volunteers</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="Volunteers" fill="#E8913A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Campus Comparison — {latestYear}</h3>
          <div className="space-y-4">
            {campusData.map((c) => (
              <div key={c.campus} className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${CAMPUS_COLORS[c.campus]}30` }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full" style={{ background: CAMPUS_COLORS[c.campus] }} />
                  <span className="text-sm font-semibold">{c.campus}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Vol</p>
                    <p className="text-base font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(c.avgVolunteers)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vol %</p>
                    <p className="text-base font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#4A7C59" }}>{c.pct}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ratio</p>
                    <p className="text-base font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{c.ratio}:1</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
