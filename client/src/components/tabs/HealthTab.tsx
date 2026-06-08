/*
 * Lumen Metrix — Health Metrics Tab
 * Health scores, volunteer ratios, serving breakdown, growth rates
 * Data: v3 flat structure
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { trpc } from "@/lib/trpc";
import {
  formatCurrency,
  formatNumber,
  getMaxWeek,
  getWeeklyYoYChange,
  getAvgAttendanceFromWeekly,
  getAvgAttendanceFromWeeklyRange,
  getGivingFromWeekly,
  getGivingFromWeeklyRange,
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
    // Build trend rows — use null (not undefined) so Recharts connectNulls works correctly.
    // Recharts needs actual null gaps, not undefined, to skip points while still connecting.
    return filteredYears.map((year) => {
      const row: Record<string, number | string | null> = { year };
      if (filters.campus === "All Campuses") {
        ["Canton", "Jasper"].forEach((c) => {
          const match = vr.find((v) => v.year === year && v.campus === c);
          row[c] = match && match.pct > 0 ? Math.round(match.pct * 1000) / 10 : null;
        });
      } else {
        const match = vr.find(
          (v) => v.year === year && v.campus === filters.campus
        );
        row[filters.campus] = match && match.pct > 0 ? Math.round(match.pct * 1000) / 10 : null;
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
      const maxWeek = getMaxWeek(data, year);
      const partial = maxWeek < 50;
      const campus = filters.campus;

      // Attendance: use weekly data for both years, capped to the same week range.
      // This is the same apples-to-apples pattern used in OverviewTab.
      const currAtt = Math.round(getAvgAttendanceFromWeekly(data, year, campus, "Total"));
      let prevAtt: number;
      if (i > 0) {
        const prevYear = filteredYears[i - 1];
        if (partial) {
          prevAtt = Math.round(getAvgAttendanceFromWeeklyRange(data, prevYear, campus, "Total", maxWeek));
        } else {
          prevAtt = Math.round(getAvgAttendanceFromWeekly(data, prevYear, campus, "Total"));
        }
      } else {
        prevAtt = 0;
      }

      // Giving: use weekly data for both years, capped to the same week range.
      let currGiv: number;
      let prevGiv: number;
      if (partial && i > 0) {
        currGiv = getGivingFromWeeklyRange(data, year, campus, maxWeek);
        prevGiv = getGivingFromWeeklyRange(data, filteredYears[i - 1], campus, maxWeek);
      } else {
        currGiv = getGivingFromWeekly(data, year, campus);
        prevGiv = i > 0 ? getGivingFromWeekly(data, filteredYears[i - 1], campus) : 0;
      }

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

    // Use weekly data for attendance growth — same apples-to-apples pattern as OverviewTab.
    const maxWeek = getMaxWeek(data, latestYear);
    const partial = maxWeek < 50;
    const campus = filters.campus;

    const currAttAvg = Math.round(getAvgAttendanceFromWeekly(data, latestYear, campus, "Total"));
    const prevAttAvg = partial
      ? Math.round(getAvgAttendanceFromWeeklyRange(data, latestYear - 1, campus, "Total", maxWeek))
      : Math.round(getAvgAttendanceFromWeekly(data, latestYear - 1, campus, "Total"));

    const attGrowth = prevAttAvg > 0 ? ((currAttAvg - prevAttAvg) / prevAttAvg) * 100 : 0;
    const currAtt = currAttAvg;

    const volMatch = vr.find(
      (v) => v.year === latestYear && v.campus === campus
    );
    // If no precomputed ratio, calculate from raw data as fallback
    let volRatio = 0;
    if (volMatch) {
      volRatio = volMatch.pct * 100;
    } else if (campus === "All Campuses") {
      const campusRows = data.serving.filter(
        (s) => s.year === latestYear && ["Canton", "Jasper"].includes(s.campus)
      );
      const totalVols = campusRows.reduce((sum, s) => sum + s.avg_weekly, 0);
      const allCampusAtt = data.attendance.find(
        (a) => a.year === latestYear && a.campus === "All Campuses" && a.subgroup === "Total"
      );
      if (totalVols > 0 && allCampusAtt && allCampusAtt.avg_weekly > 0) {
        volRatio = (totalVols / allCampusAtt.avg_weekly) * 100;
      }
    } else {
      const servingRow = data.serving.find(
        (s) => s.year === latestYear && s.campus === campus
      );
      const attRow = data.attendance.find(
        (a) => a.year === latestYear && a.campus === campus && a.subgroup === "Total"
      );
      if (servingRow && attRow && servingRow.avg_weekly > 0 && attRow.avg_weekly > 0) {
        volRatio = (servingRow.avg_weekly / attRow.avg_weekly) * 100;
      }
    }

    const gpcVal = 0; // placeholder — overridden by perCapitaGpc below

    // FTG: use monthly data for same-period comparison, summing individual campuses
    // when "All Campuses" is selected (no pre-aggregated All Campuses monthly row).
    const INDIVIDUAL_CAMPUSES = ["Canton", "Jasper", "Online"];
    // FTG: filter monthly data up to the current week (approximated as months up to maxWeek/4.33)
    const maxMonth = Math.ceil(maxWeek / 4.33);
    const compMonths = Array.from({ length: maxMonth }, (_, k) => k + 1);
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
    const weeks = partial ? maxWeek : 52;
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
        metric: "Volunteer-to-Attendee Ratio (%)",
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
        value: `$${Math.round(gpcVal)}/wk`,
        status:
          gpcVal > 60
            ? "excellent"
            : gpcVal > 40
              ? "good"
              : gpcVal > 30
                ? "caution"
                : "concern",
        benchmark: "National avg: $30/person/week",
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

  // Fetch per capita from DB pipeline (same source as Giving page) to ensure consistency
  const campusParam = filters.campus === "All Campuses" ? undefined : filters.campus;
  const perCapitaQuery = trpc.dataViews.giving.getPerCapita.useQuery(
    { year: latestYear, campus: campusParam },
    { enabled: !!data }
  );
  const perCapitaGpc = perCapitaQuery.data?.currentYearAvgGpc ?? 0;

  // Override the GPC card in healthScores with the DB-sourced value
  const healthScoresWithGpc = useMemo(() => {
    return healthScores.map((score) => {
      if (score.metric === "Giving Per Capita") {
        const val = perCapitaGpc;
        return {
          ...score,
          value: `$${Math.round(val)}/wk`,
          status:
            val > 60
              ? "excellent"
              : val > 40
                ? "good"
                : val > 30
                  ? "caution"
                  : ("concern" as string),
        };
      }
      return score;
    });
  }, [healthScores, perCapitaGpc]);

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Health Score Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {healthScoresWithGpc.map((score) => {
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
                domain={[0, 40]}
                ticks={[0, 10, 20, 30, 40]}
              />
              <Tooltip
                contentStyle={TT}
                formatter={(v: number) => [`${v.toFixed(1)}%`, ""]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
                iconType="circle"
                iconSize={8}
              />
              <Line
                type="monotone"
                dataKey="Canton"
                name="Canton"
                stroke={CAMPUS_COLORS.Canton}
                strokeWidth={2}
                dot={{ r: 4, fill: CAMPUS_COLORS.Canton }}
                activeDot={{ r: 6 }}
                connectNulls
                hide={filters.campus !== "All Campuses" && filters.campus !== "Canton"}
              />
              <Line
                type="monotone"
                dataKey="Jasper"
                name="Jasper"
                stroke={CAMPUS_COLORS.Jasper}
                strokeWidth={2}
                dot={{ r: 4, fill: CAMPUS_COLORS.Jasper }}
                activeDot={{ r: 6 }}
                connectNulls
                hide={filters.campus !== "All Campuses" && filters.campus !== "Jasper"}
              />
              <Line
                type="monotone"
                dataKey="Online"
                name="Online"
                stroke={CAMPUS_COLORS.Online ?? "#9B59B6"}
                strokeWidth={2}
                dot={{ r: 4, fill: CAMPUS_COLORS.Online ?? "#9B59B6" }}
                activeDot={{ r: 6 }}
                connectNulls
                hide={filters.campus !== "All Campuses" && filters.campus !== "Online"}
              />
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
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="section-title">Year-over-Year Growth Rate (%)</h3>
          {(() => {
            const mw = getMaxWeek(data, latestYear);
            return mw < 50 ? (
              <span className="text-[10px] text-muted-foreground italic">
                {latestYear} uses weeks 1–{mw} vs same weeks in {latestYear - 1}
              </span>
            ) : null;
          })()}
        </div>
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
