import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatNumber,
  getYoYChange,
  CAMPUS_COLORS,
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

const METRIC_COLORS: Record<string, string> = {
  FTG: "#4a7c59",
  Salvation: "#b5713a",
  Baptism: "#4a6fa5",
  Stewardship: "#7c6daf",
};

export default function NextStepsTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter(
      (y) => y >= filters.yearStart && y <= filters.yearEnd
    );
  }, [data, filters]);

  const latestYear = useMemo(
    () => filteredYears.filter((y) => y <= 2024).pop() ?? 2024,
    [filteredYears]
  );

  // Annual trend by metric
  const metricTrend = useMemo(() => {
    if (!data) return [];
    const annual = data.next_steps.annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["FTG", "Salvation", "Baptism"].forEach((metric) => {
        if (filters.campus === "All Campuses") {
          row[metric] = annual
            .filter((n) => n.year === year && n.metric === metric)
            .reduce((s, n) => s + n.total, 0);
        } else {
          row[metric] =
            annual.find(
              (n) =>
                n.year === year &&
                n.campus === filters.campus &&
                n.metric === metric
            )?.total ?? 0;
        }
      });
      return row;
    });
  }, [data, filters, filteredYears]);

  // Assimilation funnel for latest year
  const funnelData = useMemo(() => {
    if (!data) return [];
    const annual = data.next_steps.annual;

    const getTotal = (metric: string) => {
      if (filters.campus === "All Campuses") {
        return annual
          .filter((n) => n.year === latestYear && n.metric === metric)
          .reduce((s, n) => s + n.total, 0);
      }
      return (
        annual.find(
          (n) =>
            n.year === latestYear &&
            n.campus === filters.campus &&
            n.metric === metric
        )?.total ?? 0
      );
    };

    const ftg = getTotal("FTG");
    const salv = getTotal("Salvation");
    const bap = getTotal("Baptism");

    // Get stewardship from assimilation data
    const assim = data.assimilation.annual;
    const stewards = filters.campus === "All Campuses"
      ? assim
          .filter(
            (a) =>
              a.year === latestYear &&
              a.category_clean === "New Stewards"
          )
          .reduce((s, a) => s + a.value, 0)
      : assim.find(
          (a) =>
            a.year === latestYear &&
            a.campus === filters.campus &&
            a.category_clean === "New Stewards"
        )?.value ?? 0;

    return [
      { step: "First Time Guests", value: ftg, color: METRIC_COLORS.FTG },
      { step: "Salvations", value: salv, color: METRIC_COLORS.Salvation },
      { step: "Baptisms", value: bap, color: METRIC_COLORS.Baptism },
      { step: "New Stewards", value: stewards, color: METRIC_COLORS.Stewardship },
    ];
  }, [data, filters, latestYear]);

  // Monthly pattern
  const monthlyPattern = useMemo(() => {
    if (!data) return [];
    const monthly = data.next_steps.monthly;
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const row: Record<string, number | string> = { month: MONTH_NAMES[i] };
      ["FTG", "Salvation", "Baptism"].forEach((metric) => {
        const matches = monthly.filter(
          (m) =>
            m.year === latestYear &&
            m.month === month &&
            m.metric === metric &&
            (filters.campus === "All Campuses" || m.campus === filters.campus)
        );
        row[metric] = matches.reduce((s, m) => s + m.total, 0);
      });
      return row;
    });
  }, [data, filters, latestYear]);

  // KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    const annual = data.next_steps.annual;
    const getTotal = (y: number, metric: string) => {
      if (filters.campus === "All Campuses") {
        return annual
          .filter((n) => n.year === y && n.metric === metric)
          .reduce((s, n) => s + n.total, 0);
      }
      return (
        annual.find(
          (n) =>
            n.year === y &&
            n.campus === filters.campus &&
            n.metric === metric
        )?.total ?? 0
      );
    };

    return {
      ftg: getTotal(latestYear, "FTG"),
      ftgChange: getYoYChange(
        getTotal(latestYear, "FTG"),
        getTotal(latestYear - 1, "FTG")
      ),
      salvations: getTotal(latestYear, "Salvation"),
      salvationsChange: getYoYChange(
        getTotal(latestYear, "Salvation"),
        getTotal(latestYear - 1, "Salvation")
      ),
      baptisms: getTotal(latestYear, "Baptism"),
      baptismsChange: getYoYChange(
        getTotal(latestYear, "Baptism"),
        getTotal(latestYear - 1, "Baptism")
      ),
    };
  }, [data, filters, latestYear]);

  if (!data || !kpis) return null;

  const maxFunnel = Math.max(...funnelData.map((f) => f.value), 1);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="First Time Guests"
          value={formatNumber(kpis.ftg)}
          change={kpis.ftgChange}
          subtitle={`${latestYear} total`}
          borderColor={METRIC_COLORS.FTG}
        />
        <KpiCard
          label="Salvations"
          value={formatNumber(kpis.salvations)}
          change={kpis.salvationsChange}
          subtitle={`${latestYear} total`}
          borderColor={METRIC_COLORS.Salvation}
        />
        <KpiCard
          label="Baptisms"
          value={formatNumber(kpis.baptisms)}
          change={kpis.baptismsChange}
          subtitle={`${latestYear} total`}
          borderColor={METRIC_COLORS.Baptism}
        />
      </div>

      {/* Assimilation Funnel */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold font-[Outfit] mb-1">
          Assimilation Funnel — {latestYear}
        </h3>
        <p className="text-xs text-muted-foreground mb-5">
          FTG → Salvation → Baptism → Steward
        </p>
        <div className="space-y-3">
          {funnelData.map((step, i) => {
            const widthPct = maxFunnel > 0 ? (step.value / maxFunnel) * 100 : 0;
            const conversionRate =
              i > 0 && funnelData[i - 1].value > 0
                ? ((step.value / funnelData[i - 1].value) * 100).toFixed(1)
                : null;
            return (
              <div key={step.step}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{step.step}</span>
                  <div className="flex items-center gap-3">
                    {conversionRate && (
                      <span className="text-muted-foreground">
                        {conversionRate}% conversion
                      </span>
                    )}
                    <span className="stat-value text-base">
                      {formatNumber(step.value)}
                    </span>
                  </div>
                </div>
                <div className="h-8 bg-muted/40 rounded-md overflow-hidden relative">
                  <div
                    className="h-full rounded-md transition-all duration-700 flex items-center justify-end pr-3"
                    style={{
                      width: `${Math.max(widthPct, 2)}%`,
                      backgroundColor: step.color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend + Monthly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Next Steps — Multi-Year Trend
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={metricTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="FTG" stroke={METRIC_COLORS.FTG} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Salvation" stroke={METRIC_COLORS.Salvation} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Baptism" stroke={METRIC_COLORS.Baptism} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Monthly Pattern — {latestYear}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyPattern}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
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
