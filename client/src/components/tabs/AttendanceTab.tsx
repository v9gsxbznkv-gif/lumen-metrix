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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from "recharts";

const SUBGROUP_COLORS: Record<string, string> = {
  Adults: "#4a7c59",
  Kids: "#b5713a",
  Students: "#4a6fa5",
  "Young Adults": "#7c6daf",
  Total: "#333",
};

export default function AttendanceTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter(
      (y) => y >= filters.yearStart && y <= filters.yearEnd
    );
  }, [data, filters]);

  // Demographic breakdown by year
  const demographicTrend = useMemo(() => {
    if (!data) return [];
    const annual = data.attendance.annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["Adults", "Kids", "Students"].forEach((sub) => {
        if (filters.campus === "All Campuses") {
          const matches = annual.filter(
            (a) => a.year === year && a.subgroup === sub
          );
          row[sub] = Math.round(
            matches.reduce((s, m) => s + m.avg_weekly, 0)
          );
        } else {
          const match = annual.find(
            (a) =>
              a.year === year &&
              a.campus === filters.campus &&
              a.subgroup === sub
          );
          row[sub] = Math.round(match?.avg_weekly ?? 0);
        }
      });
      return row;
    });
  }, [data, filters, filteredYears]);

  // Monthly pattern for latest full year
  const monthlyPattern = useMemo(() => {
    if (!data) return [];
    const latestYear = filteredYears.filter((y) => y <= 2024).pop() ?? 2024;
    const monthly = data.attendance.monthly;

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const row: Record<string, number | string> = {
        month: MONTH_NAMES[i],
      };
      ["Adults", "Kids", "Students"].forEach((sub) => {
        if (filters.campus === "All Campuses") {
          const matches = monthly.filter(
            (m) =>
              m.year === latestYear && m.month === month && m.subgroup === sub
          );
          row[sub] = Math.round(
            matches.reduce((s, m) => s + m.avg_weekly, 0)
          );
        } else {
          const match = monthly.find(
            (m) =>
              m.year === latestYear &&
              m.month === month &&
              m.campus === filters.campus &&
              m.subgroup === sub
          );
          row[sub] = Math.round(match?.avg_weekly ?? 0);
        }
      });
      return row;
    });
  }, [data, filters, filteredYears]);

  // YoY comparison
  const yoyComparison = useMemo(() => {
    if (!data) return [];
    const annual = data.attendance.annual;
    const latestYear = filteredYears.filter((y) => y <= 2024).pop() ?? 2024;

    return ["Adults", "Kids", "Students"].map((sub) => {
      const getVal = (y: number) => {
        if (filters.campus === "All Campuses") {
          return annual
            .filter((a) => a.year === y && a.subgroup === sub)
            .reduce((s, m) => s + m.avg_weekly, 0);
        }
        return (
          annual.find(
            (a) =>
              a.year === y &&
              a.campus === filters.campus &&
              a.subgroup === sub
          )?.avg_weekly ?? 0
        );
      };
      const current = getVal(latestYear);
      const prior = getVal(latestYear - 1);
      return {
        subgroup: sub,
        current: Math.round(current),
        prior: Math.round(prior),
        change: getYoYChange(current, prior),
      };
    });
  }, [data, filters, filteredYears]);

  // Kids environment breakdown
  const kidsBreakdown = useMemo(() => {
    if (!data) return [];
    const weekly = data.attendance.weekly;
    const kidsEnvs = ["Babies", "Toddlers", "Pre-K", "Treehouse", "Cove"];
    const latestYear = filteredYears.filter((y) => y <= 2024).pop() ?? 2024;

    return kidsEnvs.map((env) => {
      const records = weekly.filter(
        (w) =>
          w.year === latestYear &&
          w.subgroup === env &&
          (filters.campus === "All Campuses" || w.campus === filters.campus)
      );
      const avg =
        records.length > 0
          ? records.reduce((s, r) => s + r.count, 0) / records.length
          : 0;
      return { environment: env, avg: Math.round(avg), count: records.length };
    });
  }, [data, filters, filteredYears]);

  if (!data) return null;

  const latestYear = filteredYears.filter((y) => y <= 2024).pop() ?? 2024;

  return (
    <div className="space-y-6">
      {/* YoY KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {yoyComparison.map((item) => (
          <KpiCard
            key={item.subgroup}
            label={`${item.subgroup} — Avg Weekly`}
            value={formatNumber(item.current)}
            change={item.change}
            subtitle={`${latestYear} vs ${latestYear - 1} (${formatNumber(item.prior)})`}
            borderColor={SUBGROUP_COLORS[item.subgroup]}
          />
        ))}
      </div>

      {/* Demographic Trend */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold font-[Outfit] mb-4">
          Attendance by Demographic — Multi-Year Trend
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={demographicTrend}>
            <defs>
              {["Adults", "Kids", "Students"].map((key) => (
                <linearGradient
                  key={key}
                  id={`att-grad-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={SUBGROUP_COLORS[key]}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor={SUBGROUP_COLORS[key]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            {["Adults", "Kids", "Students"].map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={SUBGROUP_COLORS[key]}
                fill={`url(#att-grad-${key})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Pattern + Kids Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Monthly Pattern — {latestYear}
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyPattern}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              {["Adults", "Kids", "Students"].map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={SUBGROUP_COLORS[key]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Kids Environments — {latestYear} Avg
          </h3>
          <div className="space-y-3">
            {kidsBreakdown.map((env) => (
              <div key={env.environment}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{env.environment}</span>
                  <span className="stat-value text-sm">{env.avg}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (env.avg / Math.max(...kidsBreakdown.map((k) => k.avg), 1)) * 100)}%`,
                      backgroundColor: CAMPUS_COLORS.Canton,
                    }}
                  />
                </div>
              </div>
            ))}
            {kidsBreakdown.every((k) => k.avg === 0) && (
              <p className="text-xs text-muted-foreground italic">
                Detailed kids environment data not available for this selection.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
