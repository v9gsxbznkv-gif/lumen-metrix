/*
 * Lumen Metrix — Overview Tab
 * KPIs, attendance trend, giving trend, campus comparison
 * ALL data now computed from weekly tables (single source of truth from PCO)
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatCurrency,
  formatNumber,
  getYoYChange,
  getGivingFromWeekly,
  getGivingFromWeeklyRange,
  getAvgAttendanceFromWeekly,
  getAvgAttendanceFromWeeklyRange,
  getNextStepsFromWeekly,
  getNextStepsFromWeeklyRange,
  getNextStepsWithFallback,
  getNextStepsWithFallbackRange,
  getMaxWeek,
  getWeeklyYoYChange,
  getWeeklyGivingPerCapita,
  getWeeklyGivingPerCapitaRange,
  CAMPUS_COLORS,
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
} from "recharts";
import { Users, DollarSign, Heart, HandHelping, Baby, GraduationCap, Sparkles } from "lucide-react";

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter', sans-serif",
};

export default function OverviewTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter(
      (y) => y >= filters.yearStart && y <= filters.yearEnd
    );
  }, [data, filters]);

  // Attendance trend — from weekly data
  const attendanceTrend = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        row["All Campuses"] = Math.round(getAvgAttendanceFromWeekly(data, year, "All Campuses", "Total"));
      } else {
        row[filters.campus] = Math.round(getAvgAttendanceFromWeekly(data, year, filters.campus, "Total"));
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // Campus comparison — from weekly data
  const campusComparison = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["Canton", "Jasper"].forEach((c) => {
        row[c] = Math.round(getAvgAttendanceFromWeekly(data, year, c, "Total"));
      });
      return row;
    });
  }, [data, filteredYears]);

  // Giving trend — from weekly data
  const givingTrend = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      row.total = getGivingFromWeekly(data, year, filters.campus);
      return row;
    });
  }, [data, filters, filteredYears]);

  // KPIs — ALL from weekly data
  const kpis = useMemo(() => {
    if (!data) return null;
    const latestYear = filteredYears[filteredYears.length - 1] ?? 2026;
    const priorYear = latestYear - 1;
    const maxWeek = getMaxWeek(data, latestYear);
    const maxWeekFull = 52; // a full year
    const partial = maxWeek < 50; // if less than ~50 weeks, it's a partial year

    const campus = filters.campus;

    // --- Core KPIs from weekly ---
    const attendance = Math.round(getAvgAttendanceFromWeekly(data, latestYear, campus, "Total"));
    const giving = getGivingFromWeekly(data, latestYear, campus);

    // GPC: per person per week (avg weekly giving / avg weekly attendance)
    const gpc = getWeeklyGivingPerCapita(data, latestYear, campus);

    // Next steps from weekly
    const ftg = getNextStepsFromWeekly(data, latestYear, campus, "FTG");
    const salvations = getNextStepsFromWeekly(data, latestYear, campus, "Salvations");
    const baptisms = getNextStepsWithFallback(data, latestYear, campus, "Baptisms");

    // Subgroup attendance from weekly
    const kids = Math.round(getAvgAttendanceFromWeekly(data, latestYear, campus, "Kids"));
    const students = Math.round(getAvgAttendanceFromWeekly(data, latestYear, campus, "Students"));
    const youngAdults = Math.round(getAvgAttendanceFromWeekly(data, latestYear, campus, "Young Adults"));

    // Kids % and Students % of total weekend attendance (including kids)
    const kidsPercent = attendance > 0 ? (kids / attendance) * 100 : 0;
    const studentsPercent = attendance > 0 ? (students / attendance) * 100 : 0;

    // --- YoY changes (week-based for partial years) ---
    const attChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getAvgAttendanceFromWeeklyRange(data, y, campus, "Total", mw)
        )
      : getYoYChange(attendance, Math.round(getAvgAttendanceFromWeekly(data, priorYear, campus, "Total")));

    const givChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getGivingFromWeeklyRange(data, y, campus, mw)
        )
      : getYoYChange(giving, getGivingFromWeekly(data, priorYear, campus));

    const gpcChange = partial
      ? (() => {
          const currGpc = getWeeklyGivingPerCapitaRange(data, latestYear, campus, maxWeek);
          const prevGpc = getWeeklyGivingPerCapitaRange(data, priorYear, campus, maxWeek);
          return getYoYChange(currGpc, prevGpc);
        })()
      : (() => {
          const prevGpc = getWeeklyGivingPerCapita(data, priorYear, campus);
          return getYoYChange(gpc, prevGpc);
        })();

    const ftgChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getNextStepsFromWeeklyRange(data, y, campus, "FTG", mw)
        )
      : getYoYChange(ftg, getNextStepsFromWeekly(data, priorYear, campus, "FTG"));

    const salvChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getNextStepsFromWeeklyRange(data, y, campus, "Salvations", mw)
        )
      : getYoYChange(salvations, getNextStepsFromWeekly(data, priorYear, campus, "Salvations"));

    const bapChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getNextStepsWithFallbackRange(data, y, campus, "Baptisms", mw)
        )
      : getYoYChange(baptisms, getNextStepsWithFallback(data, priorYear, campus, "Baptisms"));

    const kidsChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getAvgAttendanceFromWeeklyRange(data, y, campus, "Kids", mw)
        )
      : getYoYChange(kids, Math.round(getAvgAttendanceFromWeekly(data, priorYear, campus, "Kids")));

    const studentsChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getAvgAttendanceFromWeeklyRange(data, y, campus, "Students", mw)
        )
      : getYoYChange(students, Math.round(getAvgAttendanceFromWeekly(data, priorYear, campus, "Students")));

    const yaChange = partial
      ? getWeeklyYoYChange(data, latestYear, priorYear, (y, mw) =>
          getAvgAttendanceFromWeeklyRange(data, y, campus, "Young Adults", mw)
        )
      : getYoYChange(youngAdults, Math.round(getAvgAttendanceFromWeekly(data, priorYear, campus, "Young Adults")));

    // Week label for partial year
    const weekLabel = partial ? `Weeks 1–${maxWeek}` : "";

    return {
      year: latestYear,
      partial,
      weekLabel,
      attendance,
      attendanceChange: attChange,
      giving,
      givingChange: givChange,
      gpc,
      gpcChange,
      ftg,
      ftgChange,
      salvations,
      salvationsChange: salvChange,
      baptisms,
      baptismsChange: bapChange,
      kids,
      kidsChange,
      kidsPercent,
      students,
      studentsChange,
      studentsPercent,
      youngAdults,
      youngAdultsChange: yaChange,
    };
  }, [data, filters, filteredYears]);

  if (!data || !kpis) return null;

  const campusKeys =
    filters.campus === "All Campuses" ? ["All Campuses"] : [filters.campus];

  const ytdLabel = kpis.partial ? `${kpis.year} YTD` : `${kpis.year}`;
  const vsLabel = kpis.partial
    ? `vs ${kpis.weekLabel} ${kpis.year - 1}`
    : "vs prior year";

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Avg Weekly Attendance"
          value={formatNumber(kpis.attendance)}
          change={{ ...kpis.attendanceChange, label: `${kpis.attendanceChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<Users className="w-5 h-5" />}
          borderColor={CAMPUS_COLORS[filters.campus]}
        />
        <KpiCard
          label="Annual Tithes"
          value={formatCurrency(kpis.giving)}
          change={{ ...kpis.givingChange, label: `${kpis.givingChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<DollarSign className="w-5 h-5" />}
          borderColor={CAMPUS_COLORS[filters.campus]}
        />
        <KpiCard
          label="Giving Per Capita"
          value={`$${Math.round(kpis.gpc)}`}
          change={{ ...kpis.gpcChange, label: `${kpis.gpcChange.label} ${vsLabel}` }}
          subtitle="Per person per week"
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          label="First Time Guests"
          value={formatNumber(kpis.ftg)}
          change={{ ...kpis.ftgChange, label: `${kpis.ftgChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<Heart className="w-5 h-5" />}
        />
        <KpiCard
          label="Salvations"
          value={formatNumber(kpis.salvations)}
          change={{ ...kpis.salvationsChange, label: `${kpis.salvationsChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<Heart className="w-5 h-5" />}
        />
        <KpiCard
          label="Baptisms"
          value={formatNumber(kpis.baptisms)}
          change={{ ...kpis.baptismsChange, label: `${kpis.baptismsChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<HandHelping className="w-5 h-5" />}
        />
      </div>

      {/* Kids, Students & Young Adults KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Avg Weekly Kids"
          value={formatNumber(kpis.kids)}
          change={{ ...kpis.kidsChange, label: `${kpis.kidsChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<Baby className="w-5 h-5" />}
          borderColor="#E8913A"
        />
        <div
          className="bg-card rounded-lg p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border/60 transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
          style={{ borderLeft: "3px solid #E8913A" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="micro-label text-muted-foreground mb-2">Kids % of Total</p>
              <p className="stat-value text-[1.75rem] text-card-foreground leading-none">
                {kpis.kidsPercent.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Benchmark: 30%
              </p>
            </div>
            <Baby className="w-5 h-5 text-muted-foreground/30 shrink-0" />
          </div>
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/40">
            <div className="flex-1 h-2 rounded-full bg-border/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(kpis.kidsPercent / 30 * 100, 100)}%`,
                  backgroundColor: kpis.kidsPercent >= 30 ? "#4A7C59" : kpis.kidsPercent >= 20 ? "#D4A843" : "#C45B4A",
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
              {kpis.kidsPercent >= 30 ? "At/Above" : kpis.kidsPercent >= 20 ? "Near" : "Below"} benchmark
            </span>
          </div>
        </div>
        <KpiCard
          label="Avg Weekly Students"
          value={formatNumber(kpis.students)}
          change={{ ...kpis.studentsChange, label: `${kpis.studentsChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<GraduationCap className="w-5 h-5" />}
          borderColor="#4A7FB5"
        />
        <div
          className="bg-card rounded-lg p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border/60 transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
          style={{ borderLeft: "3px solid #4A7FB5" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="micro-label text-muted-foreground mb-2">Students % of Total</p>
              <p className="stat-value text-[1.75rem] text-card-foreground leading-none">
                {kpis.studentsPercent.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Benchmark: 10%
              </p>
            </div>
            <GraduationCap className="w-5 h-5 text-muted-foreground/30 shrink-0" />
          </div>
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/40">
            <div className="flex-1 h-2 rounded-full bg-border/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(kpis.studentsPercent / 10 * 100, 100)}%`,
                  backgroundColor: kpis.studentsPercent >= 10 ? "#4A7C59" : kpis.studentsPercent >= 7 ? "#D4A843" : "#C45B4A",
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
              {kpis.studentsPercent >= 10 ? "At/Above" : kpis.studentsPercent >= 7 ? "Near" : "Below"} benchmark
            </span>
          </div>
        </div>
      </div>

      {/* Young Adults */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Avg Weekly Young Adults"
          value={formatNumber(kpis.youngAdults)}
          change={{ ...kpis.youngAdultsChange, label: `${kpis.youngAdultsChange.label} ${vsLabel}` }}
          subtitle={ytdLabel}
          icon={<Sparkles className="w-5 h-5" />}
          borderColor="#7C5CBF"
        />
      </div>

      {/* Partial year notice */}
      {kpis.partial && (
        <div className="px-4 py-2.5 rounded-lg border border-[#D4A843]/30 bg-[#D4A843]/5 text-xs text-[#8B6914]">
          <strong>{kpis.year} is a partial year</strong> ({kpis.weekLabel}). YoY comparisons use the same weeks from {kpis.year - 1} for an apples-to-apples comparison. Annual totals in charts reflect YTD only.
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Attendance Trend */}
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3 sm:mb-4 text-card-foreground">
            Average Weekly Attendance
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={attendanceTrend}>
              <defs>
                {campusKeys.map((key) => (
                  <linearGradient
                    key={key}
                    id={`grad-${key.replace(/\s/g, "")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={CAMPUS_COLORS[key]}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor={CAMPUS_COLORS[key]}
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
                tickFormatter={formatNumber}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [formatNumber(v), "Avg Weekly"]}
              />
              {campusKeys.map((key) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CAMPUS_COLORS[key]}
                  fill={`url(#grad-${key.replace(/\s/g, "")})`}
                  strokeWidth={2.5}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Giving Trend */}
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3 sm:mb-4 text-card-foreground">
            Annual Tithes & Offerings
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={givingTrend}>
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
                tickFormatter={formatCurrency}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [
                  `$${v.toLocaleString()}`,
                  "Tithes & Offerings",
                ]}
              />
              <Bar
                dataKey="total"
                fill={CAMPUS_COLORS[filters.campus]}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campus Comparison */}
      {filters.campus === "All Campuses" && (
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3 sm:mb-4 text-card-foreground">
            Campus Attendance Comparison — Avg Weekly
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={campusComparison}>
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
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend
                wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="Canton"
                fill={CAMPUS_COLORS.Canton}
                radius={[3, 3, 0, 0]}
                maxBarSize={24}
              />
              <Bar
                dataKey="Jasper"
                fill={CAMPUS_COLORS.Jasper}
                radius={[3, 3, 0, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
