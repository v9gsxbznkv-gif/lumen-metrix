/*
 * Lumen Metrix — Compare Tab
 * Week-over-week comparison across years
 * Compare the same week number in different years (e.g., week 19 of 2026 vs week 19 of 2025)
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useData } from "@/contexts/DataContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarDays,
  Users,
  DollarSign,
  Heart,
} from "lucide-react";

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

function formatNumber(n: number): string {
  return n.toLocaleString();
}
function formatCurrency(n: number): string {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function pctChange(a: number, b: number): number {
  if (a === 0) return b > 0 ? 100 : 0;
  return ((b - a) / a) * 100;
}

function getWeekLabel(weekNumber: number, weekStartDate: string | null): string {
  if (!weekStartDate) return `Week ${weekNumber}`;
  const d = new Date(weekStartDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CompareTab() {
  const { filters } = useData();

  // Get available years
  const { data: years } = trpc.dataViews.compare.getAvailableYears.useQuery();

  const currentYear = new Date().getFullYear();
  const [yearA, setYearA] = useState(currentYear - 1);
  const [yearB, setYearB] = useState(currentYear);
  const [weekNumber, setWeekNumber] = useState(() => {
    // Default to current week - 1
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const currentWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return Math.max(1, currentWeek - 1);
  });

  const campus = filters.campus === "All Campuses" ? undefined : filters.campus;

  // Get available weeks for yearB (the "current" year)
  const { data: availableWeeks } = trpc.dataViews.compare.getAvailableWeeks.useQuery(
    { year: yearB },
    { enabled: !!yearB }
  );

  // Get comparison data
  const { data: compareData, isLoading } = trpc.dataViews.compare.getWeekData.useQuery(
    { weekNumber, yearA, yearB, campus },
    { enabled: !!weekNumber && !!yearA && !!yearB }
  );

  const metrics = useMemo(() => {
    if (!compareData) return [];
    const a = compareData.yearA;
    const b = compareData.yearB;
    return [
      { label: "Total Attendance", a: a.attendance.total, b: b.attendance.total, format: formatNumber, icon: Users },
      { label: "Adults", a: a.attendance.adults, b: b.attendance.adults, format: formatNumber, icon: Users },
      { label: "Kids", a: a.attendance.kids, b: b.attendance.kids, format: formatNumber, icon: Users },
      { label: "Students", a: a.attendance.students, b: b.attendance.students, format: formatNumber, icon: Users },
      { label: "Online", a: a.attendance.online, b: b.attendance.online, format: formatNumber, icon: Users },
      { label: "Total Giving", a: a.giving.total, b: b.giving.total, format: formatCurrency, icon: DollarSign },
      { label: "Donations", a: a.giving.donationCount, b: b.giving.donationCount, format: formatNumber, icon: DollarSign },
      { label: "Volunteers", a: a.attendance.volunteers, b: b.attendance.volunteers, format: formatNumber, icon: Heart },
      { label: "First Time Guests", a: a.nextSteps.ftg, b: b.nextSteps.ftg, format: formatNumber, icon: Users },
      { label: "Salvations", a: a.nextSteps.salvations, b: b.nextSteps.salvations, format: formatNumber, icon: Heart },
      { label: "Baptisms", a: a.nextSteps.baptisms, b: b.nextSteps.baptisms, format: formatNumber, icon: Heart },
    ];
  }, [compareData]);

  const barData = useMemo(() => {
    if (!compareData) return [];
    const a = compareData.yearA;
    const b = compareData.yearB;
    return [
      { metric: "Total Att.", [String(yearA)]: a.attendance.total, [String(yearB)]: b.attendance.total },
      { metric: "Adults", [String(yearA)]: a.attendance.adults, [String(yearB)]: b.attendance.adults },
      { metric: "Kids", [String(yearA)]: a.attendance.kids, [String(yearB)]: b.attendance.kids },
      { metric: "Students", [String(yearA)]: a.attendance.students, [String(yearB)]: b.attendance.students },
      { metric: "Online", [String(yearA)]: a.attendance.online, [String(yearB)]: b.attendance.online },
    ];
  }, [compareData, yearA, yearB]);

  const weekLabel = availableWeeks?.find(w => w.weekNumber === weekNumber)?.weekStartDate;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">
              Week
            </label>
            <select
              value={weekNumber}
              onChange={(e) => setWeekNumber(Number(e.target.value))}
              className="h-8 px-3 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
            >
              {(availableWeeks || Array.from({ length: 52 }, (_, i) => ({ weekNumber: i + 1, weekStartDate: null }))).map((w) => (
                <option key={w.weekNumber} value={w.weekNumber}>
                  Week {w.weekNumber}{w.weekStartDate ? ` (${getWeekLabel(w.weekNumber, w.weekStartDate)})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">
              Year A
            </label>
            <select
              value={yearA}
              onChange={(e) => setYearA(Number(e.target.value))}
              className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
            >
              {(years || []).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end pb-1">
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          </div>

          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">
              Year B
            </label>
            <select
              value={yearB}
              onChange={(e) => setYearB(Number(e.target.value))}
              className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
            >
              {(years || []).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Week date context */}
        {compareData && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="font-medium">{yearA}:</span>
              <span>{compareData.yearA.weekStartDate ? getWeekLabel(weekNumber, compareData.yearA.weekStartDate) : "No data"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="font-medium">{yearB}:</span>
              <span>{compareData.yearB.weekStartDate ? getWeekLabel(weekNumber, compareData.yearB.weekStartDate) : "No data"}</span>
            </div>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8913A]" />
        </div>
      )}

      {compareData && !isLoading && (
        <>
          {/* Attendance Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="section-title mb-1">Attendance Comparison</h3>
              <p className="text-[11px] text-muted-foreground mb-3 sm:mb-4">
                Week {weekNumber}: {yearA} vs. {yearB}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fontFamily: "'DM Mono'" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="metric"
                    width={80}
                    tick={{ fontSize: 11, fontFamily: "'Inter'" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#F7F6F3" }}
                    contentStyle={TT}
                    formatter={(value: number) => formatNumber(value)}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar dataKey={String(yearA)} name={String(yearA)} fill="#E8913A" radius={[0, 3, 3, 0]} />
                  <Bar dataKey={String(yearB)} name={String(yearB)} fill="#4A7C59" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Giving comparison */}
            <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="section-title mb-1">Giving Comparison</h3>
              <p className="text-[11px] text-muted-foreground mb-3 sm:mb-4">
                Week {weekNumber}: {yearA} vs. {yearB}
              </p>
              <div className="space-y-4">
                {/* Total giving big numbers */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-background/60 rounded-lg p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{yearA}</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: "#E8913A" }}>
                      {formatCurrency(compareData.yearA.giving.total)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {compareData.yearA.giving.donationCount} donations
                    </p>
                  </div>
                  <div className="bg-background/60 rounded-lg p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{yearB}</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: "#4A7C59" }}>
                      {formatCurrency(compareData.yearB.giving.total)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {compareData.yearB.giving.donationCount} donations
                    </p>
                  </div>
                </div>
                {/* Change indicator */}
                {compareData.yearA.giving.total > 0 && (
                  <div className="text-center">
                    {(() => {
                      const change = pctChange(compareData.yearA.giving.total, compareData.yearB.giving.total);
                      const isUp = change > 0;
                      return (
                        <span className={`inline-flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : change < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {isUp ? <TrendingUp className="w-4 h-4" /> : change < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                          {change > 0 ? "+" : ""}{change.toFixed(1)}% year over year
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full metrics table */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="section-title mb-1">All Metrics — Week {weekNumber}</h3>
            <p className="text-[11px] text-muted-foreground mb-3 sm:mb-4">
              Side-by-side comparison of all tracked metrics
            </p>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left">
                    <th className="py-2 font-semibold">Metric</th>
                    <th className="py-2 font-semibold text-right">{yearA}</th>
                    <th className="py-2 font-semibold text-right">{yearB}</th>
                    <th className="py-2 font-semibold text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => {
                    const change = pctChange(m.a, m.b);
                    const isIncrease = change > 0;
                    const isDecrease = change < 0;

                    return (
                      <tr key={m.label} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 font-medium flex items-center gap-2">
                          <m.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          {m.label}
                        </td>
                        <td className="py-2.5 text-right font-mono">{m.format(m.a)}</td>
                        <td className="py-2.5 text-right font-mono">{m.format(m.b)}</td>
                        <td className="py-2.5 text-right font-mono text-xs">
                          {m.a > 0 || m.b > 0 ? (
                            <span
                              className={`flex items-center justify-end gap-1 ${
                                isIncrease
                                  ? "text-green-600"
                                  : isDecrease
                                  ? "text-red-500"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {isIncrease ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : isDecrease ? (
                                <TrendingDown className="w-3.5 h-3.5" />
                              ) : (
                                <Minus className="w-3.5 h-3.5" />
                              )}
                              {change > 0 ? "+" : ""}{change.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick presets */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="section-title mb-3">Quick Comparisons</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { label: `Last week (${yearA} vs ${yearB})`, week: Math.max(1, weekNumber - 1), ya: yearA, yb: yearB },
                { label: `Week 1 (${yearA} vs ${yearB})`, week: 1, ya: yearA, yb: yearB },
                { label: "Easter week (Wk 14)", week: 14, ya: yearA, yb: yearB },
                { label: "Christmas week (Wk 52)", week: 52, ya: yearA, yb: yearB },
                { label: `Week ${weekNumber} (${yearB - 2} vs ${yearB})`, week: weekNumber, ya: yearB - 2, yb: yearB },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setWeekNumber(preset.week);
                    setYearA(preset.ya);
                    setYearB(preset.yb);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-[#E8913A]/40 hover:bg-[#E8913A]/5 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!isLoading && compareData && compareData.yearA.attendance.total === 0 && compareData.yearB.attendance.total === 0 && (
        <div className="bg-card rounded-lg border border-border/60 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No data available for week {weekNumber} in either {yearA} or {yearB}.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Try selecting a different week or year range.
          </p>
        </div>
      )}
    </div>
  );
}
