/*
 * Lumen Metrix — Overview Tab
 * KPIs, attendance trend, giving trend, campus comparison
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatCurrency,
  formatNumber,
  getYoYChange,
  CAMPUS_COLORS,
  CAMPUS_COLORS_LIGHT,
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
    const totals = data.attendance.total_annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        const all = totals.find((t) => t.year === year && t.campus === "All Campuses");
        row["All Campuses"] = all?.avg_weekly ?? 0;
      } else {
        const c = totals.find((t) => t.year === year && t.campus === filters.campus);
        row[filters.campus] = c?.avg_weekly ?? 0;
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // Campus comparison
  const campusComparison = useMemo(() => {
    if (!data) return [];
    const totals = data.attendance.total_annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["Canton", "Jasper", "Online"].forEach((c) => {
        const match = totals.find((t) => t.year === year && t.campus === c);
        row[c] = Math.round(match?.avg_weekly ?? 0);
      });
      return row;
    });
  }, [data, filteredYears]);

  // Giving trend
  const givingTrend = useMemo(() => {
    if (!data) return [];
    const tithes = data.giving.tithes_annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        const all = tithes.find((t) => t.year === year && t.campus === "All Campuses");
        row.total = all?.total ?? 0;
      } else {
        const c = tithes.find((t) => t.year === year && t.campus === filters.campus);
        row.total = c?.total ?? 0;
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    const latestYear = filteredYears[filteredYears.length - 1] ?? 2026;
    const priorYear = latestYear - 1;

    const totals = data.attendance.total_annual;
    const tithes = data.giving.tithes_annual;
    const gpc = data.computed.giving_per_capita;
    const ns = data.next_steps.annual;

    const getAtt = (y: number) => {
      if (filters.campus === "All Campuses") {
        return totals.find((t) => t.year === y && t.campus === "All Campuses")?.avg_weekly ?? 0;
      }
      return totals.find((t) => t.year === y && t.campus === filters.campus)?.avg_weekly ?? 0;
    };

    const getGiving = (y: number) => {
      if (filters.campus === "All Campuses") {
        return tithes.find((t) => t.year === y && t.campus === "All Campuses")?.total ?? 0;
      }
      return tithes.find((t) => t.year === y && t.campus === filters.campus)?.total ?? 0;
    };

    const getGpc = (y: number) => {
      if (filters.campus === "All Campuses") {
        return gpc.find((t) => t.year === y && t.campus === "All Campuses")?.giving_per_capita ?? 0;
      }
      return gpc.find((t) => t.year === y && t.campus === filters.campus)?.giving_per_capita ?? 0;
    };

    const getNs = (y: number, metric: string) => {
      if (filters.campus === "All Campuses") {
        return ns.filter((n) => n.year === y && n.metric === metric).reduce((s, n) => s + n.total, 0);
      }
      return ns.find((n) => n.year === y && n.campus === filters.campus && n.metric === metric)?.total ?? 0;
    };

    return {
      year: latestYear,
      attendance: getAtt(latestYear),
      attendanceChange: getYoYChange(getAtt(latestYear), getAtt(priorYear)),
      giving: getGiving(latestYear),
      givingChange: getYoYChange(getGiving(latestYear), getGiving(priorYear)),
      gpc: getGpc(latestYear),
      gpcChange: getYoYChange(getGpc(latestYear), getGpc(priorYear)),
      ftg: getNs(latestYear, "FTG"),
      ftgChange: getYoYChange(getNs(latestYear, "FTG"), getNs(priorYear, "FTG")),
      salvations: getNs(latestYear, "Salvation"),
      salvationsChange: getYoYChange(getNs(latestYear, "Salvation"), getNs(priorYear, "Salvation")),
      baptisms: getNs(latestYear, "Baptism"),
      baptismsChange: getYoYChange(getNs(latestYear, "Baptism"), getNs(priorYear, "Baptism")),
    };
  }, [data, filters, filteredYears]);

  if (!data || !kpis) return null;

  const campusKeys = filters.campus === "All Campuses" ? ["All Campuses"] : [filters.campus];

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Avg Weekly Attendance"
          value={formatNumber(kpis.attendance)}
          change={kpis.attendanceChange}
          subtitle={`${kpis.year}${kpis.year === 2026 ? ' YTD' : ''}`}
          icon={<Users className="w-5 h-5" />}
          borderColor={CAMPUS_COLORS[filters.campus]}
        />
        <KpiCard
          label="Annual Tithes"
          value={formatCurrency(kpis.giving)}
          change={kpis.givingChange}
          subtitle={`${kpis.year}${kpis.year === 2026 ? ' YTD' : ''}`}
          icon={<DollarSign className="w-5 h-5" />}
          borderColor={CAMPUS_COLORS[filters.campus]}
        />
        <KpiCard
          label="Giving Per Capita"
          value={formatCurrency(kpis.gpc)}
          change={kpis.gpcChange}
          subtitle="Annual per attendee"
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          label="First Time Guests"
          value={formatNumber(kpis.ftg)}
          change={kpis.ftgChange}
          subtitle={`${kpis.year}${kpis.year === 2026 ? ' YTD' : ''}`}
          icon={<Heart className="w-5 h-5" />}
        />
        <KpiCard
          label="Salvations"
          value={formatNumber(kpis.salvations)}
          change={kpis.salvationsChange}
          subtitle={`${kpis.year}${kpis.year === 2026 ? ' YTD' : ''}`}
          icon={<Heart className="w-5 h-5" />}
        />
        <KpiCard
          label="Baptisms"
          value={formatNumber(kpis.baptisms)}
          change={kpis.baptismsChange}
          subtitle={`${kpis.year}${kpis.year === 2026 ? ' YTD' : ''}`}
          icon={<HandHelping className="w-5 h-5" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance Trend */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4 text-card-foreground">Average Weekly Attendance</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={attendanceTrend}>
              <defs>
                {campusKeys.map((key) => (
                  <linearGradient key={key} id={`grad-${key.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CAMPUS_COLORS[key]} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={CAMPUS_COLORS[key]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatNumber(v), "Avg Weekly"]} />
              {campusKeys.map((key) => (
                <Area key={key} type="monotone" dataKey={key} stroke={CAMPUS_COLORS[key]} fill={`url(#grad-${key.replace(/\s/g, "")})`} strokeWidth={2.5} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Giving Trend */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4 text-card-foreground">Annual Tithes & Offerings</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={givingTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}`, "Tithes & Offerings"]} />
              <Bar dataKey="total" fill={CAMPUS_COLORS[filters.campus]} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campus Comparison */}
      {filters.campus === "All Campuses" && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4 text-card-foreground">Campus Attendance Comparison — Avg Weekly</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={campusComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
              <Bar dataKey="Canton" fill={CAMPUS_COLORS.Canton} radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Jasper" fill={CAMPUS_COLORS.Jasper} radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Online" fill={CAMPUS_COLORS.Online} radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
