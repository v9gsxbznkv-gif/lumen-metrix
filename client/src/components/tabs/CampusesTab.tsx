/*
 * Lumen Metrix — Campuses Page
 * Side-by-side campus comparison: Canton vs Jasper vs Online
 * Each campus gets a scorecard with key metrics
 * Uses DB-backed tRPC endpoints (dataViews) for consistent data across all pages
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  CAMPUS_COLORS, formatNumber, formatCurrency,
} from "@/lib/data";
import { Building2, Users, DollarSign, UserPlus, Heart, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import DemographicMap from "@/components/DemographicMap";

const CAMPUSES = ["Canton", "Jasper", "Online"] as const;
const CURRENT_YEAR = 2026;
const PRIOR_YEAR = 2025;

export default function CampusesTab() {
  const { data, filters } = useData();

  // ── DB-backed queries: attendance per campus (yearly) ──
  const attCantonQ = trpc.dataViews.attendance.getData.useQuery({
    viewMode: "yearly", campus: "Canton", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const attJasperQ = trpc.dataViews.attendance.getData.useQuery({
    viewMode: "yearly", campus: "Jasper", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const attOnlineQ = trpc.dataViews.attendance.getData.useQuery({
    viewMode: "yearly", campus: "Online", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });

  // ── DB-backed queries: giving per campus (yearly) ──
  const givCantonQ = trpc.dataViews.giving.getData.useQuery({
    viewMode: "yearly", campus: "Canton", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const givJasperQ = trpc.dataViews.giving.getData.useQuery({
    viewMode: "yearly", campus: "Jasper", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const givOnlineQ = trpc.dataViews.giving.getData.useQuery({
    viewMode: "yearly", campus: "Online", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });

  // ── DB-backed queries: per capita per campus ──
  const gpcCantonQ = trpc.dataViews.giving.getPerCapita.useQuery({
    year: CURRENT_YEAR, campus: "Canton",
  });
  const gpcJasperQ = trpc.dataViews.giving.getPerCapita.useQuery({
    year: CURRENT_YEAR, campus: "Jasper",
  });
  const gpcAllQ = trpc.dataViews.giving.getPerCapita.useQuery({
    year: CURRENT_YEAR,
  });

  // ── DB-backed queries: next steps per campus (yearly) ──
  const nsCantonQ = trpc.dataViews.nextSteps.getData.useQuery({
    viewMode: "yearly", campus: "Canton", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const nsJasperQ = trpc.dataViews.nextSteps.getData.useQuery({
    viewMode: "yearly", campus: "Jasper", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const nsOnlineQ = trpc.dataViews.nextSteps.getData.useQuery({
    viewMode: "yearly", campus: "Online", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });

  // ── DB-backed queries: serving per campus (yearly) ──
  const servCantonQ = trpc.dataViews.serving.getData.useQuery({
    viewMode: "yearly", campus: "Canton", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const servJasperQ = trpc.dataViews.serving.getData.useQuery({
    viewMode: "yearly", campus: "Jasper", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });
  const servOnlineQ = trpc.dataViews.serving.getData.useQuery({
    viewMode: "yearly", campus: "Online", startYear: PRIOR_YEAR, endYear: CURRENT_YEAR,
  });

  // ── DB-backed queries: attendance for bar chart (all years, per campus) ──
  const attCantonAllQ = trpc.dataViews.attendance.getData.useQuery({
    viewMode: "yearly", campus: "Canton",
  });
  const attJasperAllQ = trpc.dataViews.attendance.getData.useQuery({
    viewMode: "yearly", campus: "Jasper",
  });
  const attOnlineAllQ = trpc.dataViews.attendance.getData.useQuery({
    viewMode: "yearly", campus: "Online",
  });

  // Check if critical data is loading
  const isLoading = !attCantonQ.data || !attJasperQ.data || !givCantonQ.data || !givJasperQ.data;

  // ── Helper: extract yearly row from DB query result ──
  const getYearRow = (queryData: any, year: number): any | null => {
    if (!queryData?.data) return null;
    return (queryData.data as any[]).find((r: any) => r.year === year) ?? null;
  };

  // ── Helper: get next steps count for a metric from DB query ──
  const getNsCount = (queryData: any, year: number, metric: string): number => {
    if (!queryData?.data) return 0;
    return (queryData.data as any[])
      .filter((r: any) => r.year === year && r.metric === metric)
      .reduce((s: number, r: any) => s + (r.count ?? 0), 0);
  };

  // ── Build campus scorecards from DB data ──
  const scorecards = useMemo(() => {
    const attQueries = { Canton: attCantonQ, Jasper: attJasperQ, Online: attOnlineQ };
    const givQueries = { Canton: givCantonQ, Jasper: givJasperQ, Online: givOnlineQ };
    const gpcQueries = { Canton: gpcCantonQ, Jasper: gpcJasperQ, Online: null };
    const nsQueries = { Canton: nsCantonQ, Jasper: nsJasperQ, Online: nsOnlineQ };
    const servQueries = { Canton: servCantonQ, Jasper: servJasperQ, Online: servOnlineQ };

    return CAMPUSES.map((c) => {
      // Attendance: avgWeeklyTotal from yearly aggregation
      const attRow = getYearRow(attQueries[c].data, CURRENT_YEAR);
      const attPriorRow = getYearRow(attQueries[c].data, PRIOR_YEAR);
      const attNow = attRow?.avgWeeklyTotal ?? 0;
      const attPrior = attPriorRow?.avgWeeklyTotal ?? 0;

      // Giving: total from yearly aggregation
      const givRow = getYearRow(givQueries[c].data, CURRENT_YEAR);
      const givPriorRow = getYearRow(givQueries[c].data, PRIOR_YEAR);
      const givNow = givRow?.total ?? 0;
      const givPrior = givPriorRow?.total ?? 0;

      // Per capita ($/wk) from getPerCapita endpoint
      const gpcQ = gpcQueries[c];
      const gpc = gpcQ ? (gpcQ.data?.currentYearAvgGpc ?? 0) : 0;

      // Next steps
      const nsQ = nsQueries[c];
      const ftgNow = getNsCount(nsQ.data, CURRENT_YEAR, "FTG");
      const salvNow = getNsCount(nsQ.data, CURRENT_YEAR, "Salvations");
      const baptNow = getNsCount(nsQ.data, CURRENT_YEAR, "Baptisms");

      // Serving: avgWeekly from yearly aggregation
      const servRow = getYearRow(servQueries[c].data, CURRENT_YEAR);
      const volNow = servRow?.avgWeekly ?? 0;

      // YoY changes
      const attChange = attPrior > 0 ? ((attNow - attPrior) / attPrior * 100) : 0;
      const givChange = givPrior > 0 ? ((givNow - givPrior) / givPrior * 100) : 0;

      return { campus: c, attNow, attChange, givNow, givChange, ftgNow, salvNow, baptNow, volNow, gpc };
    });
  }, [
    attCantonQ.data, attJasperQ.data, attOnlineQ.data,
    givCantonQ.data, givJasperQ.data, givOnlineQ.data,
    gpcCantonQ.data, gpcJasperQ.data,
    nsCantonQ.data, nsJasperQ.data, nsOnlineQ.data,
    servCantonQ.data, servJasperQ.data, servOnlineQ.data,
  ]);

  // ── Multi-year campus comparison bar chart data (from DB) ──
  const campusYearData = useMemo(() => {
    const { yearStart, yearEnd } = filters;
    const allYears = new Set<number>();
    const campusMap: Record<string, Map<number, number>> = {};

    const allQueries = { Canton: attCantonAllQ, Jasper: attJasperAllQ, Online: attOnlineAllQ };
    for (const c of CAMPUSES) {
      const q = allQueries[c];
      const map = new Map<number, number>();
      if (q.data?.data) {
        for (const row of q.data.data as any[]) {
          if (row.year >= yearStart && row.year <= yearEnd) {
            map.set(row.year, row.avgWeeklyTotal ?? 0);
            allYears.add(row.year);
          }
        }
      }
      campusMap[c] = map;
    }

    const years = Array.from(allYears).sort((a, b) => a - b);
    return years.map((y) => {
      const row: Record<string, number | string> = { year: y };
      for (const c of CAMPUSES) {
        row[c] = campusMap[c].get(y) ?? 0;
      }
      return row;
    });
  }, [attCantonAllQ.data, attJasperAllQ.data, attOnlineAllQ.data, filters]);

  // ── Radar chart data for latest year ──
  const radarData = useMemo(() => {
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

    return radarMetrics.map((m) => {
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
  }, [scorecards]);

  const ChangeIndicator = ({ value }: { value: number }) => (
    <div className="flex items-center gap-1">
      {value > 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : value < 0 ? <TrendingDown className="w-3 h-3 text-red-400" /> : null}
      <span className={`text-[10px] font-medium ${value >= 0 ? "text-emerald-500" : "text-red-400"}`}>
        {value >= 0 ? "+" : ""}{value.toFixed(1)}%
      </span>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading campus data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="px-3 py-2 rounded-md text-xs font-medium" style={{ background: "rgba(232,145,58,0.08)", color: "#E8913A" }}>
        {CURRENT_YEAR} YTD — all metrics from DB pipeline for consistency
      </div>

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
                  <span className="text-xs text-muted-foreground">Per Capita ($/wk)</span>
                </div>
                <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#E8913A" }}>
                  {sc.gpc > 0 ? `$${sc.gpc.toFixed(0)}` : "—"}
                </span>
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
              {CAMPUSES.map((c) => (
                <Bar key={c} dataKey={c} fill={CAMPUS_COLORS[c]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Campus Comparison Radar — {CURRENT_YEAR}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <PolarRadiusAxis tick={{ fontSize: 9, fill: "#6B7280" }} domain={[0, 100]} />
              {CAMPUSES.filter((c) => c !== "Online").map((c) => (
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
        <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Campus Share — {CURRENT_YEAR}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2 text-muted-foreground font-medium">Metric</th>
                {CAMPUSES.map((c) => (
                  <th key={c} className="text-right py-2 font-medium" style={{ color: CAMPUS_COLORS[c] }}>{c}</th>
                ))}
                <th className="text-right py-2 text-muted-foreground font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Avg Weekly Attendance", values: scorecards.map((sc) => sc.attNow), fmt: formatNumber },
                { label: "Total Giving", values: scorecards.map((sc) => sc.givNow), fmt: formatCurrency },
                { label: "Per Capita ($/wk)", values: scorecards.map((sc) => sc.gpc), fmt: (v: number) => v > 0 ? `$${v.toFixed(0)}` : "—" },
                { label: "First-Time Guests", values: scorecards.map((sc) => sc.ftgNow), fmt: formatNumber },
                { label: "Salvations", values: scorecards.map((sc) => sc.salvNow), fmt: formatNumber },
                { label: "Baptisms", values: scorecards.map((sc) => sc.baptNow), fmt: formatNumber },
                { label: "Avg Weekly Volunteers", values: scorecards.map((sc) => sc.volNow), fmt: formatNumber },
              ].map((row) => {
                const isPerCapita = row.label === "Per Capita ($/wk)";
                // For per capita, show weighted avg instead of sum
                const totalVal = isPerCapita
                  ? (gpcAllQ.data?.currentYearAvgGpc ?? 0)
                  : row.values.reduce((s, v) => s + v, 0);
                return (
                  <tr key={row.label} className="border-b border-border/20">
                    <td className="py-2.5 font-medium">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={CAMPUSES[i]} className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{row.fmt(v)}</td>
                    ))}
                    <td className="text-right py-2.5 font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#E8913A" }}>
                      {isPerCapita ? (totalVal > 0 ? `$${totalVal.toFixed(0)}` : "—") : row.fmt(totalVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
