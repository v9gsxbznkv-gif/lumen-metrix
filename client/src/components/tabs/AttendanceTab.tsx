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

// Lookup avg_weekly from annual attendance table
function getSubgroupAvg(
  attendance: { year: number; campus: string; subgroup: string; avg_weekly: number }[],
  year: number,
  campus: string,
  subgroup: string
): number {
  if (campus === "All Campuses") {
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

// Lookup avg_weekly from monthly table for a given year (average across all months)
// Always filters by specific campus (not "All Campuses")
function getMonthlySubgroupAvgByCampus(
  monthly: { year: number; month: number; campus: string; subgroup: string; avg_weekly: number }[],
  year: number,
  campus: string,
  subgroup: string
): number {
  const rows = monthly.filter(
    (m) =>
      m.year === year &&
      m.subgroup === subgroup &&
      m.campus === campus
  );
  if (rows.length === 0) return 0;
  const total = rows.reduce((s, m) => s + m.avg_weekly, 0);
  return total / rows.length;
}

// Lookup avg_weekly from monthly table, respecting the global campus filter
function getMonthlySubgroupAvg(
  monthly: { year: number; month: number; campus: string; subgroup: string; avg_weekly: number }[],
  year: number,
  campus: string,
  subgroup: string
): number {
  const rows = monthly.filter(
    (m) =>
      m.year === year &&
      m.subgroup === subgroup &&
      (campus === "All Campuses" ? m.campus !== "All Campuses" : m.campus === campus)
  );
  if (rows.length === 0) return 0;
  const total = rows.reduce((s, m) => s + m.avg_weekly, 0);
  return total / rows.length;
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

  const totalKpi = useMemo(() => {
    if (!data) return { current: 0, prior: 0, change: undefined as ReturnType<typeof getYoYChange> | undefined };
    const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
    if (partial) {
      const cur = getAttendanceForMonths(data, latestYear, filters.campus, compMonths);
      const prev = getAttendanceForMonths(data, latestYear - 1, filters.campus, compMonths);
      return {
        current: cur.avgWeekly,
        prior: prev.avgWeekly,
        change: getYoYChange(cur.avgWeekly, prev.avgWeekly),
      };
    }
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
      const current = getSubgroupAvg(data.attendance, latestYear, filters.campus, sub);
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
      const prior = getSubgroupAvg(data.attendance, latestYear - 1, filters.campus, sub);
      return {
        subgroup: sub,
        current: Math.round(current),
        prior: Math.round(prior),
        change: getYoYChange(current, prior),
      };
    });
  }, [data, filters, latestYear, partial, compMonths]);

  // Kids room-level breakdown from attendance_monthly
  // Each section is tied to a SPECIFIC campus (Canton or Jasper), not the global filter
  // Uses exact DB subgroup names: Campground, Treehouse, Cove, Reruns, Babies, Toddlers, Pre-K
  const kidsBreakdown = useMemo(() => {
    if (!data) return [];

    // For 2026+, also check weekly data for new "Kids: Canton Nursery" style subgroups
    const hasWeeklyKidsData = data.attendance_weekly?.some(
      (w: any) => w.subgroup?.startsWith("Kids:") && w.year === latestYear
    );

    // Sections with exact DB subgroup names — each section has a fixed campus
    const sections = [
      {
        title: "Canton Thursday RevKids",
        campus: "Canton",
        items: [
          { label: "Nursery", subgroup: "Nursery", weeklySubgroup: "Kids: Canton Nursery" },
          { label: "Toddlers", subgroup: "Toddlers", weeklySubgroup: "Kids: Canton Toddlers" },
          { label: "Pre-K", subgroup: "Pre-K", weeklySubgroup: "Kids: Canton Pre-K" },
          { label: "Elementary", subgroup: "Elementary", weeklySubgroup: "Kids: Canton Elementary" },
        ],
      },
      {
        title: "Canton Sunday RevKids",
        campus: "Canton",
        items: [
          { label: "Babies", subgroup: "Babies", weeklySubgroup: "Kids: Canton Babies" },
          { label: "The Campground", subgroup: "Campground", weeklySubgroup: "Kids: Canton Campground" },
          { label: "The Treehouse", subgroup: "Treehouse", weeklySubgroup: "Kids: Canton Treehouse" },
          { label: "The Cove", subgroup: "Cove", weeklySubgroup: "Kids: Canton Cove" },
        ],
      },
      {
        title: "Jasper Preschool",
        campus: "Jasper",
        items: [
          { label: "Nursery", subgroup: "Nursery", weeklySubgroup: "Kids: Jasper Nursery" },
          { label: "Pre-K", subgroup: "Pre-K", weeklySubgroup: "Kids: Jasper Pre-K" },
        ],
      },
      {
        title: "Jasper Elementary",
        campus: "Jasper",
        items: [
          { label: "Treehouse", subgroup: "Treehouse", weeklySubgroup: "Kids: Jasper Treehouse" },
          { label: "Cove", subgroup: "Cove", weeklySubgroup: "Kids: Jasper Cove" },
          { label: "ReRuns", subgroup: "Reruns", weeklySubgroup: "Kids: Jasper Reruns" },
        ],
      },
    ];

    // If a specific campus is selected, only show sections for that campus
    const filteredSections = filters.campus === "All Campuses"
      ? sections
      : sections.filter((s) => s.campus === filters.campus);

    return filteredSections.map((section) => ({
      title: section.title,
      items: section.items.map((item) => {
        // Try monthly data first (historical spreadsheet data)
        let avg = Math.round(
          getMonthlySubgroupAvgByCampus(data.attendance_monthly, latestYear, section.campus, item.subgroup)
        );

        // If no monthly data and we have weekly kids data, try weekly subgroup names
        if (avg === 0 && hasWeeklyKidsData && data.attendance_weekly) {
          const weeklyRows = data.attendance_weekly.filter(
            (w: any) =>
              w.year === latestYear &&
              w.campus === section.campus &&
              w.subgroup === item.weeklySubgroup
          );
          if (weeklyRows.length > 0) {
            const totalHeadcount = weeklyRows.reduce((s: number, w: any) => s + (w.headcount || 0), 0);
            avg = Math.round(totalHeadcount / weeklyRows.length);
          }
        }

        return { label: item.label, avg };
      }),
    }));
  }, [data, filters, latestYear]);

  // Students breakdown — uses annual table with subgroup "Students" per campus
  const studentsBreakdown = useMemo(() => {
    if (!data) return [];

    const campuses = filters.campus === "All Campuses"
      ? ["Canton", "Jasper"]
      : [filters.campus];

    return campuses.map((campus) => ({
      label: `${campus} Campus`,
      avg: Math.round(getSubgroupAvg(data.attendance, latestYear, campus, "Students")),
    })).filter((item) => item.avg > 0);
  }, [data, filters, latestYear]);

  // Young Adults — annual table uses "Young Adults"
  const youngAdultsAvg = useMemo(() => {
    if (!data) return 0;
    // Try annual first
    const annual = getSubgroupAvg(data.attendance, latestYear, filters.campus, "Young Adults");
    if (annual > 0) return Math.round(annual);
    // Fall back to monthly average using "YA Gathering"
    return Math.round(getMonthlySubgroupAvg(data.attendance_monthly, latestYear, filters.campus, "YA Gathering"));
  }, [data, filters, latestYear]);

  if (!data) return null;

  // Compute max value across all kids items for proportional bars
  const allKidsAvgs = kidsBreakdown.flatMap((s) => s.items.map((i) => i.avg));
  const maxKidsAvg = Math.max(...allKidsAvgs, 1);
  const maxStudentsAvg = Math.max(...studentsBreakdown.map((s) => s.avg), 1);

  return (
    <div className="space-y-5">
      {/* Total attendance KPI cards */}
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

      {/* Multi-year demographic trend chart */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Attendance by Demographic — Multi-Year Trend
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={demographicTrend}>
            <defs>
              {["Adults", "Kids", "Students"].map((key) => (
                <linearGradient key={key} id={`att-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SUBGROUP_COLORS[key]} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={SUBGROUP_COLORS[key]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TT} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
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

      {/* Monthly pattern chart */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Monthly Pattern — {latestYear}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyPattern}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TT} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
            {["Adults", "Kids", "Students"].map((key) => (
              <Line key={key} type="monotone" dataKey={key} stroke={SUBGROUP_COLORS[key]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Kids Room-Level Breakdown */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Kids Breakdown — {latestYear} Avg
        </h3>
        <div className="space-y-4">
          {kidsBreakdown.some((s) => s.items.some((i) => i.avg > 0)) ? (
            kidsBreakdown.map((section) => {
              const visibleItems = section.items.filter((i) => i.avg > 0);
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.title}>
                  <h4 className="text-xs font-semibold text-foreground/70 mb-2.5 uppercase tracking-wide">
                    {section.title}
                  </h4>
                  <div className="space-y-2.5">
                    {visibleItems.map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-foreground/80">{item.label}</span>
                          <span className="stat-value text-sm">{item.avg}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (item.avg / maxKidsAvg) * 100)}%`,
                              backgroundColor: "#E8913A",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Detailed kids room data not available for this selection. Run a PCO sync to populate room-level data.
            </p>
          )}
        </div>
      </div>

      {/* Students Breakdown */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Students — {latestYear} Avg
        </h3>
        <div className="space-y-2.5">
          {studentsBreakdown.length > 0 ? (
            studentsBreakdown.map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground/80">{item.label}</span>
                  <span className="stat-value text-sm">{item.avg}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (item.avg / maxStudentsAvg) * 100)}%`,
                      backgroundColor: "#4A7FB5",
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No Students data available for this selection.
            </p>
          )}
        </div>
      </div>

      {/* Young Adults */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3 sm:mb-4">
          Young Adults — {latestYear} Avg
        </h3>
        <div className="space-y-2.5">
          {youngAdultsAvg > 0 ? (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground/80">YA Gathering</span>
                <span className="stat-value text-sm">{youngAdultsAvg}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: "100%", backgroundColor: "#8B6DAF" }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No Young Adults data available for this selection.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
