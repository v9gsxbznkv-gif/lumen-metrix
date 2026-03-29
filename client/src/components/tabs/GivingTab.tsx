import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatCurrency,
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
  ComposedChart,
  Area,
} from "recharts";

export default function GivingTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter(
      (y) => y >= filters.yearStart && y <= filters.yearEnd
    );
  }, [data, filters]);

  // Giving per capita trend
  const gpcTrend = useMemo(() => {
    if (!data) return [];
    const gpc = data.computed.giving_per_capita;
    return filteredYears.map((year) => {
      if (filters.campus === "All Campuses") {
        const match = gpc.find(
          (g) => g.year === year && g.campus === "All Campuses"
        );
        return {
          year,
          gpc: Math.round(match?.giving_per_capita ?? 0),
          weeklyGpc: Math.round(match?.weekly_gpc ?? 0),
          totalGiving: match?.total_giving ?? 0,
          avgAttendance: Math.round(match?.avg_attendance ?? 0),
        };
      }
      const match = gpc.find(
        (g) => g.year === year && g.campus === filters.campus
      );
      return {
        year,
        gpc: Math.round(match?.giving_per_capita ?? 0),
        weeklyGpc: Math.round(match?.weekly_gpc ?? 0),
        totalGiving: match?.total_giving ?? 0,
        avgAttendance: Math.round(match?.avg_attendance ?? 0),
      };
    });
  }, [data, filters, filteredYears]);

  // Campus giving comparison
  const campusGiving = useMemo(() => {
    if (!data) return [];
    const tithes = data.giving.tithes_annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["Canton", "Jasper"].forEach((c) => {
        const match = tithes.find((t) => t.year === year && t.campus === c);
        row[c] = match?.total ?? 0;
      });
      return row;
    });
  }, [data, filteredYears]);

  // Monthly giving pattern
  const monthlyGiving = useMemo(() => {
    if (!data) return [];
    const latestYear = filteredYears.filter((y) => y <= 2024).pop() ?? 2024;
    const monthly = data.giving.monthly;

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const matches = monthly.filter(
        (m) =>
          m.year === latestYear &&
          m.month === month &&
          m.subgroup === "Tithes and Offerings" &&
          (filters.campus === "All Campuses" || m.campus === filters.campus)
      );
      return {
        month: MONTH_NAMES[i],
        total: matches.reduce((s, m) => s + m.total, 0),
      };
    });
  }, [data, filters, filteredYears]);

  // Giving breakdown by type
  const givingByType = useMemo(() => {
    if (!data) return [];
    const annual = data.giving.annual;
    const latestYear = filteredYears.filter((y) => y <= 2024).pop() ?? 2024;

    const types = ["Tithes and Offerings", "Designated", "Advance Regular"];
    return types.map((type) => {
      const matches = annual.filter(
        (a) =>
          a.year === latestYear &&
          a.subgroup === type &&
          (filters.campus === "All Campuses" || a.campus === filters.campus)
      );
      return {
        type: type === "Tithes and Offerings" ? "Tithes" : type === "Advance Regular" ? "Advance" : type,
        total: matches.reduce((s, m) => s + m.total, 0),
      };
    }).filter((t) => t.total > 0);
  }, [data, filters, filteredYears]);

  // KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    const latestYear = filteredYears.filter((y) => y <= 2024).pop() ?? 2024;
    const priorYear = latestYear - 1;
    const gpc = data.computed.giving_per_capita;
    const tithes = data.giving.tithes_annual;

    const getGiving = (y: number) => {
      if (filters.campus === "All Campuses") {
        return tithes.find((t) => t.year === y && t.campus === "All Campuses")?.total ?? 0;
      }
      return tithes.find((t) => t.year === y && t.campus === filters.campus)?.total ?? 0;
    };

    const getGpc = (y: number) => {
      if (filters.campus === "All Campuses") {
        return gpc.find((g) => g.year === y && g.campus === "All Campuses")?.giving_per_capita ?? 0;
      }
      return gpc.find((g) => g.year === y && g.campus === filters.campus)?.giving_per_capita ?? 0;
    };

    const getWeeklyAvg = (y: number) => {
      if (filters.campus === "All Campuses") {
        return tithes.find((t) => t.year === y && t.campus === "All Campuses")?.avg_weekly ?? 0;
      }
      return tithes.find((t) => t.year === y && t.campus === filters.campus)?.avg_weekly ?? 0;
    };

    return {
      year: latestYear,
      totalGiving: getGiving(latestYear),
      givingChange: getYoYChange(getGiving(latestYear), getGiving(priorYear)),
      gpc: getGpc(latestYear),
      gpcChange: getYoYChange(getGpc(latestYear), getGpc(priorYear)),
      weeklyAvg: getWeeklyAvg(latestYear),
      weeklyChange: getYoYChange(getWeeklyAvg(latestYear), getWeeklyAvg(priorYear)),
    };
  }, [data, filters, filteredYears]);

  if (!data || !kpis) return null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Annual Tithes & Offerings"
          value={formatCurrency(kpis.totalGiving)}
          change={kpis.givingChange}
          subtitle={`${kpis.year} total`}
          borderColor={CAMPUS_COLORS[filters.campus]}
        />
        <KpiCard
          label="Giving Per Capita"
          value={formatCurrency(kpis.gpc)}
          change={kpis.gpcChange}
          subtitle={`~${formatCurrency(kpis.gpc / 52)}/week per person`}
        />
        <KpiCard
          label="Avg Weekly Giving"
          value={formatCurrency(kpis.weeklyAvg)}
          change={kpis.weeklyChange}
          subtitle={`${kpis.year} average`}
        />
      </div>

      {/* GPC Trend + Monthly Pattern */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Giving Per Capita — Annual Trend
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={gpcTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatNumber}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                formatter={(v: number, name: string) => {
                  if (name === "gpc") return [`$${v.toLocaleString()}`, "Per Capita"];
                  return [formatNumber(v), "Avg Attendance"];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="left"
                dataKey="gpc"
                name="Per Capita"
                fill={CAMPUS_COLORS[filters.campus]}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
                opacity={0.8}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgAttendance"
                name="Avg Attendance"
                stroke="#999"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Monthly Giving Pattern — {filteredYears.filter((y) => y <= 2024).pop() ?? 2024}
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyGiving}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, "Total"]}
              />
              <Bar dataKey="total" fill={CAMPUS_COLORS[filters.campus]} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campus Comparison */}
      {filters.campus === "All Campuses" && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Campus Giving Comparison — Annual Tithes
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={campusGiving}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e0" }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, ""]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="Canton" fill={CAMPUS_COLORS.Canton} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Jasper" fill={CAMPUS_COLORS.Jasper} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Giving by Type */}
      {givingByType.length > 0 && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Giving Breakdown by Type — {filteredYears.filter((y) => y <= 2024).pop() ?? 2024}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {givingByType.map((item) => (
              <div key={item.type} className="text-center p-4 bg-muted/40 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{item.type}</p>
                <p className="stat-value text-2xl">{formatCurrency(item.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
