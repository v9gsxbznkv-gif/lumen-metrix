/*
 * Lumen Metrix — Compare Tab
 * Side-by-side event/date comparisons across years
 * e.g. Easter 2024 vs Easter 2025, Christmas 2023 vs 2024
 */
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import {
  CHURCH_EVENTS,
  formatEventDate,
  getISOWeek,
  type ChurchEvent,
} from "@/lib/churchCalendar";
import {
  formatCurrency,
  formatNumber,
  CAMPUS_COLORS,
  CHART_COLORS,
  MONTH_NAMES,
} from "@/lib/data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import {
  CalendarDays, ArrowLeftRight, ChevronDown, TrendingUp, TrendingDown, Minus,
} from "lucide-react";

const TT = {
  fontSize: 12, borderRadius: 8, border: "1px solid #E8E5DE",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontFamily: "'Inter'",
};

type CompareMode = "event" | "custom";

export default function CompareTab() {
  const { data, filters } = useData();
  const [mode, setMode] = useState<CompareMode>("event");
  const [selectedEvent, setSelectedEvent] = useState("easter");
  const [yearA, setYearA] = useState(2024);
  const [yearB, setYearB] = useState(2025);
  const [customMonthA, setCustomMonthA] = useState(4);
  const [customMonthB, setCustomMonthB] = useState(4);

  const availableYears = useMemo(() => data?.meta.years ?? [], [data]);

  const event = useMemo(
    () => CHURCH_EVENTS.find((e) => e.id === selectedEvent) ?? CHURCH_EVENTS[0],
    [selectedEvent]
  );

  // Get metrics for a given year around the event
  const getEventMetrics = (year: number, evt: ChurchEvent) => {
    if (!data) return null;
    const eventDate = evt.getDate(year);
    if (!eventDate) return null;

    const eventWeek = getISOWeek(eventDate);
    const eventMonth = eventDate.getMonth() + 1;
    const windowWeeks = evt.windowWeeks;
    const startWeek = Math.max(1, eventWeek - windowWeeks);
    const endWeek = Math.min(53, eventWeek + windowWeeks);

    const campus = filters.campus;

    // Attendance from weekly data
    const weeklyAtt = data.attendance.weekly.filter(
      (w) =>
        w.year === year &&
        w.week >= startWeek &&
        w.week <= endWeek &&
        (campus === "All Campuses" || w.campus === campus)
    );
    const totalAttendance = weeklyAtt.reduce((s, w) => s + w.count, 0);
    const weeksCount = new Set(weeklyAtt.map((w) => w.week)).size || 1;
    const avgAttendance = Math.round(totalAttendance / weeksCount);

    // Giving from monthly data (use the event month)
    const monthlyGiving = data.giving.monthly.filter(
      (g) =>
        g.year === year &&
        g.month === eventMonth &&
        g.subgroup === "Tithes and Offerings" &&
        (campus === "All Campuses" || g.campus === campus)
    );
    const totalGiving = monthlyGiving.reduce((s, g) => s + g.total, 0);

    // Next steps from monthly data
    const monthlyNS = data.next_steps.monthly.filter(
      (n) =>
        n.year === year &&
        n.month === eventMonth &&
        (campus === "All Campuses" || n.campus === campus)
    );
    const ftg = monthlyNS.filter((n) => n.metric === "FTG").reduce((s, n) => s + n.total, 0);
    const salvations = monthlyNS.filter((n) => n.metric === "Salvation").reduce((s, n) => s + n.total, 0);
    const baptisms = monthlyNS.filter((n) => n.metric === "Baptism").reduce((s, n) => s + n.total, 0);

    return {
      year,
      date: eventDate,
      week: eventWeek,
      avgAttendance,
      totalAttendance,
      totalGiving,
      ftg,
      salvations,
      baptisms,
    };
  };

  // Get metrics for a custom month comparison
  const getMonthMetrics = (year: number, month: number) => {
    if (!data) return null;
    const campus = filters.campus;

    const monthlyAtt = data.attendance.monthly.filter(
      (a) =>
        a.year === year &&
        a.month === month &&
        (campus === "All Campuses" || a.campus === campus)
    );
    const avgAttendance = Math.round(
      monthlyAtt.reduce((s, a) => s + a.avg_weekly, 0)
    );

    const monthlyGiving = data.giving.monthly.filter(
      (g) =>
        g.year === year &&
        g.month === month &&
        g.subgroup === "Tithes and Offerings" &&
        (campus === "All Campuses" || g.campus === campus)
    );
    const totalGiving = monthlyGiving.reduce((s, g) => s + g.total, 0);

    const monthlyNS = data.next_steps.monthly.filter(
      (n) =>
        n.year === year &&
        n.month === month &&
        (campus === "All Campuses" || n.campus === campus)
    );
    const ftg = monthlyNS.filter((n) => n.metric === "FTG").reduce((s, n) => s + n.total, 0);
    const salvations = monthlyNS.filter((n) => n.metric === "Salvation").reduce((s, n) => s + n.total, 0);
    const baptisms = monthlyNS.filter((n) => n.metric === "Baptism").reduce((s, n) => s + n.total, 0);

    return {
      year,
      date: new Date(year, month - 1, 1),
      week: 0,
      avgAttendance,
      totalAttendance: avgAttendance * 4,
      totalGiving,
      ftg,
      salvations,
      baptisms,
    };
  };

  const metricsA = useMemo(() => {
    if (mode === "event") return getEventMetrics(yearA, event);
    return getMonthMetrics(yearA, customMonthA);
  }, [data, filters, mode, selectedEvent, yearA, customMonthA]);

  const metricsB = useMemo(() => {
    if (mode === "event") return getEventMetrics(yearB, event);
    return getMonthMetrics(yearB, customMonthB);
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
      .filter(Boolean) as { year: number; attendance: number; giving: number; ftg: number }[];
  }, [data, filters, mode, selectedEvent, availableYears]);

  if (!data) return null;

  const comparisonMetrics = metricsA && metricsB ? [
    { label: "Avg Attendance", a: metricsA.avgAttendance, b: metricsB.avgAttendance, format: formatNumber },
    { label: "Total Giving", a: metricsA.totalGiving, b: metricsB.totalGiving, format: formatCurrency },
    { label: "First Time Guests", a: metricsA.ftg, b: metricsB.ftg, format: formatNumber },
    { label: "Salvations", a: metricsA.salvations, b: metricsB.salvations, format: formatNumber },
    { label: "Baptisms", a: metricsA.baptisms, b: metricsB.baptisms, format: formatNumber },
  ] : [];

  const barData = comparisonMetrics.map((m) => ({
    metric: m.label,
    [String(yearA)]: m.a,
    [String(yearB)]: m.b,
  }));

  const labelA = mode === "event"
    ? `${event.name} ${yearA}`
    : `${MONTH_NAMES[customMonthA - 1]} ${yearA}`;
  const labelB = mode === "event"
    ? `${event.name} ${yearB}`
    : `${MONTH_NAMES[customMonthB - 1]} ${yearB}`;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-end gap-4">
          {/* Mode toggle */}
          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">Compare By</label>
            <div className="flex rounded-md overflow-hidden border border-border/60">
              <button
                onClick={() => setMode("event")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "event" ? "text-white" : "text-muted-foreground hover:bg-muted/40"
                }`}
                style={mode === "event" ? { backgroundColor: "#E8913A" } : {}}
              >
                Church Event
              </button>
              <button
                onClick={() => setMode("custom")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "custom" ? "text-white" : "text-muted-foreground hover:bg-muted/40"
                }`}
                style={mode === "custom" ? { backgroundColor: "#E8913A" } : {}}
              >
                Custom Month
              </button>
            </div>
          </div>

          {/* Event selector */}
          {mode === "event" && (
            <div>
              <label className="micro-label text-muted-foreground block mb-1.5">Event</label>
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className="h-8 px-3 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {CHURCH_EVENTS.map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Period A */}
          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">Period A</label>
            <div className="flex items-center gap-1.5">
              {mode === "custom" && (
                <select
                  value={customMonthA}
                  onChange={(e) => setCustomMonthA(Number(e.target.value))}
                  className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              )}
              <select
                value={yearA}
                onChange={(e) => setYearA(Number(e.target.value))}
                className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-end pb-1">
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Period B */}
          <div>
            <label className="micro-label text-muted-foreground block mb-1.5">Period B</label>
            <div className="flex items-center gap-1.5">
              {mode === "custom" && (
                <select
                  value={customMonthB}
                  onChange={(e) => setCustomMonthB(Number(e.target.value))}
                  className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              )}
              <select
                value={yearB}
                onChange={(e) => setYearB(Number(e.target.value))}
                className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Event description */}
        {mode === "event" && (
          <p className="text-[11px] text-muted-foreground mt-3">
            <CalendarDays className="w-3 h-3 inline mr-1" />
            {event.description}
            {metricsA?.date && ` — ${formatEventDate(metricsA.date)} vs ${metricsB?.date ? formatEventDate(metricsB.date) : "N/A"}`}
          </p>
        )}
      </div>

      {/* Comparison Cards */}
      {metricsA && metricsB && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {comparisonMetrics.map((m) => {
            const change = m.a > 0 ? ((m.b - m.a) / m.a) * 100 : 0;
            const isUp = change > 0;
            const isFlat = Math.abs(change) < 0.5;
            return (
              <div key={m.label} className="bg-card rounded-lg border border-border/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <p className="micro-label text-muted-foreground mb-2">{m.label}</p>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="stat-value text-lg">{m.format(m.b)}</span>
                  {!isFlat && (
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${isUp ? "text-[#4A7C59]" : "text-[#C45B4A]"}`}>
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                    </span>
                  )}
                  {isFlat && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      <Minus className="w-3 h-3" /> flat
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  was {m.format(m.a)} in {yearA}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Side-by-side bar chart */}
      {metricsA && metricsB && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="section-title mb-4">
              {labelA} vs {labelB} — Attendance & Next Steps
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={barData.filter((d) => d.metric !== "Total Giving")}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="metric" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} width={120} />
                <Tooltip contentStyle={TT} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
                <Bar dataKey={String(yearA)} fill="#C2703E" radius={[0, 3, 3, 0]} maxBarSize={18} opacity={0.7} />
                <Bar dataKey={String(yearB)} fill="#E8913A" radius={[0, 3, 3, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="section-title mb-4">
              {labelA} vs {labelB} — Giving
            </h3>
            <div className="flex items-center justify-center gap-8 h-[280px]">
              <div className="text-center">
                <p className="micro-label text-muted-foreground mb-2">{labelA}</p>
                <p className="stat-value text-3xl" style={{ color: "#C2703E" }}>
                  {formatCurrency(metricsA.totalGiving)}
                </p>
              </div>
              <div className="flex flex-col items-center">
                <ArrowLeftRight className="w-5 h-5 text-muted-foreground/40 mb-2" />
                {(() => {
                  const change = metricsA.totalGiving > 0
                    ? ((metricsB.totalGiving - metricsA.totalGiving) / metricsA.totalGiving) * 100
                    : 0;
                  const isUp = change > 0;
                  return (
                    <div className={`text-center px-4 py-2 rounded-lg ${isUp ? "bg-[#4A7C59]/10" : "bg-[#C45B4A]/10"}`}>
                      <p className={`stat-value text-xl ${isUp ? "text-[#4A7C59]" : "text-[#C45B4A]"}`}>
                        {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {isUp ? "increase" : "decrease"}
                      </p>
                    </div>
                  );
                })()}
              </div>
              <div className="text-center">
                <p className="micro-label text-muted-foreground mb-2">{labelB}</p>
                <p className="stat-value text-3xl" style={{ color: "#E8913A" }}>
                  {formatCurrency(metricsB.totalGiving)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-year event trend */}
      {mode === "event" && eventTrend.length > 2 && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-1">{event.name} — Multi-Year Trend</h3>
          <p className="text-[11px] text-muted-foreground mb-4">
            How this event has performed across all available years
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={eventTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
              <Bar yAxisId="left" dataKey="attendance" name="Avg Attendance" fill="#E8913A" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.8} />
              <Bar yAxisId="left" dataKey="ftg" name="First Time Guests" fill="#4A7C59" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quick presets */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3">Quick Comparisons</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Easter 2024 vs 2025", event: "easter", ya: 2024, yb: 2025 },
            { label: "Christmas 2023 vs 2024", event: "christmas", ya: 2023, yb: 2024 },
            { label: "Mother's Day 2024 vs 2025", event: "mothers_day", ya: 2024, yb: 2025 },
            { label: "Back to School 2023 vs 2024", event: "back_to_school", ya: 2023, yb: 2024 },
            { label: "Super Bowl 2024 vs 2025", event: "super_bowl", ya: 2024, yb: 2025 },
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
