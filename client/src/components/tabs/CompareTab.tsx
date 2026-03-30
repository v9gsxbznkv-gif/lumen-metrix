/*
 * Lumen Metrix — Compare Tab
 * Side-by-side event/date comparisons across years
 * Data: v3 flat structure (monthly-level granularity)
 */
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import {
  CHURCH_EVENTS,
  formatEventDate,
  type ChurchEvent,
} from "@/lib/churchCalendar";
import {
  formatCurrency,
  formatNumber,
  MONTH_NAMES,
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
} from "recharts";
import {
  CalendarDays,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

const TT = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  fontFamily: "'Inter'",
};

type CompareMode = "event" | "custom";

export default function CompareTab() {
  const { data, filters } = useData();
  const [mode, setMode] = useState<CompareMode>("event");
  const [selectedEvent, setSelectedEvent] = useState("easter");
  const [yearA, setYearA] = useState(2025);
  const [yearB, setYearB] = useState(2026);
  const [customMonthA, setCustomMonthA] = useState(4);
  const [customMonthB, setCustomMonthB] = useState(4);

  const availableYears = useMemo(() => data?.meta.years ?? [], [data]);

  const event = useMemo(
    () => CHURCH_EVENTS.find((e) => e.id === selectedEvent) ?? CHURCH_EVENTS[0],
    [selectedEvent]
  );

  // Get metrics for a given year/month using monthly data
  const getMonthMetrics = (year: number, month: number) => {
    if (!data) return null;
    const campus = filters.campus;

    // Attendance
    const monthlyAtt = data.attendance_monthly.filter(
      (a) =>
        a.year === year &&
        a.month === month &&
        a.subgroup === "Total" &&
        (campus === "All Campuses"
          ? a.campus !== "All Campuses"
          : a.campus === campus)
    );
    const avgAttendance = Math.round(
      monthlyAtt.reduce((s, a) => s + a.avg_weekly, 0)
    );

    // Giving
    const monthlyGiving = data.giving_monthly.filter(
      (g) =>
        g.year === year &&
        g.month === month &&
        (campus === "All Campuses" || g.campus === campus)
    );
    const totalGiving = monthlyGiving.reduce((s, g) => s + g.total, 0);

    // Next steps
    const monthlyNS = data.next_steps_monthly.filter(
      (n) =>
        n.year === year &&
        n.month === month &&
        (campus === "All Campuses" || n.campus === campus)
    );
    const ftg = monthlyNS
      .filter((n) => n.metric === "FTG")
      .reduce((s, n) => s + n.count, 0);
    const salvations = monthlyNS
      .filter((n) => n.metric === "Salvations")
      .reduce((s, n) => s + n.count, 0);
    const baptisms = monthlyNS
      .filter((n) => n.metric === "Baptisms")
      .reduce((s, n) => s + n.count, 0);

    return {
      year,
      date: new Date(year, month - 1, 1),
      avgAttendance,
      totalGiving,
      ftg,
      salvations,
      baptisms,
    };
  };

  // Get metrics for an event (use the event's month)
  const getEventMetrics = (year: number, evt: ChurchEvent) => {
    const eventDate = evt.getDate(year);
    if (!eventDate) return null;
    const eventMonth = eventDate.getMonth() + 1;
    const result = getMonthMetrics(year, eventMonth);
    if (result) {
      result.date = eventDate;
    }
    return result;
  };

  const metricsA = useMemo(() => {
    if (mode === "event") return getEventMetrics(yearA, event);
    return getMonthMetrics(yearA, customMonthA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters, mode, selectedEvent, yearA, customMonthA]);

  const metricsB = useMemo(() => {
    if (mode === "event") return getEventMetrics(yearB, event);
    return getMonthMetrics(yearB, customMonthB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters, mode, selectedEvent, yearB, customMonthB]);

  // Multi-year event trend
  const eventTrend = useMemo(() => {
    if (mode !== "event" || !data) return [];
    return availableYears
      .map((y) => {
        const m = getEventMetrics(y, event);
        if (!m) return null;
        return {
          year: y,
          attendance: m.avgAttendance,
          giving: m.totalGiving,
          ftg: m.ftg,
        };
      })
      .filter(Boolean) as {
      year: number;
      attendance: number;
      giving: number;
      ftg: number;
    }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters, mode, selectedEvent, availableYears]);

  if (!data) return null;

  const comparisonMetrics =
    metricsA && metricsB
      ? [
          {
            label: "Avg Attendance",
            a: metricsA.avgAttendance,
            b: metricsB.avgAttendance,
            format: formatNumber,
          },
          {
            label: "Total Giving",
            a: metricsA.totalGiving,
            b: metricsB.totalGiving,
            format: formatCurrency,
          },
          {
            label: "First Time Guests",
            a: metricsA.ftg,
            b: metricsB.ftg,
            format: formatNumber,
          },
          {
            label: "Salvations",
            a: metricsA.salvations,
            b: metricsB.salvations,
            format: formatNumber,
          },
          {
            label: "Baptisms",
            a: metricsA.baptisms,
            b: metricsB.baptisms,
            format: formatNumber,
          },
        ]
      : [];

  const barData = comparisonMetrics.map((m) => ({
    metric: m.label,
    [String(yearA)]: m.a,
    [String(yearB)]: m.b,
  }));

  const labelA =
    mode === "event"
      ? `${event.name} ${yearA}`
      : `${MONTH_NAMES[customMonthA - 1]} ${yearA}`;
  const labelB =
    mode === "event"
      ? `${event.name} ${yearB}`
      : `${MONTH_NAMES[customMonthB - 1]} ${yearB}`;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">
              Compare By
            </label>
            <div className="flex rounded-md overflow-hidden border border-border/60">
              <button
                onClick={() => setMode("event")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "event"
                    ? "text-white"
                    : "text-muted-foreground hover:bg-muted/40"
                }`}
                style={mode === "event" ? { backgroundColor: "#E8913A" } : {}}
              >
                Church Event
              </button>
              <button
                onClick={() => setMode("custom")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "custom"
                    ? "text-white"
                    : "text-muted-foreground hover:bg-muted/40"
                }`}
                style={mode === "custom" ? { backgroundColor: "#E8913A" } : {}}
              >
                Custom Month
              </button>
            </div>
          </div>

          {mode === "event" && (
            <div>
              <label className="micro-label text-muted-foreground block mb-1.5">
                Event
              </label>
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className="h-8 px-3 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {CHURCH_EVENTS.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">
              Period A
            </label>
            <div className="flex items-center gap-1.5">
              {mode === "custom" && (
                <select
                  value={customMonthA}
                  onChange={(e) => setCustomMonthA(Number(e.target.value))}
                  className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={yearA}
                onChange={(e) => setYearA(Number(e.target.value))}
                className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-end pb-1">
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          </div>

          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">
              Period B
            </label>
            <div className="flex items-center gap-1.5">
              {mode === "custom" && (
                <select
                  value={customMonthB}
                  onChange={(e) => setCustomMonthB(Number(e.target.value))}
                  className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={yearB}
                onChange={(e) => setYearB(Number(e.target.value))}
                className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison */}
      {metricsA && metricsB && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Bar chart */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="section-title mb-1">Metric Comparison</h3>
            <p className="text-[11px] text-muted-foreground mb-3 sm:mb-4">
              {labelA} vs. {labelB}
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
                  width={110}
                  tick={{ fontSize: 11, fontFamily: "'Inter'" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#F7F6F3" }}
                  contentStyle={TT}
                  formatter={(value: number, name: string) => {
                    const metric = comparisonMetrics.find(
                      (m) => m.label === (barData.find(b => b[name] === value)?.metric)
                    );
                    return metric ? metric.format(value) : value;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar dataKey={String(yearA)} name={labelA} fill="#E8913A" />
                <Bar dataKey={String(yearB)} name={labelB} fill="#4A7C59" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Data table */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="section-title mb-1">Side-by-Side</h3>
            <p className="text-[11px] text-muted-foreground mb-3 sm:mb-4">
              Raw numbers for the two selected periods
            </p>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left">
                    <th className="py-2 font-semibold">Metric</th>
                    <th className="py-2 font-semibold text-right">{labelA}</th>
                    <th className="py-2 font-semibold text-right">{labelB}</th>
                    <th className="py-2 font-semibold text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonMetrics.map((m) => {
                    const change = m.b - m.a;
                    const pctChange = m.a !== 0 ? (change / m.a) * 100 : 0;
                    const isIncrease = change > 0;
                    const isDecrease = change < 0;

                    return (
                      <tr key={m.label} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 font-medium">{m.label}</td>
                        <td className="py-2.5 text-right font-mono">{m.format(m.a)}</td>
                        <td className="py-2.5 text-right font-mono">{m.format(m.b)}</td>
                        <td className="py-2.5 text-right font-mono text-xs">
                          <span
                            className={`flex items-center justify-end gap-1 ${
                              isIncrease
                                ? "text-green-600"
                                : isDecrease
                                ? "text-red-500"
                                : "text-muted-foreground"
                            }`}>
                            {isIncrease ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : isDecrease ? (
                              <TrendingDown className="w-3.5 h-3.5" />
                            ) : (
                              <Minus className="w-3.5 h-3.5" />
                            )}
                            {pctChange.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      {metricsA && metricsB && (
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-1">Period Dates</h3>
          <p className="text-[11px] text-muted-foreground mb-3 sm:mb-4">
            The specific dates being compared based on your selection
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-background/60 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#E8913A]/10 text-[#E8913A] rounded-full p-2">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Period A</p>
                  <p className="font-bold text-sm">{formatEventDate(metricsA.date)}</p>
                </div>
              </div>
            </div>
            <div className="bg-background/60 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#4A7C59]/10 text-[#4A7C59] rounded-full p-2">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Period B</p>
                  <p className="font-bold text-sm">{formatEventDate(metricsB.date)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-year event trend */}
      {mode === "event" && eventTrend.length > 2 && (
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-1">
            {event.name} — Multi-Year Trend
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3 sm:mb-4">
            How this event has performed across all available years
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={eventTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fontFamily: "'Inter'" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fontFamily: "'DM Mono'" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fontFamily: "'DM Mono'" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCurrency}
              />
              <Tooltip contentStyle={TT} />
              <Legend
                wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                yAxisId="left"
                dataKey="attendance"
                name="Avg Attendance"
                fill="#E8913A"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                opacity={0.8}
              />
              <Bar
                yAxisId="left"
                dataKey="ftg"
                name="First Time Guests"
                fill="#4A7C59"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                opacity={0.8}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quick presets */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3">Quick Comparisons</h3>
        <div className="flex flex-wrap gap-2">
          {[
            {
              label: "Easter 2024 vs 2025",
              event: "easter",
              ya: 2024,
              yb: 2025,
            },
            {
              label: "Christmas 2023 vs 2024",
              event: "christmas",
              ya: 2023,
              yb: 2024,
            },
            {
              label: "Mother's Day 2024 vs 2025",
              event: "mothers_day",
              ya: 2024,
              yb: 2025,
            },
            {
              label: "Back to School 2023 vs 2024",
              event: "back_to_school",
              ya: 2023,
              yb: 2024,
            },
            {
              label: "Super Bowl 2024 vs 2025",
              event: "super_bowl",
              ya: 2024,
              yb: 2025,
            },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                setMode("event");
                setSelectedEvent(preset.event);
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
    </div>
  );
}
