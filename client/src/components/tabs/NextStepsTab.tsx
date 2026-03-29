/*
 * Lumen Metrix — Next Steps Tab
 * Assimilation funnel, FTG/Salvation/Baptism trends, monthly patterns
 * Data: v3 flat structure
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatNumber,
  getYoYChange,
  isPartialYear,
  getMaxMonth,
  getNextStepsForMonths,
  MONTH_NAMES,
} from "@/lib/data";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { ArrowDown } from "lucide-react";

const METRIC_COLORS: Record<string, string> = {
  FTG: "#4A7C59",
  Salvations: "#E8913A",
  Baptisms: "#4A7FB5",
  Stewardship: "#8B6DAF",
};

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

function getNsTotal(
  ns: { year: number; campus: string; metric: string; total: number }[],
  year: number,
  campus: string,
  metric: string
): number {
  if (campus === "All Campuses") {
    return ns
      .filter((n) => n.year === year && n.metric === metric && n.campus === "All Campuses")
      .reduce((s, n) => s + n.total, 0);
  }
  return (
    ns.find(
      (n) => n.year === year && n.campus === campus && n.metric === metric
    )?.total ?? 0
  );
}

export default function NextStepsTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter(
      (y) => y >= filters.yearStart && y <= filters.yearEnd
    );
  }, [data, filters]);

  const latestYear = useMemo(
    () => filteredYears[filteredYears.length - 1] ?? 2026,
    [filteredYears]
  );

  const metricTrend = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["FTG", "Salvations", "Baptisms"].forEach((metric) => {
        row[metric] = getNsTotal(data.next_steps, year, filters.campus, metric);
      });
      return row;
    });
  }, [data, filters, filteredYears]);

  const funnelData = useMemo(() => {
    if (!data) return [];
    const ftg = getNsTotal(data.next_steps, latestYear, filters.campus, "FTG");
    const salv = getNsTotal(data.next_steps, latestYear, filters.campus, "Salvations");
    const bap = getNsTotal(data.next_steps, latestYear, filters.campus, "Baptisms");
    const stew = getNsTotal(data.next_steps, latestYear, filters.campus, "Stewardship");

    return [
      { step: "First Time Guests", value: ftg, color: METRIC_COLORS.FTG },
      { step: "Salvations", value: salv, color: METRIC_COLORS.Salvations },
      { step: "Baptisms", value: bap, color: METRIC_COLORS.Baptisms },
      { step: "New Stewards", value: stew, color: METRIC_COLORS.Stewardship },
    ];
  }, [data, filters, latestYear]);

  const monthlyPattern = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const row: Record<string, number | string> = { month: MONTH_NAMES[i] };
      ["FTG", "Salvations", "Baptisms"].forEach((metric) => {
        const matches = data.next_steps_monthly.filter(
          (m) =>
            m.year === latestYear &&
            m.month === month &&
            m.metric === metric &&
            (filters.campus === "All Campuses" || m.campus === filters.campus)
        );
        row[metric] = matches.reduce((s, m) => s + m.count, 0);
      });
      return row;
    });
  }, [data, filters, latestYear]);

  const partial = useMemo(() => data ? isPartialYear(data, latestYear) : false, [data, latestYear]);
  const maxMonth = useMemo(() => data ? getMaxMonth(data, latestYear) : 12, [data, latestYear]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const priorYear = latestYear - 1;
    const compMonths = Array.from({ length: maxMonth }, (_, i) => i + 1);

    const getChange = (metric: string) => {
      if (partial) {
        const curr = getNextStepsForMonths(data, latestYear, filters.campus, metric, compMonths);
        const prev = getNextStepsForMonths(data, priorYear, filters.campus, metric, compMonths);
        return getYoYChange(curr, prev);
      }
      return getYoYChange(
        getNsTotal(data.next_steps, latestYear, filters.campus, metric),
        getNsTotal(data.next_steps, priorYear, filters.campus, metric)
      );
    };

    return {
      ftg: getNsTotal(data.next_steps, latestYear, filters.campus, "FTG"),
      ftgChange: getChange("FTG"),
      salvations: getNsTotal(data.next_steps, latestYear, filters.campus, "Salvations"),
      salvationsChange: getChange("Salvations"),
      baptisms: getNsTotal(data.next_steps, latestYear, filters.campus, "Baptisms"),
      baptismsChange: getChange("Baptisms"),
    };
  }, [data, filters, latestYear, partial, maxMonth]);

  if (!data || !kpis) return null;
  const maxFunnel = Math.max(...funnelData.map((f) => f.value), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="First Time Guests"
          value={formatNumber(kpis.ftg)}
          change={kpis.ftgChange}
          subtitle={`${latestYear}${partial ? " YTD" : ""} total${partial ? " (vs same period prior year)" : ""}`}
          borderColor={METRIC_COLORS.FTG}
        />
        <KpiCard
          label="Salvations"
          value={formatNumber(kpis.salvations)}
          change={kpis.salvationsChange}
          subtitle={`${latestYear}${partial ? " YTD" : ""} total${partial ? " (vs same period prior year)" : ""}`}
          borderColor={METRIC_COLORS.Salvations}
        />
        <KpiCard
          label="Baptisms"
          value={formatNumber(kpis.baptisms)}
          change={kpis.baptismsChange}
          subtitle={`${latestYear}${partial ? " YTD" : ""} total${partial ? " (vs same period prior year)" : ""}`}
          borderColor={METRIC_COLORS.Baptisms}
        />
      </div>

      {/* Assimilation Funnel */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-1">
          Assimilation Funnel — {latestYear}
        </h3>
        <p className="text-[11px] text-muted-foreground mb-5">
          Tracking the journey from first visit to committed steward
        </p>
        <div className="space-y-2">
          {funnelData.map((step, i) => {
            const widthPct =
              maxFunnel > 0 ? (step.value / maxFunnel) * 100 : 0;
            const conversionRate =
              i > 0 && funnelData[i - 1].value > 0
                ? ((step.value / funnelData[i - 1].value) * 100).toFixed(1)
                : null;
            return (
              <div key={step.step}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-1 pl-4">
                    <ArrowDown className="w-3 h-3 text-muted-foreground/40" />
                    {conversionRate && (
                      <span className="text-[10px] text-muted-foreground">
                        {conversionRate}% conversion
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="w-32 text-right">
                    <span className="text-xs font-medium text-foreground/80">
                      {step.step}
                    </span>
                  </div>
                  <div className="flex-1 h-10 bg-muted/30 rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-700 flex items-center px-3"
                      style={{
                        width: `${Math.max(widthPct, 3)}%`,
                        backgroundColor: step.color,
                      }}
                    >
                      <span className="stat-value text-sm text-white drop-shadow-sm">
                        {formatNumber(step.value)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">
            Next Steps — Multi-Year Trend
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={metricTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fontFamily: "'Inter'" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fontFamily: "'DM Mono'" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatNumber}
              />
              <Tooltip contentStyle={TT} />
              <Legend
                wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
                iconType="circle"
                iconSize={8}
              />
              <Line
                type="monotone"
                dataKey="FTG"
                stroke={METRIC_COLORS.FTG}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Salvations"
                stroke={METRIC_COLORS.Salvations}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Baptisms"
                stroke={METRIC_COLORS.Baptisms}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">
            Monthly Pattern — {latestYear}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyPattern}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fontFamily: "'Inter'" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fontFamily: "'DM Mono'" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={TT} />
              <Legend
                wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="FTG"
                fill={METRIC_COLORS.FTG}
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
              <Bar
                dataKey="Salvations"
                fill={METRIC_COLORS.Salvations}
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
              <Bar
                dataKey="Baptisms"
                fill={METRIC_COLORS.Baptisms}
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
