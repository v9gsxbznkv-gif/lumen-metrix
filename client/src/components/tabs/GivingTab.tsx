/*
 * Lumen Metrix — Giving Tab
 * Per capita analysis, monthly patterns, campus comparison, giving by type
 */
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line,
} from "recharts";

const TT = { fontSize: 12, borderRadius: 8, border: "1px solid #E8E5DE", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontFamily: "'Inter'" };

export default function GivingTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter((y) => y >= filters.yearStart && y <= filters.yearEnd);
  }, [data, filters]);

  const latestYear = useMemo(() => filteredYears[filteredYears.length - 1] ?? 2026, [filteredYears]);

  // GPC trend
  const gpcTrend = useMemo(() => {
    if (!data) return [];
    const gpc = data.computed.giving_per_capita;
    return filteredYears.map((year) => {
      const match = filters.campus === "All Campuses"
        ? gpc.find((g) => g.year === year && g.campus === "All Campuses")
        : gpc.find((g) => g.year === year && g.campus === filters.campus);
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
      ["Canton", "Jasper", "Online"].forEach((c) => {
        row[c] = tithes.find((t) => t.year === year && t.campus === c)?.total ?? 0;
      });
      return row;
    });
  }, [data, filteredYears]);

  // Monthly giving
  const monthlyGiving = useMemo(() => {
    if (!data) return [];
    const monthly = data.giving.monthly;
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const matches = monthly.filter(
        (m) => m.year === latestYear && m.month === month && m.subgroup === "Tithes and Offerings" &&
          (filters.campus === "All Campuses" || m.campus === filters.campus)
      );
      return { month: MONTH_NAMES[i], total: matches.reduce((s, m) => s + m.total, 0) };
    });
  }, [data, filters, latestYear]);

  // Giving by type
  const givingByType = useMemo(() => {
    if (!data) return [];
    const annual = data.giving.annual;
    return ["Tithes and Offerings", "Designated", "Advance Regular"].map((type) => {
      const matches = annual.filter(
        (a) => a.year === latestYear && a.subgroup === type &&
          (filters.campus === "All Campuses" || a.campus === filters.campus)
      );
      return {
        type: type === "Tithes and Offerings" ? "Tithes" : type === "Advance Regular" ? "Advance" : type,
        total: matches.reduce((s, m) => s + m.total, 0),
      };
    }).filter((t) => t.total > 0);
  }, [data, filters, latestYear]);

  // KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    const priorYear = latestYear - 1;
    const gpc = data.computed.giving_per_capita;
    const tithes = data.giving.tithes_annual;

    const getGiving = (y: number) => {
      const match = filters.campus === "All Campuses"
        ? tithes.find((t) => t.year === y && t.campus === "All Campuses")
        : tithes.find((t) => t.year === y && t.campus === filters.campus);
      return match?.total ?? 0;
    };
    const getGpc = (y: number) => {
      const match = filters.campus === "All Campuses"
        ? gpc.find((g) => g.year === y && g.campus === "All Campuses")
        : gpc.find((g) => g.year === y && g.campus === filters.campus);
      return match?.giving_per_capita ?? 0;
    };
    const getWeeklyAvg = (y: number) => {
      const match = filters.campus === "All Campuses"
        ? tithes.find((t) => t.year === y && t.campus === "All Campuses")
        : tithes.find((t) => t.year === y && t.campus === filters.campus);
      return match?.avg_weekly ?? 0;
    };

    return {
      totalGiving: getGiving(latestYear),
      givingChange: getYoYChange(getGiving(latestYear), getGiving(priorYear)),
      gpc: getGpc(latestYear),
      gpcChange: getYoYChange(getGpc(latestYear), getGpc(priorYear)),
      weeklyAvg: getWeeklyAvg(latestYear),
      weeklyChange: getYoYChange(getWeeklyAvg(latestYear), getWeeklyAvg(priorYear)),
    };
  }, [data, filters, latestYear]);

  if (!data || !kpis) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Annual Tithes & Offerings" value={formatCurrency(kpis.totalGiving)} change={kpis.givingChange} subtitle={`${latestYear} total`} borderColor="#E8913A" />
        <KpiCard label="Giving Per Capita" value={formatCurrency(kpis.gpc)} change={kpis.gpcChange} subtitle={`~${formatCurrency(kpis.gpc / 52)}/week per person`} borderColor="#4A7C59" />
        <KpiCard label="Avg Weekly Giving" value={formatCurrency(kpis.weeklyAvg)} change={kpis.weeklyChange} subtitle={`${latestYear} average`} borderColor="#4A7FB5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Giving Per Capita — Annual Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={gpcTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
              <Tooltip contentStyle={TT} formatter={(v: number, name: string) => [name === "gpc" ? `$${v.toLocaleString()}` : formatNumber(v), name === "gpc" ? "Per Capita" : "Avg Attendance"]} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} />
              <Bar yAxisId="left" dataKey="gpc" name="Per Capita" fill="#E8913A" radius={[4, 4, 0, 0]} maxBarSize={32} opacity={0.85} />
              <Line yAxisId="right" type="monotone" dataKey="avgAttendance" name="Avg Attendance" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Monthly Giving Pattern — {latestYear}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyGiving}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
              <Tooltip contentStyle={TT} formatter={(v: number) => [`$${v.toLocaleString()}`, "Total"]} />
              <Bar dataKey="total" fill="#E8913A" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {filters.campus === "All Campuses" && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Campus Giving Comparison — Annual Tithes</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={campusGiving}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
              <Tooltip contentStyle={TT} formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
              <Bar dataKey="Canton" fill={CAMPUS_COLORS.Canton} radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Jasper" fill={CAMPUS_COLORS.Jasper} radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Online" fill={CAMPUS_COLORS.Online} radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {givingByType.length > 0 && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Giving Breakdown by Type — {latestYear}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {givingByType.map((item) => (
              <div key={item.type} className="text-center p-4 bg-muted/40 rounded-lg">
                <p className="micro-label text-muted-foreground mb-1.5">{item.type}</p>
                <p className="stat-value text-2xl">{formatCurrency(item.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
