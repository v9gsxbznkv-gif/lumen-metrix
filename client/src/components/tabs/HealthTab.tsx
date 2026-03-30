/*
 * Lumen Metrix — Health Metrics Tab
 * Health scores, volunteer ratios, serving breakdown, growth rates
 * Data: v3 flat structure
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import {
  formatCurrency,
  formatNumber,
  isPartialYear,
  getMaxMonth,
  getAttendanceForMonths,
  getGivingForMonths,
  getNextStepsForMonths,
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
} from "recharts";
import { CheckCircle, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; icon: React.ElementType; label: string }
> = {
  excellent: {
    color: "#4A7C59",
    bg: "rgba(74,124,89,0.08)",
    icon: Sparkles,
    label: "Excellent",
  },
  good: {
    color: "#4A7FB5",
    bg: "rgba(74,127,181,0.08)",
    icon: CheckCircle,
    label: "Good",
  },
  caution: {
    color: "#D4A843",
    bg: "rgba(212,168,67,0.08)",
    icon: AlertTriangle,
    label: "Watch",
  },
  concern: {
    color: "#C45B4A",
    bg: "rgba(196,91,74,0.08)",
    icon: AlertCircle,
    label: "Concern",
  },
};

function getAttAvg(
  attendance: { year: number; campus: string; subgroup: string; avg_weekly: number }[],
  year: number,
  campus: string
): number {
  if (campus === "All Campuses") {
    return (
      attendance.find(
        (a) => a.year === year && a.campus === "All Campuses" && a.subgroup === "Total"
      )?.avg_weekly ?? 0
    );
  }
  return (
    attendance.find(
      (a) => a.year === year && a.campus === campus && a.subgroup === "Total"
    )?.avg_weekly ?? 0
  );
}

function getGivTotal(
  giving: { year: number; campus: string; total: number }[],
  year: number,
  campus: string
): number {
  if (campus === "All Campuses") {
    return giving.find((g) => g.year === year && g.campus === "All Campuses")?.total ?? 0;
  }
  return giving.find((g) => g.year === year && g.campus === campus)?.total ?? 0;
}

export default function HealthTab() {
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

  const volunteerTrend = useMemo(() => {
    if (!data) return [];
    const vr = data.computed.volunteer_ratio;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        ["Canton", "Jasper"].forEach((c) => {
          const match = vr.find((v) => v.year === year && v.campus === c);
          row[c] = match ? Math.round(match.pct * 1000) / 10 : 0;
        });
      } else {
        const match = vr.find(
          (v) => v.year === year && v.campus === filters.campus
        );
        row[filters.campus] = match ? Math.round(match.pct * 1000) / 10 : 0;
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // Serving breakdown — sum Canton + Jasper when All Campuses is selected
  // (the pre-aggregated All Campuses row was excluded from the DB query to avoid double-counting)
  const servingInfo = useMemo(() => {
    if (!data) return null;
    if (filters.campus === "All Campuses") {
      const campusRows = data.serving.filter(
        (s) => s.year === latestYear && ["Canton", "Jasper"].includes(s.campus)
      );
      if (campusRows.length === 0) return null;
      return {
        avg_weekly: campusRows.reduce((sum, s) => sum + s.avg_weekly, 0),
        total: campusRows.reduce((sum, s) => sum + s.total, 0),
      };
    }
    const match = data.serving.find(
      (s) => s.year === latestYear && s.campus === filters.campus
    );
    return match ? { avg_weekly: match.avg_weekly, total: match.total } : null;
  }, [data, filters, latestYear]);

  const growthTrend = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year, i) => {
      const currAtt = getAttAvg(data.attendance, year, filters.campus);
      const prevAtt =
        i > 0
          ? getAttAvg(data.attendance, filteredYears[i - 1], filters.campus)
          : 0;
      const currGiv = getGivTotal(data.giving, year, filters.campus);
      const prevGiv =
        i > 0
          ? getGivTotal(data.giving, filteredYears[i - 1], filters.campus)
          : 0;
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

  const healthScores = useMemo(() => {
    if (!data) return [];
    const vr = data.computed.volunteer_ratio;
    const gpc = data.computed.giving_per_capita;

    const partial = isPartialYear(data, latestYear);
    const maxMonth = getMaxMonth(data, latestYear);
    const compMonths = Array.from({ length: maxMonth }, (_, i) => i + 1);

    // Partial-year-aware growth: compare avg_weekly (YTD average) for same period.
    // The annual row's avg_weekly already represents the YTD average for partial years,
    // so comparing avg_weekly directly is an apples-to-apples same-period comparison.
    // For the prior year, we use the same-period avg_weekly from monthly data.
    const currAttAvg = getAttAvg(data.attendance, latestYear, filters.campus);
    let prevAttAvg: number;
    if (partial) {
      // Sum monthly totals for same months in prior year, then derive avg_weekly
      const priorMonthly = getAttendanceForMonths(data, latestYear - 1, filters.campus, compMonths);
      prevAttAvg = priorMonthly.avgWeekly;
    } else {
      prevAttAvg = getAttAvg(data.attendance, latestYear - 1, filters.campus);
    }
    const attGrowth = prevAttAvg > 0 ? ((currAttAvg - prevAttAvg) / prevAttAvg) * 100 : 0;
    const currAtt = currAttAvg;

    const campus =
      filters.campus === "All Campuses" ? "All Campuses" : filters.campus;

    const volMatch = vr.find(
      (v) => v.year === latestYear && v.campus === campus
    );
    const volRatio = volMatch ? volMatch.pct * 100 : 0;

    const gpcVal =
      gpc.find((g) => g.year === latestYear && g.campus === campus)
        ?.giving_per_capita ?? 0;

    // FTG: use monthly data for same-period comparison, summing individual campuses
    // when "All Campuses" is selected (no pre-aggregated All Campuses monthly row).
    const INDIVIDUAL_CAMPUSES = ["Canton", "Jasper", "Online"];
    const ftgMonthly = data.next_steps_monthly.filter(
      (n) =>
        n.year === latestYear &&
        n.metric === "FTG" &&
        compMonths.includes(n.month) &&
        (campus === "All Campuses" ? INDIVIDUAL_CAMPUSES.includes(n.campus) : n.campus === campus)
    );
    // Fall back to annual total if no monthly data
    let ftg: number;
    if (ftgMonthly.length > 0) {
      ftg = ftgMonthly.reduce((s, n) => s + n.count, 0);
    } else {
      ftg = data.next_steps
        .filter(
          (n) =>
            n.year === latestYear &&
            n.metric === "FTG" &&
            (campus === "All Campuses"
              ? INDIVIDUAL_CAMPUSES.includes(n.campus)
              : n.campus === campus)
        )
        .reduce((s, n) => s + n.total, 0);
    }
    const weeks = partial ? Math.round(maxMonth * 4.33) : 52;
    const ftgPerWeek = ftg / weeks;
    const ftgPct = currAtt > 0 ? (ftgPerWeek / currAtt) * 100 : 0;

    return [
      {
        metric: "Attendance Growth",
        value: `${attGrowth >= 0 ? "+" : ""}${attGrowth.toFixed(1)}%`,
        status:
          attGrowth > 5
            ? "excellent"
            : attGrowth > 0
              ? "good"
              : attGrowth > -5
                ? "caution"
                : "concern",
        benchmark: "Target: 5-10% annual growth",
      },
      {
        metric: "Volunteer Ratio",
        value: `${volRatio.toFixed(1)}%`,
        status:
          volRatio > 20
            ? "excellent"
            : volRatio > 15
              ? "good"
              : volRatio > 10
                ? "caution"
                : "concern",
        benchmark: "Healthy: 15-25% of attendees serving",
      },
      {
        metric: "Giving Per Capita",
        value: formatCurrency(gpcVal),
        status:
          gpcVal > 3000
            ? "excellent"
            : gpcVal > 2000
              ? "good"
              : gpcVal > 1000
                ? "caution"
                : "concern",
        benchmark: "National avg: ~$2,000-$3,000/year",
      },
      {
        metric: "FTG Rate",
        value: `${ftgPct.toFixed(1)}%`,
        status:
          ftgPct > 5
            ? "excellent"
            : ftgPct > 3
              ? "good"
              : ftgPct > 1
                ? "caution"
                : "concern",
        benchmark: "Healthy: 3-7% of weekly attendance",
      },
    ];
  }, [data, filters, latestYear]);

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Health Score Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {healthScores.map((score) => {
          const config = STATUS_CONFIG[score.status];
          const Icon = config.icon;
          return (
            <div
              key={score.metric}
              className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center justify-between mb-2.5">
                <p className="micro-label text-muted-foreground">
                  {score.metric}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 micro-label"
                  style={{ color: config.color, backgroundColor: config.bg }}
                >
                  <Icon className="w-3 h-3" />
                  {config.label}
                </span>
              </div>
              <p className="stat-value text-2xl mb-1.5">{score.value}</p>
              <p className="text-[10px] text-muted-foreground">
                {score.benchmark}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3 sm:mb-4">
            Volunteer-to-Attendee Ratio (%)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={volunteerTrend}>
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
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={TT}
                formatter={(v: number) => [`${v}%`, ""]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
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

        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3 sm:mb-4">
            Serving Summary — {latestYear}
          </h3>
          {servingInfo ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="text-center p-4 sm:p-5 bg-muted/40 rounded-lg">
                  <p className="micro-label text-muted-foreground mb-1.5">
                    Avg Weekly Volunteers
                  </p>
                  <p className="stat-value text-2xl">
                    {formatNumber(servingInfo.avg_weekly)}
                  </p>
                </div>
                <div className="text-center p-4 sm:p-5 bg-muted/40 rounded-lg">
                  <p className="micro-label text-muted-foreground mb-1.5">
                    Total Volunteer Instances
                  </p>
                  <p className="stat-value text-2xl">
                    {formatNumber(servingInfo.total)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Detailed ministry-level breakdown requires serving subgroup data
                in the source sheets.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No serving data available for this selection.
            </p>
          )}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">Year-over-Year Growth Rate (%)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={growthTrend.slice(1)}>
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
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={TT}
              formatter={(v: number, name: string) => [
                `${v}%`,
                name === "attGrowth" ? "Attendance" : "Giving",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
              formatter={(value: string) =>
                value === "attGrowth" ? "Attendance Growth" : "Giving Growth"
              }
            />
            <Bar
              dataKey="attGrowth"
              fill="#E8913A"
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
              opacity={0.75}
            />
            <Line
              type="monotone"
              dataKey="givGrowth"
              stroke="#4A7FB5"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
