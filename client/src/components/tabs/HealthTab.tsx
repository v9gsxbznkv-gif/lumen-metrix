/*
 * Lumen Metrix — Health Metrics Tab
 * Health scores, volunteer ratios, serving breakdown, growth rates
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import {
  formatNumber, formatPercent, formatCurrency, getYoYChange, CAMPUS_COLORS,
} from "@/lib/data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ComposedChart,
} from "recharts";
import { CheckCircle, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

const TT = { fontSize: 12, borderRadius: 8, border: "1px solid #E8E5DE", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontFamily: "'Inter'" };

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  excellent: { color: "#4A7C59", bg: "rgba(74,124,89,0.08)", icon: Sparkles, label: "Excellent" },
  good: { color: "#4A7FB5", bg: "rgba(74,127,181,0.08)", icon: CheckCircle, label: "Good" },
  caution: { color: "#D4A843", bg: "rgba(212,168,67,0.08)", icon: AlertTriangle, label: "Watch" },
  concern: { color: "#C45B4A", bg: "rgba(196,91,74,0.08)", icon: AlertCircle, label: "Concern" },
};

export default function HealthTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter((y) => y >= filters.yearStart && y <= filters.yearEnd);
  }, [data, filters]);

  const latestYear = useMemo(() => filteredYears.filter((y) => y <= 2024).pop() ?? 2024, [filteredYears]);

  const volunteerTrend = useMemo(() => {
    if (!data) return [];
    const vr = data.computed.volunteer_ratio;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        ["Canton", "Jasper"].forEach((c) => {
          const match = vr.find((v) => v.year === year && v.campus === c);
          row[c] = match ? Math.round(match.pct * 10) / 10 : 0;
        });
      } else {
        const match = vr.find((v) => v.year === year && v.campus === filters.campus);
        row[filters.campus] = match ? Math.round(match.pct * 10) / 10 : 0;
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  const servingBreakdown = useMemo(() => {
    if (!data) return [];
    const annual = data.serving.annual;
    const ministries = ["RevKids", "Worship", "Production", "Host Team", "Welcome", "Welcome Team", "Students", "Campus Security", "Data Team", "Outreach", "Set Up/Tear Down"];
    return ministries.map((ministry) => {
      const matches = annual.filter((a) => a.year === latestYear && a.subgroup === ministry && (filters.campus === "All Campuses" || a.campus === filters.campus));
      return { ministry, avg: Math.round(matches.reduce((s, m) => s + m.avg_weekly, 0)) };
    }).filter((m) => m.avg > 0).sort((a, b) => b.avg - a.avg);
  }, [data, filters, latestYear]);

  const growthTrend = useMemo(() => {
    if (!data) return [];
    const totals = data.attendance.total_annual;
    const tithes = data.giving.tithes_annual;
    return filteredYears.map((year, i) => {
      const getAtt = (y: number) => {
        const match = filters.campus === "All Campuses" ? totals.find((t) => t.year === y && t.campus === "All Campuses") : totals.find((t) => t.year === y && t.campus === filters.campus);
        return match?.avg_weekly ?? 0;
      };
      const getGiving = (y: number) => {
        const match = filters.campus === "All Campuses" ? tithes.find((t) => t.year === y && t.campus === "All Campuses") : tithes.find((t) => t.year === y && t.campus === filters.campus);
        return match?.total ?? 0;
      };
      const currAtt = getAtt(year);
      const prevAtt = i > 0 ? getAtt(filteredYears[i - 1]) : 0;
      const currGiv = getGiving(year);
      const prevGiv = i > 0 ? getGiving(filteredYears[i - 1]) : 0;
      return {
        year,
        attGrowth: prevAtt > 0 ? Math.round(((currAtt - prevAtt) / prevAtt) * 1000) / 10 : 0,
        givGrowth: prevGiv > 0 ? Math.round(((currGiv - prevGiv) / prevGiv) * 1000) / 10 : 0,
      };
    });
  }, [data, filters, filteredYears]);

  const healthScores = useMemo(() => {
    if (!data) return [];
    const vr = data.computed.volunteer_ratio;
    const gpc = data.computed.giving_per_capita;
    const ns = data.next_steps.annual;
    const totals = data.attendance.total_annual;

    const getAtt = (y: number) => {
      const match = filters.campus === "All Campuses" ? totals.find((t) => t.year === y && t.campus === "All Campuses") : totals.find((t) => t.year === y && t.campus === filters.campus);
      return match?.avg_weekly ?? 0;
    };
    const currAtt = getAtt(latestYear);
    const prevAtt = getAtt(latestYear - 1);
    const attGrowth = prevAtt > 0 ? ((currAtt - prevAtt) / prevAtt) * 100 : 0;

    const volRatio = filters.campus === "All Campuses"
      ? vr.filter((v) => v.year === latestYear).reduce((s, v) => s + v.avg_volunteers, 0) / Math.max(vr.filter((v) => v.year === latestYear).reduce((s, v) => s + v.avg_attendance, 0), 1) * 100
      : (vr.find((v) => v.year === latestYear && v.campus === filters.campus)?.pct ?? 0);

    const gpcVal = filters.campus === "All Campuses"
      ? gpc.find((g) => g.year === latestYear && g.campus === "All Campuses")?.giving_per_capita ?? 0
      : gpc.find((g) => g.year === latestYear && g.campus === filters.campus)?.giving_per_capita ?? 0;

    const ftg = filters.campus === "All Campuses"
      ? ns.filter((n) => n.year === latestYear && n.metric === "FTG").reduce((s, n) => s + n.total, 0)
      : ns.find((n) => n.year === latestYear && n.campus === filters.campus && n.metric === "FTG")?.total ?? 0;
    const ftgPerWeek = ftg / 52;
    const ftgPct = currAtt > 0 ? (ftgPerWeek / currAtt) * 100 : 0;

    return [
      { metric: "Attendance Growth", value: `${attGrowth >= 0 ? "+" : ""}${attGrowth.toFixed(1)}%`, status: attGrowth > 5 ? "excellent" : attGrowth > 0 ? "good" : attGrowth > -5 ? "caution" : "concern", benchmark: "Target: 5-10% annual growth" },
      { metric: "Volunteer Ratio", value: `${volRatio.toFixed(1)}%`, status: volRatio > 20 ? "excellent" : volRatio > 15 ? "good" : volRatio > 10 ? "caution" : "concern", benchmark: "Healthy: 15-25% of attendees serving" },
      { metric: "Giving Per Capita", value: formatCurrency(gpcVal), status: gpcVal > 3000 ? "excellent" : gpcVal > 2000 ? "good" : gpcVal > 1000 ? "caution" : "concern", benchmark: "National avg: ~$2,000-$3,000/year" },
      { metric: "FTG Rate", value: `${ftgPct.toFixed(1)}%`, status: ftgPct > 5 ? "excellent" : ftgPct > 3 ? "good" : ftgPct > 1 ? "caution" : "concern", benchmark: "Healthy: 3-7% of weekly attendance" },
    ];
  }, [data, filters, latestYear]);

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Health Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {healthScores.map((score) => {
          const config = STATUS_CONFIG[score.status];
          const Icon = config.icon;
          return (
            <div key={score.metric} className="bg-card rounded-lg border border-border/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-2.5">
                <p className="micro-label text-muted-foreground">{score.metric}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ color: config.color, backgroundColor: config.bg }}>
                  <Icon className="w-3 h-3" />
                  {config.label}
                </span>
              </div>
              <p className="stat-value text-2xl mb-1.5">{score.value}</p>
              <p className="text-[10px] text-muted-foreground">{score.benchmark}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Volunteer-to-Attendee Ratio (%)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={volunteerTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={TT} formatter={(v: number) => [`${v}%`, ""]} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
              {filters.campus === "All Campuses" ? (
                <>
                  <Line type="monotone" dataKey="Canton" stroke={CAMPUS_COLORS.Canton} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Jasper" stroke={CAMPUS_COLORS.Jasper} strokeWidth={2} dot={{ r: 3 }} />
                </>
              ) : (
                <Line type="monotone" dataKey={filters.campus} stroke={CAMPUS_COLORS[filters.campus]} strokeWidth={2} dot={{ r: 3 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Serving by Ministry — {latestYear} Avg Weekly</h3>
          <div className="space-y-3">
            {servingBreakdown.slice(0, 8).map((ministry) => {
              const maxVal = Math.max(...servingBreakdown.map((m) => m.avg), 1);
              return (
                <div key={ministry.ministry}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-foreground/80">{ministry.ministry}</span>
                    <span className="stat-value text-sm">{ministry.avg}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(ministry.avg / maxVal) * 100}%`, backgroundColor: "#E8913A" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-4">Year-over-Year Growth Rate (%)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={growthTrend.slice(1)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={TT} formatter={(v: number, name: string) => [`${v}%`, name === "attGrowth" ? "Attendance" : "Giving"]} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} formatter={(value) => value === "attGrowth" ? "Attendance Growth" : "Giving Growth"} />
            <Bar dataKey="attGrowth" fill="#E8913A" radius={[3, 3, 0, 0]} maxBarSize={24} opacity={0.75} />
            <Line type="monotone" dataKey="givGrowth" stroke="#4A7FB5" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
