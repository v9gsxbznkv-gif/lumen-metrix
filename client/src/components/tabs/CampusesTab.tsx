/*
 * Lumen Metrix — Campuses Page
 * Side-by-side campus comparison: Canton vs Jasper vs Online
 * Each campus gets a scorecard with key metrics
 */
import { useData } from "@/contexts/DataContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  CAMPUS_COLORS, formatNumber, formatCurrency, getMaxMonth, isPartialYear,
  MONTH_NAMES, getAttendanceForMonths, getGivingForMonths, getNextStepsForMonths,
} from "@/lib/data";
import { Building2, Users, DollarSign, UserPlus, Heart, TrendingUp, TrendingDown } from "lucide-react";
import DemographicMap from "@/components/DemographicMap";

export default function CampusesTab() {
  const { data, filters } = useData();
  if (!data) return null;

  const { yearStart, yearEnd } = filters;
  const latestYear = yearEnd;
  const priorYear = latestYear - 1;
  const partial = isPartialYear(data, latestYear);
  const maxMonth = getMaxMonth(data, latestYear);
  const months = Array.from({ length: maxMonth }, (_, i) => i + 1);
  const monthLabel = partial ? `Jan–${MONTH_NAMES[maxMonth - 1]}` : "Full Year";

  const campuses = ["Canton", "Jasper", "Online"];

  // Build campus scorecards
  const scorecards = campuses.map((c) => {
    const attNow = partial
      ? getAttendanceForMonths(data, latestYear, c, months).avgWeekly
      : data.attendance.filter((r) => r.year === latestYear && r.campus === c && r.subgroup === "Total").reduce((s, r) => s + r.avg_weekly, 0);
    const attPrior = partial
      ? getAttendanceForMonths(data, priorYear, c, months).avgWeekly
      : data.attendance.filter((r) => r.year === priorYear && r.campus === c && r.subgroup === "Total").reduce((s, r) => s + r.avg_weekly, 0);

    const givNow = partial
      ? getGivingForMonths(data, latestYear, c, months)
      : data.giving.filter((r) => r.year === latestYear && r.campus === c).reduce((s, r) => s + r.total, 0);
    const givPrior = partial
      ? getGivingForMonths(data, priorYear, c, months)
      : data.giving.filter((r) => r.year === priorYear && r.campus === c).reduce((s, r) => s + r.total, 0);

    const ftgNow = partial
      ? getNextStepsForMonths(data, latestYear, c, "FTG", months)
      : data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "FTG").reduce((s, r) => s + r.total, 0);

    const salvNow = partial
      ? getNextStepsForMonths(data, latestYear, c, "Salvations", months)
      : data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Salvations").reduce((s, r) => s + r.total, 0);

    const baptNow = partial
      ? getNextStepsForMonths(data, latestYear, c, "Baptisms", months)
      : data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Baptisms").reduce((s, r) => s + r.total, 0);

    const volNow = data.serving.filter((r) => r.year === latestYear && r.campus === c).reduce((s, r) => s + r.avg_weekly, 0);

    const attChange = attPrior > 0 ? ((attNow - attPrior) / attPrior * 100) : 0;
    const givChange = givPrior > 0 ? ((givNow - givPrior) / givPrior * 100) : 0;

    // GPC
    const gpc = attNow > 0 ? Math.round(givNow / attNow) : 0;

    return { campus: c, attNow, attChange, givNow, givChange, ftgNow, salvNow, baptNow, volNow, gpc };
  });

  // Multi-year campus comparison
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);
  const campusYearData = years.map((y) => {
    const row: Record<string, number | string> = { year: y };
    for (const c of campuses) {
      const att = data.attendance.filter((r) => r.year === y && r.campus === c && r.subgroup === "Total").reduce((s, r) => s + r.avg_weekly, 0);
      row[c] = att;
    }
    return row;
  });

  // Radar chart data for latest year
  const radarMetrics = ["Attendance", "Giving", "FTG", "Salvations", "Volunteers"];
  const maxVals: Record<string, number> = {};
  for (const m of radarMetrics) {
    maxVals[m] = Math.max(
      ...scorecards.map((sc) => {
        if (m === "Attendance") return sc.attNow;
        if (m === "Giving") return sc.givNow;
        if (m === "FTG") return sc.ftgNow;
        if (m === "Salvations") return sc.salvNow;
        if (m === "Volunteers") return sc.volNow;
        return 0;
      }),
      1
    );
  }

  const radarData = radarMetrics.map((m) => {
    const row: Record<string, number | string> = { metric: m };
    for (const sc of scorecards) {
      let val = 0;
      if (m === "Attendance") val = sc.attNow;
      else if (m === "Giving") val = sc.givNow;
      else if (m === "FTG") val = sc.ftgNow;
      else if (m === "Salvations") val = sc.salvNow;
      else if (m === "Volunteers") val = sc.volNow;
      row[sc.campus] = Math.round((val / maxVals[m]) * 100);
    }
    return row;
  });

  const ChangeIndicator = ({ value }: { value: number }) => (
    <div className="flex items-center gap-1">
      {value > 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : value < 0 ? <TrendingDown className="w-3 h-3 text-red-400" /> : null}
      <span className={`text-[10px] font-medium ${value >= 0 ? "text-emerald-500" : "text-red-400"}`}>
        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      {partial && (
        <div className="px-3 py-2 rounded-md text-xs font-medium" style={{ background: "rgba(232,145,58,0.08)", color: "#E8913A" }}>
          {latestYear} YTD ({monthLabel}) — comparisons use same period from {priorYear}
        </div>
      )}

      {/* Campus Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
        {scorecards.map((sc) => (
          <div
            key={sc.campus}
            className="bg-card rounded-lg border-2 p-4 sm:p-5"
            style={{ borderColor: `${CAMPUS_COLORS[sc.campus]}40` }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5" style={{ color: CAMPUS_COLORS[sc.campus] }} />
              <h3 className="text-base font-bold" style={{ fontFamily: "'DM Sans', sans-serif" }}>{sc.campus}</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Avg Weekly</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(sc.attNow)}</span>
                  <ChangeIndicator value={sc.attChange} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total Giving</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatCurrency(sc.givNow)}</span>
                  <ChangeIndicator value={sc.givChange} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">GPC (Annual)</span>
                </div>
                <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#E8913A" }}>{formatCurrency(sc.gpc)}</span>
              </div>

              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">FTG</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(sc.ftgNow)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Salvations</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(sc.salvNow)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Baptisms</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(sc.baptNow)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Volunteers</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(sc.volNow)}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Attendance Comparison + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Avg Weekly Attendance by Campus</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={campusYearData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {campuses.map((c) => (
                <Bar key={c} dataKey={c} fill={CAMPUS_COLORS[c]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Campus Comparison Radar — {latestYear}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <PolarRadiusAxis tick={{ fontSize: 9, fill: "#6B7280" }} domain={[0, 100]} />
              {campuses.filter((c) => c !== "Online").map((c) => (
                <Radar key={c} name={c} dataKey={c} stroke={CAMPUS_COLORS[c]} fill={CAMPUS_COLORS[c]} fillOpacity={0.15} strokeWidth={2} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Demographic Map */}
      <DemographicMap />

      {/* Campus Share Table */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Campus Share — {latestYear}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2 text-muted-foreground font-medium">Metric</th>
                {campuses.map((c) => (
                  <th key={c} className="text-right py-2 font-medium" style={{ color: CAMPUS_COLORS[c] }}>{c}</th>
                ))}
                <th className="text-right py-2 text-muted-foreground font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Avg Weekly Attendance", values: scorecards.map((sc) => sc.attNow), fmt: formatNumber },
                { label: "Total Giving", values: scorecards.map((sc) => sc.givNow), fmt: formatCurrency },
                { label: "First-Time Guests", values: scorecards.map((sc) => sc.ftgNow), fmt: formatNumber },
                { label: "Salvations", values: scorecards.map((sc) => sc.salvNow), fmt: formatNumber },
                { label: "Baptisms", values: scorecards.map((sc) => sc.baptNow), fmt: formatNumber },
                { label: "Avg Weekly Volunteers", values: scorecards.map((sc) => sc.volNow), fmt: formatNumber },
              ].map((row) => (
                <tr key={row.label} className="border-b border-border/20">
                  <td className="py-2.5 font-medium">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={campuses[i]} className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{row.fmt(v)}</td>
                  ))}
                  <td className="text-right py-2.5 font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#E8913A" }}>
                    {row.fmt(row.values.reduce((s, v) => s + v, 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
