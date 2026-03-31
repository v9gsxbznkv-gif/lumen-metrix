/*
 * Lumen Metrix — Events Page
 * Key church events with attendance/giving performance, YoY comparisons
 *
 * Data methodology:
 * - Attendance: uses avgWeekly from attendance_monthly (already = one Sunday's worth)
 * - Giving: divides monthly total by number of Sundays in that month
 * - FTG/Salvations: divides monthly total by number of Sundays in that month
 * - Christmas Season: divides December giving/FTG by 2 (Christmas Eve + Christmas Sunday)
 *   rather than by all December Sundays, since Christmas is a 2-service weekend
 * - Future events (date > today) are hidden
 */
import { useData } from "@/contexts/DataContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  formatNumber, formatCurrency, MONTH_NAMES,
} from "@/lib/data";
import { CHURCH_EVENTS, type ChurchEvent } from "@/lib/churchCalendar";
import { CalendarDays, TrendingUp, TrendingDown } from "lucide-react";

// Today's date for filtering out future events
const TODAY = new Date();

// Spreadsheet subgroup names that represent main service attendance
const SPREADSHEET_ATTENDANCE_SUBGROUPS = new Set(["Adults", "Kids", "Students", "Young Adults"]);

/**
 * Count the number of Sundays in a given year/month.
 */
function countSundaysInMonth(year: number, month: number): number {
  // month is 1-indexed
  const date = new Date(year, month - 1, 1);
  let count = 0;
  while (date.getMonth() === month - 1) {
    if (date.getDay() === 0) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

export default function EventsTab() {
  const { data, filters } = useData();
  if (!data) return null;

  const { campus, yearStart, yearEnd } = filters;
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);

  /**
   * Get per-event metrics for a specific event in a given year.
   * Returns null if the event is in the future or no data exists.
   *
   * isChristmas: when true, divides giving/FTG by 2 (Eve + Sunday) instead of
   * the full Sunday count for December, since Christmas is a 2-service weekend.
   */
  const getEventMetrics = (event: ChurchEvent, year: number, isChristmas = false) => {
    const eventDate = event.getDate(year);
    if (!eventDate) return null;

    // Skip future events — don't show zeros for events that haven't happened yet
    if (eventDate > TODAY) return null;

    const month = eventDate.getMonth() + 1;

    // Number of Sundays in this month — used to convert monthly totals to per-Sunday estimates
    const sundaysInMonth = countSundaysInMonth(year, month);
    // For Christmas Season we divide by 2 services (Christmas Eve + Christmas Sunday)
    // rather than all December Sundays, since the special services dominate December giving
    const givingDivisor = isChristmas ? 2 : sundaysInMonth;
    const stepsDivisor = isChristmas ? 2 : sundaysInMonth;

    // Attendance: use avgWeekly (already = one Sunday's worth) from spreadsheet subgroups
    const att = data.attendance_monthly
      .filter(
        (r) =>
          r.year === year &&
          r.month === month &&
          (campus === "All Campuses" || r.campus === campus) &&
          SPREADSHEET_ATTENDANCE_SUBGROUPS.has(r.subgroup)
      )
      .reduce((s, r) => s + r.avg_weekly, 0);

    // Giving: monthly total ÷ Sundays in month (or ÷ 2 for Christmas)
    const givingMonthly = data.giving_monthly
      .filter((r) => r.year === year && r.month === month && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.total, 0);
    const giving = givingDivisor > 0 ? Math.round(givingMonthly / givingDivisor) : 0;

    // FTG: monthly total ÷ Sundays
    const ftgMonthly = data.next_steps_monthly
      .filter((r) => r.year === year && r.month === month && r.metric === "FTG" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.count, 0);
    const ftg = stepsDivisor > 0 ? Math.round(ftgMonthly / stepsDivisor) : 0;

    // Salvations: monthly total ÷ Sundays
    const salvMonthly = data.next_steps_monthly
      .filter((r) => r.year === year && r.month === month && r.metric === "Salvations" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.count, 0);
    const salvations = stepsDivisor > 0 ? Math.round(salvMonthly / stepsDivisor) : 0;

    return { attendance: att, giving, ftg, salvations, month };
  };

  // Event list — Christmas Eve and Christmas Sunday both fall in December so they share
  // monthly data. We show only "Christmas Season" (using Christmas Eve's date) to avoid
  // displaying identical numbers twice. isChristmas flag triggers ÷2 divisor.
  const EVENT_DISPLAY_LIST: Array<{ name: string; eventId: string; isChristmas?: boolean }> = [
    { name: "Easter Sunday", eventId: "easter" },
    { name: "Christmas Season", eventId: "christmas_eve", isChristmas: true },
    { name: "Mother's Day", eventId: "mothers_day" },
    { name: "Back to School", eventId: "back_to_school" },
  ];

  const eventData = EVENT_DISPLAY_LIST.map(({ name, eventId, isChristmas }) => {
    const event = CHURCH_EVENTS.find((e) => e.id === eventId);
    if (!event) return null;

    const yearMetrics = years
      .map((y) => {
        const metrics = getEventMetrics(event, y, isChristmas);
        if (!metrics) return null;
        return { year: y, ...metrics };
      })
      .filter(Boolean) as { year: number; attendance: number; giving: number; ftg: number; salvations: number; month: number }[];

    if (yearMetrics.length === 0) return null;
    return { name, event, yearMetrics };
  }).filter(Boolean) as { name: string; event: ChurchEvent; yearMetrics: { year: number; attendance: number; giving: number; ftg: number; salvations: number; month: number }[] }[];

  // Easter comparison chart data — only years with non-zero attendance
  const easterEvent = CHURCH_EVENTS.find((e) => e.id === "easter");
  const easterChartData = easterEvent
    ? years
        .map((y) => {
          const m = getEventMetrics(easterEvent, y);
          if (!m || m.attendance === 0) return null;
          return { year: y, Attendance: m.attendance, Giving: Math.round(m.giving / 1000), FTG: m.ftg };
        })
        .filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      {/* Event Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {eventData.map(({ name, yearMetrics }) => {
          const latest = yearMetrics[yearMetrics.length - 1];
          const prior = yearMetrics.length > 1 ? yearMetrics[yearMetrics.length - 2] : null;
          if (!latest) return null;

          const attChange = prior && prior.attendance > 0 ? ((latest.attendance - prior.attendance) / prior.attendance * 100) : null;
          const givChange = prior && prior.giving > 0 ? ((latest.giving - prior.giving) / prior.giving * 100) : null;

          return (
            <div key={name} className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4" style={{ color: "#E8913A" }} />
                <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>{name}</h3>
                <span className="ml-auto text-[10px] text-muted-foreground">{MONTH_NAMES[latest.month - 1]} {latest.year}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Attendance</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(latest.attendance)}</p>
                  {attChange !== null && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {attChange >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                      <span className={`text-[10px] font-medium ${attChange >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {attChange >= 0 ? "+" : ""}{attChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Giving</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatCurrency(latest.giving)}</p>
                  {givChange !== null && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {givChange >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                      <span className={`text-[10px] font-medium ${givChange >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {givChange >= 0 ? "+" : ""}{givChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/30">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">FTG</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(latest.ftg)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Salvations</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(latest.salvations)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Easter Multi-Year Chart */}
      {easterChartData.length > 0 && (
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Easter Sunday — Multi-Year Comparison</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={easterChartData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => `$${v}K`} />
              <Tooltip
                contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  if (name === "Giving") return [`$${value}K`, name];
                  return [formatNumber(value), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="Attendance" fill="#E8913A" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="FTG" fill="#4A7FB5" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="Giving" fill="#4A7C59" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Event History Table */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Event Performance History</h3>
        <p className="text-[10px] text-muted-foreground mb-3">
          Attendance shows one Sunday's average from the event month. Giving and next steps are estimated by dividing the monthly total by the number of Sundays in that month (Christmas Season uses ÷2 for the two Christmas services). Future events are hidden until data is available.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2 text-muted-foreground font-medium">Event</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Year</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Attendance</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Giving</th>
                <th className="text-right py-2 text-muted-foreground font-medium">FTG</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Salvations</th>
              </tr>
            </thead>
            <tbody>
              {eventData.flatMap(({ name, yearMetrics }) =>
                yearMetrics.slice(-3).map((m) => (
                  <tr key={`${name}-${m.year}`} className="border-b border-border/20">
                    <td className="py-2 font-medium">{name}</td>
                    <td className="py-2 text-muted-foreground">{m.year}</td>
                    <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(m.attendance)}</td>
                    <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>{formatCurrency(m.giving)}</td>
                    <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(m.ftg)}</td>
                    <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(m.salvations)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
