/*
 * Lumen Metrix — Attendance Tab
 * Demographic breakdown, monthly patterns, kids environments
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
  getTotalAttendance,
  getAttendanceForMonths,
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
  Legend,
  LineChart,
  Line,
} from "recharts";

const SUBGROUP_COLORS: Record<string, string> = {
  Adults: "#4A7C59",
  Kids: "#E8913A",
  Students: "#4A7FB5",
  "Young Adults": "#8B6DAF",
};

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

function getSubgroupAvg(
  attendance: { year: number; campus: string; subgroup: string; avg_weekly: number }[],
  year: number,
  campus: string,
  subgroup: string
): number {
  if (campus === "All Campuses") {
    // Sum across all campuses (Canton + Jasper + Online)
    return attendance
      .filter((a) => a.year === year && a.subgroup === subgroup && a.campus !== "All Campuses")
      .reduce((s, m) => s + m.avg_weekly, 0);
  }
  return (
    attendance.find(
      (a) => a.year === year && a.campus === campus && a.subgroup === subgroup
    )?.avg_weekly ?? 0
  );
}

export default function AttendanceTab() {
  const ctx = useData();
  const data = ctx?.data;
  const filters = ctx?.filters || { campus: "All Campuses" };
  const latestYear = data?.meta?.years?.[data.meta.years.length - 1] ?? new Date().getFullYear();

  const demographicTrend = useMemo(() => {
    if (!data) return [];
    const years = data.attendance
      .filter((a) => a.subgroup === "Total" && a.campus === "All Campuses")
      .map((a) => a.year);
    const uniqueYears = Array.from(new Set(years)).sort((a, b) => a - b);

    return uniqueYears.map((year) => {
      const row: Record<string, number> = { year };
      ["Adults", "Kids", "Students"].forEach((sub) => {
        row[sub] = Math.round(getSubgroupAvg(data.attendance, year, "All Campuses", sub));
      });
      return row;
    });
  }, [data]);

  const monthlyPattern = useMemo(() => {
    if (!data) return [];
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return months.map((month) => {
      const row: Record<string, any> = { month: MONTH_NAMES[month - 1] };
      ["Adults", "Kids", "Students"].forEach((sub) => {
        if (filters.campus === "All Campuses") {
          row[sub] = Math.round(
            data.attendance_monthly
              .filter(
                (m) =>
                  m.year === latestYear &&
                  m.month === month &&
                  m.subgroup === sub &&
                  m.campus !== "All Campuses"
              )
              .reduce((s, m) => s + m.avg_weekly, 0)
          );
        } else {
          row[sub] = Math.round(
            data.attendance_monthly.find(
              (m) =>
                m.year === latestYear &&
                m.month === month &&
                m.campus === filters.campus &&
                m.subgroup === sub
            )?.avg_weekly ?? 0
          );
        }
      });
      return row;
    });
  }, [data, filters, latestYear]);

  const partial = useMemo(() => data ? isPartialYear(data, latestYear) : false, [data, latestYear]);
  const maxMonth = useMemo(() => data ? getMaxMonth(data, latestYear) : 12, [data, latestYear]);
  const compMonths = useMemo(() => Array.from({ length: maxMonth }, (_, i) => i + 1), [maxMonth]);

  // Canonical total attendance — uses getAttendanceForMonths which routes to
  // the pre-computed Total record for full years, and monthly sums for partial years.
  // This is the SAME function the Overview page uses, guaranteeing identical numbers.
  const totalKpi = useMemo(() => {
    if (!data) return { current: 0, prior: 0, change: undefined as ReturnType<typeof getYoYChange> | undefined };
    const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
    if (partial) {
      // Partial year: compare same months only
      const cur = getAttendanceForMonths(data, latestYear, filters.campus, compMonths);
      const prev = getAttendanceForMonths(data, latestYear - 1, filters.campus, compMonths);
      return {
        current: cur.avgWeekly,
        prior: prev.avgWeekly,
        change: getYoYChange(cur.avgWeekly, prev.avgWeekly),
      };
    }
    // Full year: getAttendanceForMonths uses pre-computed Total (same as Overview)
    const cur = getAttendanceForMonths(data, latestYear, filters.campus, allMonths);
    const prev = getAttendanceForMonths(data, latestYear - 1, filters.campus, allMonths);
    return {
      current: cur.avgWeekly,
      prior: prev.avgWeekly,
      change: getYoYChange(cur.avgWeekly, prev.avgWeekly),
    };
  }, [data, filters, latestYear, partial, compMonths]);

  const yoyComparison = useMemo(() => {
    if (!data) return [];
    return ["Adults", "Kids", "Students"].map((sub) => {
      const current = getSubgroupAvg(
        data.attendance,
        latestYear,
        filters.campus,
        sub
      );
      // For partial years, compare same months only
      if (partial) {
        const currMonthly = data.attendance_monthly
          .filter((m) => m.year === latestYear && compMonths.includes(m.month) && m.subgroup === sub)
          .filter((m) => filters.campus === "All Campuses" || m.campus === filters.campus)
          .reduce((s, m) => s + m.total, 0);
        const prevMonthly = data.attendance_monthly
          .filter((m) => m.year === latestYear - 1 && compMonths.includes(m.month) && m.subgroup === sub)
          .filter((m) => filters.campus === "All Campuses" || m.campus === filters.campus)
          .reduce((s, m) => s + m.total, 0);
        return {
          subgroup: sub,
          current: Math.round(current),
          prior: 0,
          change: getYoYChange(currMonthly, prevMonthly),
        };
      }
      const prior = getSubgroupAvg(
        data.attendance,
        latestYear - 1,
        filters.campus,
        sub
      );
      return {
        subgroup: sub,
        current: Math.round(current),
        prior: Math.round(prior),
        change: getYoYChange(current, prior),
      };
    });
  }, [data, filters, latestYear, partial, compMonths]);

  // Kids environments breakdown from attendance records with kids-specific subgroups
  // Organized by campus and age group for 2026+ data
  const kidsBreakdown = useMemo(() => {
    if (!data) return [];
    
    // All kids subgroups organized by campus and age group
    const kidsSubgroups = [
      // Canton Thursday RevKids
      { name: "Canton Nursery", subgroup: "Nursery" },
      { name: "Canton Toddlers", subgroup: "Toddlers" },
      { name: "Canton Pre-K", subgroup: "Pre-K" },
      { name: "Canton Elementary", subgroup: "Elementary" },
      
      // Sunday RevKids Preschool
      { name: "Sunday Babies", subgroup: "Babies" },
      { name: "Sunday Young Toddlers", subgroup: "Young Toddlers" },
      { name: "Sunday Older Toddlers", subgroup: "Older Toddlers" },
      { name: "Sunday Preschool Pre-K", subgroup: "Pre-K" },
      
      // Sunday RevKids Elementary
      { name: "The Campground", subgroup: "The Campground" },
      { name: "The Treehouse", subgroup: "The Treehouse" },
      { name: "The Cove", subgroup: "The Cove" },
      { name: "ReRuns", subgroup: "ReRuns" },
      
      // Jasper Preschool
      { name: "Jasper Nursery", subgroup: "Jasper Nursery" },
      { name: "Jasper Pre-K", subgroup: "Jasper Pre-K" },
      
      // Jasper Elementary
      { name: "Jasper Treehouse", subgroup: "Jasper Treehouse" },
      { name: "Jasper Cove", subgroup: "Jasper Cove" },
      { name: "Jasper ReRuns", subgroup: "Jasper ReRuns" },
    ];
    
    return kidsSubgroups.map((item) => {
      const avg = getSubgroupAvg(
        data.attendance,
        latestYear,
        filters.campus,
        item.subgroup
      );
      return { environment: item.name, subgroup: item.subgroup, avg: Math.round(avg) };
    });
  }, [data, filters, latestYear]);

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Total attendance — canonical figure matching Overview page */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Total Avg Weekly"
          value={formatNumber(totalKpi.current)}
          change={totalKpi.change}
          subtitle={partial ? `${latestYear} YTD vs same period ${latestYear - 1}` : `${latestYear} vs ${latestYear - 1} (${formatNumber(totalKpi.prior)})`}
          borderColor="#E8913A"
        />
        {yoyComparison.map((item) => (
          <KpiCard
            key={item.subgroup}
            label={`${item.subgroup} — Avg Weekly`}
            value={formatNumber(item.current)}
            change={item.change}
            subtitle={partial ? `${latestYear} YTD vs same period ${latestYear - 1}` : `${latestYear} vs ${latestYear - 1} (${formatNumber(item.prior)})`}
            borderColor={SUBGROUP_COLORS[item.subgroup]}
          />
        ))}
      </div>

      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Attendance by Demographic — Multi-Year Trend
        </h3>
        <ResponsiveContainer width="100%" height={220}>
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
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="95%"
                    stopColor={SUBGROUP_COLORS[key]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
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
            />
            <Tooltip contentStyle={TT} />
            <Legend
              wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
              iconType="circle"
              iconSize={8}
            />
            {["Adults", "Kids", "Students"].map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={SUBGROUP_COLORS[key]}
                strokeWidth={2}
                fill={`url(#att-grad-${key})`}
                dot={{ r: 3 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Monthly Pattern — {latestYear}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyPattern}>
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

      {/* Kids Breakdown Section */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Kids Breakdown — {latestYear} Avg
        </h3>
        <div className="space-y-3.5">
          {kidsBreakdown.length > 0 && kidsBreakdown.some((k) => k.avg > 0) ? (
            <div className="space-y-4">
              {/* Group by section */}
              {[
                { title: "Canton Thursday RevKids", items: kidsBreakdown.filter(k => ["Canton Nursery", "Canton Toddlers", "Canton Pre-K", "Canton Elementary"].includes(k.environment)) },
                { title: "Sunday RevKids Preschool", items: kidsBreakdown.filter(k => ["Sunday Babies", "Sunday Young Toddlers", "Sunday Older Toddlers", "Sunday Preschool Pre-K"].includes(k.environment)) },
                { title: "Sunday RevKids Elementary", items: kidsBreakdown.filter(k => ["The Campground", "The Treehouse", "The Cove", "ReRuns"].includes(k.environment)) },
                { title: "Jasper Preschool", items: kidsBreakdown.filter(k => ["Jasper Nursery", "Jasper Pre-K"].includes(k.environment)) },
                { title: "Jasper Elementary", items: kidsBreakdown.filter(k => ["Jasper Treehouse", "Jasper Cove", "Jasper ReRuns"].includes(k.environment)) },
              ].map((section) => section.items.length > 0 && (
                <div key={section.title}>
                  <h4 className="text-xs font-semibold text-foreground/70 mb-2.5 uppercase tracking-wide">{section.title}</h4>
                  <div className="space-y-2.5">
                    {section.items.map((env) => (
                      <div key={env.environment}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-foreground/80">
                            {env.environment}
                          </span>
                          <span className="stat-value text-sm">{env.avg}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(
                                100,
                                (env.avg /
                                  Math.max(...kidsBreakdown.map((k) => k.avg), 1)) *
                                  100
                              )}%`,
                              backgroundColor: "#E8913A",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Detailed kids data not available for this selection.
            </p>
          )}
        </div>
      </div>

      {/* Students Breakdown Section */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Students — {latestYear} Avg
        </h3>
        <div className="space-y-2.5">
          {["RevStudents | Canton Campus", "RevStudents | Jasper Campus"].map((subgroup) => {
            const avg = getSubgroupAvg(data.attendance, latestYear, filters.campus, subgroup);
            const cantonAvg = getSubgroupAvg(data.attendance, latestYear, filters.campus, "RevStudents | Canton Campus");
            const jasperAvg = getSubgroupAvg(data.attendance, latestYear, filters.campus, "RevStudents | Jasper Campus");
            const maxStudents = Math.max(cantonAvg, jasperAvg, 1);
            
            return avg > 0 ? (
              <div key={subgroup}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground/80">
                    {subgroup.replace(" | ", " — ")}
                  </span>
                  <span className="stat-value text-sm">{Math.round(avg)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (avg / maxStudents) * 100)}%`,
                      backgroundColor: "#4A7FB5",
                    }}
                  />
                </div>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Young Adults Section */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Young Adults — {latestYear} Avg
        </h3>
        <div className="space-y-2.5">
          {(() => {
            const avg = getSubgroupAvg(data.attendance, latestYear, filters.campus, "YA Gathering");
            return avg > 0 ? (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground/80">YA Gathering</span>
                  <span className="stat-value text-sm">{Math.round(avg)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: "100%",
                      backgroundColor: "#8B6DAF",
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No Young Adults data available.</p>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
