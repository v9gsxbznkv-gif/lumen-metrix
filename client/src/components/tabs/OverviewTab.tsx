/*
 * Lumen Metrix — Overview Tab
 * KPIs, attendance trend, giving trend, campus comparison
 * Data: v3 flat structure from raw campus tabs
 * Partial-year-aware: compares Q1 2026 vs Q1 2025 (not full year)
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatCurrency,
  formatNumber,
  getYoYChange,
  isPartialYear,
  getMaxMonth,
  getAttendanceForMonths,
  getGivingForMonths,
  getNextStepsForMonths,
  getPartialYoYChange,
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
} from "recharts";
import { Users, DollarSign, Heart, HandHelping } from "lucide-react";

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter', sans-serif",
};

// Helper: get attendance avg_weekly for a year/campus from the flat array
function getAttendance(
  data: { year: number; campus: string; subgroup: string; avg_weekly: number }[],
  year: number,
  campus: string
): number {
  if (campus === "All Campuses") {
    const all = data.find(
      (r) => r.year === year && r.campus === "All Campuses" && r.subgroup === "Total"
    );
    return all?.avg_weekly ?? 0;
  }
  const c = data.find(
    (r) => r.year === year && r.campus === campus && r.subgroup === "Total"
  );
  return c?.avg_weekly ?? 0;
}

// Helper: get giving total for a year/campus
function getGiving(
  data: { year: number; campus: string; total: number }[],
  year: number,
  campus: string
): number {
  if (campus === "All Campuses") {
    const all = data.find((r) => r.year === year && r.campus === "All Campuses");
    return all?.total ?? 0;
  }
  return data.find((r) => r.year === year && r.campus === campus)?.total ?? 0;
}

export default function OverviewTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter(
      (y) => y >= filters.yearStart && y <= filters.yearEnd
    );
  }, [data, filters]);

  // Attendance trend
  const attendanceTrend = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        row["All Campuses"] = getAttendance(data.attendance, year, "All Campuses");
      } else {
        row[filters.campus] = getAttendance(data.attendance, year, filters.campus);
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // Campus comparison
  const campusComparison = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["Canton", "Jasper", "Online"].forEach((c) => {
        row[c] = getAttendance(data.attendance, year, c);
      });
      return row;
    });
  }, [data, filteredYears]);

  // Giving trend
  const givingTrend = useMemo(() => {
    if (!data) return [];
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      row.total = getGiving(data.giving, year, filters.campus);
      return row;
    });
  }, [data, filters, filteredYears]);

  // KPIs with partial-year-aware comparisons
  const kpis = useMemo(() => {
    if (!data) return null;
    const latestYear = filteredYears[filteredYears.length - 1] ?? 2026;
    const priorYear = latestYear - 1;
    const partial = isPartialYear(data, latestYear);
    const maxMonth = getMaxMonth(data, latestYear);
    const compMonths = Array.from({ length: maxMonth }, (_, i) => i + 1);
    const monthLabel = partial ? `Jan–${MONTH_NAMES[maxMonth - 1]}` : "";

    const att = (y: number) => getAttendance(data.attendance, y, filters.campus);
    const giv = (y: number) => getGiving(data.giving, y, filters.campus);

    const getGpc = (y: number) => {
      const match = data.computed.giving_per_capita.find(
        (r) =>
          r.year === y &&
          r.campus === (filters.campus === "All Campuses" ? "All Campuses" : filters.campus)
      );
      return match?.giving_per_capita ?? 0;
    };

    const getNs = (y: number, metric: string) => {
      if (filters.campus === "All Campuses") {
        return data.next_steps
          .filter((n) => n.year === y && n.campus === "All Campuses" && n.metric === metric)
          .reduce((s, n) => s + n.total, 0);
      }
      return (
        data.next_steps.find(
          (n) => n.year === y && n.campus === filters.campus && n.metric === metric
        )?.total ?? 0
      );
    };

    // Partial-year-aware YoY comparisons
    const attChange = partial
      ? getPartialYoYChange(data, latestYear, priorYear, (y, m) =>
          getAttendanceForMonths(data, y, filters.campus, m).avgWeekly
        )
      : getYoYChange(att(latestYear), att(priorYear));

    const givChange = partial
      ? getPartialYoYChange(data, latestYear, priorYear, (y, m) =>
          getGivingForMonths(data, y, filters.campus, m)
        )
      : getYoYChange(giv(latestYear), giv(priorYear));

    const ftgChange = partial
      ? getPartialYoYChange(data, latestYear, priorYear, (y, m) =>
          getNextStepsForMonths(data, y, filters.campus, "FTG", m)
        )
      : getYoYChange(getNs(latestYear, "FTG"), getNs(priorYear, "FTG"));

    const salvChange = partial
      ? getPartialYoYChange(data, latestYear, priorYear, (y, m) =>
          getNextStepsForMonths(data, y, filters.campus, "Salvations", m)
        )
      : getYoYChange(getNs(latestYear, "Salvations"), getNs(priorYear, "Salvations"));

    const bapChange = partial
      ? getPartialYoYChange(data, latestYear, priorYear, (y, m) =>
          getNextStepsForMonths(data, y, filters.campus, "Baptisms", m)
        )
      : getYoYChange(getNs(latestYear, "Baptisms"), getNs(priorYear, "Baptisms"));

    // GPC for partial year: use monthly giving / avg attendance for same months
    const gpcChange = partial
      ? (() => {
          const currGiv = getGivingForMonths(data, latestYear, filters.campus, compMonths);
          const prevGiv = getGivingForMonths(data, priorYear, filters.campus, compMonths);
          const currAtt = getAttendanceForMonths(data, latestYear, filters.campus, compMonths).avgWeekly;
          const prevAtt = getAttendanceForMonths(data, priorYear, filters.campus, compMonths).avgWeekly;
          const currGpc = currAtt > 0 ? currGiv / currAtt : 0;
          const prevGpc = prevAtt > 0 ? prevGiv / prevAtt : 0;
          return getYoYChange(currGpc, prevGpc);
        })()
      : getYoYChange(getGpc(latestYear), getGpc(priorYear));

    return {
      year: latestYear,
      partial,
      monthLabel,
      attendance: att(latestYear),
      attendanceChange: attChange,
      giving: giv(latestYear),
      givingChange: givChange,
      gpc: getGpc(latestYear),
      gpcChange,
      ftg: getNs(latestYear, "FTG"),
      ftgChange,
      salvations: getNs(latestYear, "Salvations"),
      salvationsChange: salvChange,
      baptisms: getNs(latestYear, "Baptisms"),
      baptismsChange: bapChange,
    };
  }, [data, filters, filteredYears]);

  if (!data || !kpis) return null;

  const campusKeys =
    filters.campus === "All Campuses" ? ["All Campuses"] : [filters.campus];

  const ytdLabel = kpis.partial ? `${kpis.year} YTD` : `${kpis.year}`;
  const vsLabel = kpis.partial
    ? `vs ${kpis.monthLabel} ${kpis.year - 1}`
    : "vs prior year";

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
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
          value={formatCurrency(kpis.gpc)}
          change={{ ...kpis.gpcChange, label: `${kpis.gpcChange.label} ${vsLabel}` }}
          subtitle={kpis.partial ? `${ytdLabel} per attendee` : "Annual per attendee"}
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

      {/* Partial year notice */}
      {kpis.partial && (
        <div className="px-4 py-2.5 rounded-lg border border-[#D4A843]/30 bg-[#D4A843]/5 text-xs text-[#8B6914]">
          <strong>{kpis.year} is a partial year</strong> ({kpis.monthLabel}). YoY comparisons use the same months from {kpis.year - 1} for an apples-to-apples comparison. Annual totals in charts reflect YTD only.
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance Trend */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4 text-card-foreground">
            Average Weekly Attendance
          </h3>
          <ResponsiveContainer width="100%" height={260}>
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
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4 text-card-foreground">
            Annual Tithes & Offerings
          </h3>
          <ResponsiveContainer width="100%" height={260}>
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
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4 text-card-foreground">
            Campus Attendance Comparison — Avg Weekly
          </h3>
          <ResponsiveContainer width="100%" height={280}>
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
              <Bar
                dataKey="Online"
                fill={CAMPUS_COLORS.Online}
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
