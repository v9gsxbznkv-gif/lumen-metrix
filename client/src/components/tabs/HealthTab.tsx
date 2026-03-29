import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatNumber,
  formatPercent,
  formatCurrency,
  getYoYChange,
  CAMPUS_COLORS,
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

export default function HealthTab() {
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

  // Volunteer-to-Attendee ratio trend
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
        const match = vr.find(
          (v) => v.year === year && v.campus === filters.campus
        );
        row[filters.campus] = match ? Math.round(match.pct * 10) / 10 : 0;
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // Serving breakdown by ministry
  const servingBreakdown = useMemo(() => {
    if (!data) return [];
    const annual = data.serving.annual;
    const ministries = [
      "RevKids",
      "Worship",
      "Production",
      "Host Team",
      "Welcome",
      "Welcome Team",
      "Students",
      "Campus Security",
      "Data Team",
      "Outreach",
      "Set Up/Tear Down",
    ];

    return ministries
      .map((ministry) => {
        const matches = annual.filter(
          (a) =>
            a.year === latestYear &&
            a.subgroup === ministry &&
            (filters.campus === "All Campuses" || a.campus === filters.campus)
        );
        const avg = matches.reduce((s, m) => s + m.avg_weekly, 0);
        return { ministry, avg: Math.round(avg) };
      })
      .filter((m) => m.avg > 0)
      .sort((a, b) => b.avg - a.avg);
  }, [data, filters, latestYear]);

  // Growth rate trend
  const growthTrend = useMemo(() => {
    if (!data) return [];
    const totals = data.attendance.total_annual;
    const tithes = data.giving.tithes_annual;

    return filteredYears.map((year, i) => {
      const getAtt = (y: number) => {
        if (filters.campus === "All Campuses") {
          return (
            totals.find((t) => t.year === y && t.campus === "All Campuses")
              ?.avg_weekly ?? 0
          );
        }
        return (
          totals.find((t) => t.year === y && t.campus === filters.campus)
            ?.avg_weekly ?? 0
        );
      };

      const getGiving = (y: number) => {
        if (filters.campus === "All Campuses") {
          return (
            tithes.find((t) => t.year === y && t.campus === "All Campuses")
              ?.total ?? 0
          );
        }
        return (
          tithes.find((t) => t.year === y && t.campus === filters.campus)
            ?.total ?? 0
        );
      };

      const currAtt = getAtt(year);
      const prevAtt = i > 0 ? getAtt(filteredYears[i - 1]) : 0;
      const currGiv = getGiving(year);
      const prevGiv = i > 0 ? getGiving(filteredYears[i - 1]) : 0;

      return {
        year,
        attGrowth:
          prevAtt > 0
            ? Math.round(((currAtt - prevAtt) / prevAtt) * 1000) / 10
            : 0,
        givGrowth:
          prevGiv > 0
            ? Math.round(((currGiv - prevGiv) / prevGiv) * 1000) / 10
            : 0,
      };
    });
  }, [data, filters, filteredYears]);

  // Health score card data
  const healthScores = useMemo(() => {
    if (!data) return [];
    const vr = data.computed.volunteer_ratio;
    const gpc = data.computed.giving_per_capita;
    const ns = data.next_steps.annual;
    const totals = data.attendance.total_annual;

    const getAtt = (y: number) => {
      if (filters.campus === "All Campuses") {
        return totals.find((t) => t.year === y && t.campus === "All Campuses")?.avg_weekly ?? 0;
      }
      return totals.find((t) => t.year === y && t.campus === filters.campus)?.avg_weekly ?? 0;
    };

    const currAtt = getAtt(latestYear);
    const prevAtt = getAtt(latestYear - 1);
    const attGrowth = prevAtt > 0 ? ((currAtt - prevAtt) / prevAtt) * 100 : 0;

    const volRatio =
      filters.campus === "All Campuses"
        ? vr
            .filter((v) => v.year === latestYear)
            .reduce((s, v) => s + v.avg_volunteers, 0) /
          Math.max(
            vr
              .filter((v) => v.year === latestYear)
              .reduce((s, v) => s + v.avg_attendance, 0),
            1
          ) *
          100
        : (vr.find(
            (v) => v.year === latestYear && v.campus === filters.campus
          )?.pct ?? 0);

    const gpcVal =
      filters.campus === "All Campuses"
        ? gpc.find((g) => g.year === latestYear && g.campus === "All Campuses")
            ?.giving_per_capita ?? 0
        : gpc.find(
            (g) => g.year === latestYear && g.campus === filters.campus
          )?.giving_per_capita ?? 0;

    const ftg =
      filters.campus === "All Campuses"
        ? ns
            .filter((n) => n.year === latestYear && n.metric === "FTG")
            .reduce((s, n) => s + n.total, 0)
        : ns.find(
            (n) =>
              n.year === latestYear &&
              n.campus === filters.campus &&
              n.metric === "FTG"
          )?.total ?? 0;

    const ftgPerWeek = ftg / 52;
    const ftgPct = currAtt > 0 ? (ftgPerWeek / currAtt) * 100 : 0;

    return [
      {
        metric: "Attendance Growth",
        value: `${attGrowth >= 0 ? "+" : ""}${attGrowth.toFixed(1)}%`,
        status: attGrowth > 5 ? "excellent" : attGrowth > 0 ? "good" : attGrowth > -5 ? "caution" : "concern",
        benchmark: "Target: 5-10% annual growth",
      },
      {
        metric: "Volunteer Ratio",
        value: `${volRatio.toFixed(1)}%`,
        status: volRatio > 20 ? "excellent" : volRatio > 15 ? "good" : volRatio > 10 ? "caution" : "concern",
        benchmark: "Healthy: 15-25% of attendees serving",
      },
      {
        metric: "Giving Per Capita",
        value: formatCurrency(gpcVal),
        status: gpcVal > 3000 ? "excellent" : gpcVal > 2000 ? "good" : gpcVal > 1000 ? "caution" : "concern",
        benchmark: "National avg: ~$2,000-$3,000/year",
      },
      {
        metric: "FTG Rate",
        value: `${ftgPct.toFixed(1)}%`,
        status: ftgPct > 5 ? "excellent" : ftgPct > 3 ? "good" : ftgPct > 1 ? "caution" : "concern",
        benchmark: "Healthy: 3-7% of weekly attendance",
      },
    ];
  }, [data, filters, latestYear]);

  if (!data) return null;

  const statusColors: Record<string, string> = {
    excellent: "#16a34a",
    good: "#4a7c59",
    caution: "#d97706",
    concern: "#dc2626",
  };

  const statusLabels: Record<string, string> = {
    excellent: "Excellent",
    good: "Good",
    caution: "Watch",
    concern: "Concern",
  };

  return (
    <div className="space-y-6">
      {/* Health Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {healthScores.map((score) => (
          <div
            key={score.metric}
            className="bg-card rounded-lg border border-border/60 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {score.metric}
              </p>
              <span
                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                style={{
                  color: statusColors[score.status],
                  backgroundColor: `${statusColors[score.status]}15`,
                }}
              >
                {statusLabels[score.status]}
              </span>
            </div>
            <p className="stat-value text-2xl mb-1">{score.value}</p>
            <p className="text-[10px] text-muted-foreground">{score.benchmark}</p>
          </div>
        ))}
      </div>

      {/* Volunteer Ratio Trend + Serving Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Volunteer-to-Attendee Ratio (%)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={volunteerTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e5e0",
                }}
                formatter={(v: number) => [`${v}%`, ""]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                iconType="circle"
                iconSize={8}
              />
              {filters.campus === "All Campuses" ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="Canton"
                    stroke={CAMPUS_COLORS.Canton}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Jasper"
                    stroke={CAMPUS_COLORS.Jasper}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </>
              ) : (
                <Line
                  type="monotone"
                  dataKey={filters.campus}
                  stroke={CAMPUS_COLORS[filters.campus]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4">
            Serving by Ministry — {latestYear} Avg Weekly
          </h3>
          <div className="space-y-2.5">
            {servingBreakdown.slice(0, 8).map((ministry) => {
              const maxVal = Math.max(
                ...servingBreakdown.map((m) => m.avg),
                1
              );
              return (
                <div key={ministry.ministry}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-medium">{ministry.ministry}</span>
                    <span className="stat-value text-sm">{ministry.avg}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(ministry.avg / maxVal) * 100}%`,
                        backgroundColor: CAMPUS_COLORS[filters.campus],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Growth Rate Trend */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
        <h3 className="text-sm font-semibold font-[Outfit] mb-4">
          Year-over-Year Growth Rate (%)
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={growthTrend.slice(1)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e5e5e0",
              }}
              formatter={(v: number, name: string) => [
                `${v}%`,
                name === "attGrowth" ? "Attendance" : "Giving",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) =>
                value === "attGrowth" ? "Attendance Growth" : "Giving Growth"
              }
            />
            <Bar
              dataKey="attGrowth"
              fill={CAMPUS_COLORS["All Campuses"]}
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
              opacity={0.7}
            />
            <Line
              type="monotone"
              dataKey="givGrowth"
              stroke={CAMPUS_COLORS.Canton}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
