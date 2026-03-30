/*
 * Lumen Metrix — People & Growth Page
 * Assimilation funnel: FTG → Salvation → Baptism → Steward
 * People-centric view of next steps data
 */
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, Cell,
} from "recharts";
import {
  CAMPUS_COLORS, CHART_COLORS, formatNumber, getMaxMonth, isPartialYear,
  getNextStepsForMonths, getPartialYoYChange, MONTH_NAMES,
} from "@/lib/data";
import { Users, Heart, Droplets, HandHeart } from "lucide-react";

export default function PeopleTab() {
  const { data, filters } = useData();
  if (!data) return null;

  const { campus, yearStart, yearEnd } = filters;
  const latestYear = yearEnd;
  const priorYear = latestYear - 1;
  const partial = isPartialYear(data, latestYear);
  const maxMonth = getMaxMonth(data, latestYear);
  const months = Array.from({ length: maxMonth }, (_, i) => i + 1);
  const monthLabel = partial ? `Jan–${MONTH_NAMES[maxMonth - 1]}` : "Full Year";

  // Helper to get metric total for a year
  const getMetric = (year: number, metric: string) => {
    if (partial && year === latestYear) {
      return getNextStepsForMonths(data, year, campus, metric, months);
    }
    return data.next_steps
      .filter((r) => r.year === year && r.metric === metric && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.total, 0);
  };

  const ftgNow = getMetric(latestYear, "FTG");
  const salvNow = getMetric(latestYear, "Salvations");
  const baptNow = getMetric(latestYear, "Baptisms");
  const stewNow = getMetric(latestYear, "Stewardship");

  const ftgChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "FTG", m));
  const salvChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "Salvations", m));
  const baptChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "Baptisms", m));
  const stewChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "Stewardship", m));

  // Assimilation funnel
  const funnelData = [
    { stage: "First-Time Guests", value: ftgNow, color: "#E8913A", icon: "👋" },
    { stage: "Salvations", value: salvNow, color: "#4A7C59", icon: "✝️" },
    { stage: "Baptisms", value: baptNow, color: "#4A7FB5", icon: "💧" },
    { stage: "New Stewards", value: stewNow, color: "#8B6DAF", icon: "🤝" },
  ];

  const conversionRates = [
    { label: "FTG → Salvation", rate: ftgNow > 0 ? (salvNow / ftgNow * 100) : 0 },
    { label: "Salvation → Baptism", rate: salvNow > 0 ? (baptNow / salvNow * 100) : 0 },
    { label: "Baptism → Steward", rate: baptNow > 0 ? (stewNow / baptNow * 100) : 0 },
    { label: "FTG → Steward", rate: ftgNow > 0 ? (stewNow / ftgNow * 100) : 0 },
  ];

  // Multi-year trend
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);
  const trendData = years.map((y) => ({
    year: y,
    FTG: getMetric(y, "FTG"),
    Salvations: getMetric(y, "Salvations"),
    Baptisms: getMetric(y, "Baptisms"),
    Stewardship: getMetric(y, "Stewardship"),
  }));

  // Monthly breakdown for latest year
  const monthlyData = Array.from({ length: maxMonth }, (_, i) => {
    const m = i + 1;
    return {
      month: MONTH_NAMES[i],
      FTG: getNextStepsForMonths(data, latestYear, campus, "FTG", [m]),
      Salvations: getNextStepsForMonths(data, latestYear, campus, "Salvations", [m]),
      Baptisms: getNextStepsForMonths(data, latestYear, campus, "Baptisms", [m]),
    };
  });

  // Campus breakdown for latest year
  const campusBreakdown = ["Canton", "Jasper", "Online"].map((c) => ({
    campus: c,
    FTG: getMetric(latestYear, "FTG") > 0 ? data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "FTG").reduce((s, r) => s + r.total, 0) : 0,
    Salvations: data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Salvations").reduce((s, r) => s + r.total, 0),
    Baptisms: data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Baptisms").reduce((s, r) => s + r.total, 0),
    Stewardship: data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Stewardship").reduce((s, r) => s + r.total, 0),
  }));

  return (
    <div className="space-y-6">
      {partial && (
        <div className="px-3 py-2 rounded-md text-xs font-medium" style={{ background: "rgba(232,145,58,0.08)", color: "#E8913A" }}>
          {latestYear} YTD ({monthLabel}) — comparisons use same period from {priorYear}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="First-Time Guests" value={formatNumber(ftgNow)} change={ftgChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#E8913A" icon={<Users className="w-4 h-4" />} />
        <KpiCard label="Salvations" value={formatNumber(salvNow)} change={salvChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#4A7C59" icon={<Heart className="w-4 h-4" />} />
        <KpiCard label="Baptisms" value={formatNumber(baptNow)} change={baptChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#4A7FB5" icon={<Droplets className="w-4 h-4" />} />
        <KpiCard label="New Stewards" value={formatNumber(stewNow)} change={stewChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#8B6DAF" icon={<HandHeart className="w-4 h-4" />} />
      </div>

      {/* Assimilation Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Assimilation Funnel</h3>
          <div className="space-y-3">
            {funnelData.map((item, i) => {
              const maxVal = Math.max(...funnelData.map((d) => d.value), 1);
              const width = Math.max((item.value / maxVal) * 100, 4);
              return (
                <div key={item.stage} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-muted-foreground shrink-0">{item.stage}</div>
                  <div className="flex-1 h-8 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div
                      className="h-full rounded-md flex items-center px-3 transition-all duration-500"
                      style={{ width: `${width}%`, background: item.color }}
                    >
                      <span className="text-xs font-bold text-white" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {formatNumber(item.value)}
                      </span>
                    </div>
                  </div>
                  {i > 0 && (
                    <div className="w-12 text-right text-[10px] text-muted-foreground">
                      {funnelData[i - 1].value > 0
                        ? `${((item.value / funnelData[i - 1].value) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversion Rates */}
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Conversion Rates</h3>
          <div className="space-y-4">
            {conversionRates.map((cr) => (
              <div key={cr.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">{cr.label}</span>
                  <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#E8913A" }}>
                    {cr.rate.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(cr.rate, 100)}%`, background: "linear-gradient(90deg, #E8913A, #F5C882)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-year Trend */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Multi-Year Trends</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
            <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="FTG" stroke="#E8913A" fill="rgba(232,145,58,0.15)" strokeWidth={2} />
            <Area type="monotone" dataKey="Salvations" stroke="#4A7C59" fill="rgba(74,124,89,0.15)" strokeWidth={2} />
            <Area type="monotone" dataKey="Baptisms" stroke="#4A7FB5" fill="rgba(74,127,181,0.15)" strokeWidth={2} />
            <Area type="monotone" dataKey="Stewardship" stroke="#8B6DAF" fill="rgba(139,109,175,0.15)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Breakdown + Campus Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>{latestYear} Monthly Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FTG" fill="#E8913A" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Salvations" fill="#4A7C59" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Baptisms" fill="#4A7FB5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>{latestYear} Campus Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 text-muted-foreground font-medium">Campus</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">FTG</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Salvations</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Baptisms</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Stewards</th>
                </tr>
              </thead>
              <tbody>
                {campusBreakdown.map((row) => (
                  <tr key={row.campus} className="border-b border-border/20">
                    <td className="py-2.5 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: CAMPUS_COLORS[row.campus] }} />
                      {row.campus}
                    </td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.FTG)}</td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.Salvations)}</td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.Baptisms)}</td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.Stewardship)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
