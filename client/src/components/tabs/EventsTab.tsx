/*
 * Lumen Metrix — Events Page
 * Key church events with attendance/giving performance, YoY comparisons
 * Uses the church calendar to identify event dates
 */
import { useData } from "@/contexts/DataContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  CAMPUS_COLORS, CHART_COLORS, formatNumber, formatCurrency, MONTH_NAMES,
} from "@/lib/data";
import { CHURCH_EVENTS, type ChurchEvent } from "@/lib/churchCalendar";
import { CalendarDays, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function EventsTab() {
  const { data, filters } = useData();
  if (!data) return null;

  const { campus, yearStart, yearEnd } = filters;
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);

  // Get metrics for an event in a given year
  const getEventMetrics = (event: ChurchEvent, year: number) => {
    const eventDate = event.getDate(year);
    if (!eventDate) return null;
    const month = eventDate.getMonth() + 1;

    // Get monthly data for the event month
    const att = data.attendance_monthly
      .filter((r) => r.year === year && r.month === month && r.subgroup === "Adults" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.total, 0);
    const kids = data.attendance_monthly
      .filter((r) => r.year === year && r.month === month && r.subgroup === "Kids" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.total, 0);
    const giving = data.giving_monthly
      .filter((r) => r.year === year && r.month === month && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.total, 0);
    const ftg = data.next_steps_monthly
      .filter((r) => r.year === year && r.month === month && r.metric === "FTG" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.count, 0);
    const salv = data.next_steps_monthly
      .filter((r) => r.year === year && r.month === month && r.metric === "Salvations" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.count, 0);

    return { attendance: att + kids, giving, ftg, salvations: salv, month };
  };

  // Build event comparison data
  const eventNames = ["Easter Sunday", "Christmas Eve", "Christmas Sunday", "Mother's Day", "Back to School"];
  const eventData = eventNames.map((name) => {
    const event = CHURCH_EVENTS.find((e) => e.name === name);
    if (!event) return null;

    const yearMetrics = years
      .map((y) => {
        const metrics = getEventMetrics(event, y);
        if (!metrics) return null;
        return { year: y, ...metrics };
      })
      .filter(Boolean) as { year: number; attendance: number; giving: number; ftg: number; salvations: number; month: number }[];

    return { name, event, yearMetrics };
  }).filter(Boolean) as { name: string; event: ChurchEvent; yearMetrics: { year: number; attendance: number; giving: number; ftg: number; salvations: number; month: number }[] }[];

  // Easter comparison chart data
  const easterEvent = CHURCH_EVENTS.find((e) => e.name === "Easter Sunday");
  const easterChartData = easterEvent
    ? years
        .map((y) => {
          const m = getEventMetrics(easterEvent, y);
          if (!m) return null;
          return { year: y, Attendance: m.attendance, Giving: Math.round(m.giving), FTG: m.ftg };
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
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Easter Month — Multi-Year Comparison</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={easterChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
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
