/*
 * Lumen Metrix — Next Steps Tab
 * Assimilation funnel, FTG/Salvation/Baptism trends, monthly patterns
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import { formatNumber, getYoYChange, MONTH_NAMES } from "@/lib/data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import { ArrowDown } from "lucide-react";

const METRIC_COLORS: Record<string, string> = {
  FTG: "#4A7C59",
  Salvation: "#E8913A",
  Baptism: "#4A7FB5",
  Stewardship: "#8B6DAF",
};

const TT = { fontSize: 12, borderRadius: 8, border: "1px solid #E8E5DE", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontFamily: "'Inter'" };

export default function NextStepsTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter((y) => y >= filters.yearStart && y <= filters.yearEnd);
  }, [data, filters]);

  const latestYear = useMemo(() => filteredYears[filteredYears.length - 1] ?? 2026, [filteredYears]);

  const metricTrend = useMemo(() => {
    if (!data) return [];
    const annual = data.next_steps.annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["FTG", "Salvation", "Baptism"].forEach((metric) => {
        if (filters.campus === "All Campuses") {
          row[metric] = annual.filter((n) => n.year === year && n.metric === metric).reduce((s, n) => s + n.total, 0);
        } else {
          row[metric] = annual.find((n) => n.year === year && n.campus === filters.campus && n.metric === metric)?.total ?? 0;
        }
      });
      return row;
    });
  }, [data, filters, filteredYears]);

  const funnelData = useMemo(() => {
    if (!data) return [];
    const annual = data.next_steps.annual;
    const getTotal = (metric: string) => {
      if (filters.campus === "All Campuses") return annual.filter((n) => n.year === latestYear && n.metric === metric).reduce((s, n) => s + n.total, 0);
      return annual.find((n) => n.year === latestYear && n.campus === filters.campus && n.metric === metric)?.total ?? 0;
    };
    const ftg = getTotal("FTG");
    const salv = getTotal("Salvation");
    const bap = getTotal("Baptism");
    const assim = data.assimilation.annual;
    const stewards = filters.campus === "All Campuses"
      ? assim.filter((a) => a.year === latestYear && a.category_clean === "New Stewards").reduce((s, a) => s + a.value, 0)
      : assim.find((a) => a.year === latestYear && a.campus === filters.campus && a.category_clean === "New Stewards")?.value ?? 0;

    return [
      { step: "First Time Guests", value: ftg, color: METRIC_COLORS.FTG },
      { step: "Salvations", value: salv, color: METRIC_COLORS.Salvation },
      { step: "Baptisms", value: bap, color: METRIC_COLORS.Baptism },
      { step: "New Stewards", value: stewards, color: METRIC_COLORS.Stewardship },
    ];
  }, [data, filters, latestYear]);

  const monthlyPattern = useMemo(() => {
    if (!data) return [];
    const monthly = data.next_steps.monthly;
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const row: Record<string, number | string> = { month: MONTH_NAMES[i] };
      ["FTG", "Salvation", "Baptism"].forEach((metric) => {
        const matches = monthly.filter((m) => m.year === latestYear && m.month === month && m.metric === metric && (filters.campus === "All Campuses" || m.campus === filters.campus));
        row[metric] = matches.reduce((s, m) => s + m.total, 0);
      });
      return row;
    });
  }, [data, filters, latestYear]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const annual = data.next_steps.annual;
    const getTotal = (y: number, metric: string) => {
      if (filters.campus === "All Campuses") return annual.filter((n) => n.year === y && n.metric === metric).reduce((s, n) => s + n.total, 0);
      return annual.find((n) => n.year === y && n.campus === filters.campus && n.metric === metric)?.total ?? 0;
    };
    return {
      ftg: getTotal(latestYear, "FTG"),
      ftgChange: getYoYChange(getTotal(latestYear, "FTG"), getTotal(latestYear - 1, "FTG")),
      salvations: getTotal(latestYear, "Salvation"),
      salvationsChange: getYoYChange(getTotal(latestYear, "Salvation"), getTotal(latestYear - 1, "Salvation")),
      baptisms: getTotal(latestYear, "Baptism"),
      baptismsChange: getYoYChange(getTotal(latestYear, "Baptism"), getTotal(latestYear - 1, "Baptism")),
    };
  }, [data, filters, latestYear]);

  if (!data || !kpis) return null;
  const maxFunnel = Math.max(...funnelData.map((f) => f.value), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="First Time Guests" value={formatNumber(kpis.ftg)} change={kpis.ftgChange} subtitle={`${latestYear} total`} borderColor={METRIC_COLORS.FTG} />
        <KpiCard label="Salvations" value={formatNumber(kpis.salvations)} change={kpis.salvationsChange} subtitle={`${latestYear} total`} borderColor={METRIC_COLORS.Salvation} />
        <KpiCard label="Baptisms" value={formatNumber(kpis.baptisms)} change={kpis.baptismsChange} subtitle={`${latestYear} total`} borderColor={METRIC_COLORS.Baptism} />
      </div>

      {/* Assimilation Funnel */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-1">Assimilation Funnel — {latestYear}</h3>
        <p className="text-[11px] text-muted-foreground mb-5">Tracking the journey from first visit to committed steward</p>
        <div className="space-y-2">
          {funnelData.map((step, i) => {
            const widthPct = maxFunnel > 0 ? (step.value / maxFunnel) * 100 : 0;
            const conversionRate = i > 0 && funnelData[i - 1].value > 0 ? ((step.value / funnelData[i - 1].value) * 100).toFixed(1) : null;
            return (
              <div key={step.step}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-1 pl-4">
                    <ArrowDown className="w-3 h-3 text-muted-foreground/40" />
                    {conversionRate && <span className="text-[10px] text-muted-foreground">{conversionRate}% conversion</span>}
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="w-32 text-right">
                    <span className="text-xs font-medium text-foreground/80">{step.step}</span>
                  </div>
                  <div className="flex-1 h-10 bg-muted/30 rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-700 flex items-center px-3"
                      style={{ width: `${Math.max(widthPct, 3)}%`, backgroundColor: step.color }}
                    >
                      <span className="stat-value text-sm text-white drop-shadow-sm">{formatNumber(step.value)}</span>
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
          <h3 className="section-title mb-4">Next Steps — Multi-Year Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={metricTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="FTG" stroke={METRIC_COLORS.FTG} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Salvation" stroke={METRIC_COLORS.Salvation} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Baptism" stroke={METRIC_COLORS.Baptism} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Monthly Pattern — {latestYear}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyPattern}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
              <Bar dataKey="FTG" fill={METRIC_COLORS.FTG} radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Salvation" fill={METRIC_COLORS.Salvation} radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Baptism" fill={METRIC_COLORS.Baptism} radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
