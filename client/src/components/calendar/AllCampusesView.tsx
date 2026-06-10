import { trpc } from "@/lib/trpc";
import { CalendarEventRow, DAY_NAMES, MONTH_NAMES, statusLabel } from "@/lib/calendarUtils";
import { addDays, addWeeks, subWeeks, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AllCampusesViewProps {
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  onEventClick: (event: CalendarEventRow) => void;
  onCellClick: (date: Date) => void;
  ministryId?: number;
}

// Ordered campus list: Central first, then Canton, Jasper, Online
const CAMPUS_ORDER = ["Central", "Canton", "Jasper", "Online"];

const CAMPUS_COLORS: Record<string, string> = {
  Central: "#2D9B6F",
  Canton: "#E8913A",
  Jasper: "#6366f1",
  Online: "#10b981",
};

export function AllCampusesView({ weekStart, onWeekChange, onEventClick, onCellClick, ministryId }: AllCampusesViewProps) {
  const campusesQuery = trpc.calendar.getCampuses.useQuery();
  const campuses = campusesQuery.data ?? [];

  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  // Sort campuses in the desired order
  const orderedCampuses = CAMPUS_ORDER
    .map((name) => campuses.find((c) => c.name === name))
    .filter(Boolean) as typeof campuses;

  // Fetch events for Central campus
  const centralQuery = trpc.calendar.getEvents.useQuery({
    campusId: campuses.find((c) => c.name === "Central")?.id,
    ministryId,
    startDate: startStr,
    endDate: endStr,
  }, { enabled: campuses.length > 0 });

  // Fetch events for Canton campus
  const cantonQuery = trpc.calendar.getEvents.useQuery({
    campusId: campuses.find((c) => c.name === "Canton")?.id,
    ministryId,
    startDate: startStr,
    endDate: endStr,
  }, { enabled: campuses.length > 0 });

  // Fetch events for Jasper campus
  const jasperQuery = trpc.calendar.getEvents.useQuery({
    campusId: campuses.find((c) => c.name === "Jasper")?.id,
    ministryId,
    startDate: startStr,
    endDate: endStr,
  }, { enabled: campuses.length > 0 });

  // Fetch events for Online campus
  const onlineQuery = trpc.calendar.getEvents.useQuery({
    campusId: campuses.find((c) => c.name === "Online")?.id,
    ministryId,
    startDate: startStr,
    endDate: endStr,
  }, { enabled: campuses.length > 0 });

  const campusData = [
    { name: "Central", query: centralQuery },
    { name: "Canton", query: cantonQuery },
    { name: "Jasper", query: jasperQuery },
    { name: "Online", query: onlineQuery },
  ];

  const periodLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const getEventsForDay = (events: CalendarEventRow[], day: Date) => {
    const key = format(day, "yyyy-MM-dd");
    return events.filter((e) => {
      const d = format(new Date(e.event.startDate), "yyyy-MM-dd");
      return d === key;
    });
  };

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex flex-col h-full">
      {/* Week nav */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50">
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => onWeekChange(subWeeks(weekStart, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-foreground">{periodLabel}</span>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => onWeekChange(addWeeks(weekStart, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Grid: days as rows, campuses as columns */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-[860px]">
          <thead>
            <tr className="bg-card border-b border-border">
              {/* Day label column */}
              <th className="w-24 px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">Day</th>
              {campusData.map(({ name }) => (
                <th key={name} className="px-3 py-2 text-left border-r border-border last:border-r-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CAMPUS_COLORS[name] ?? "#888" }}
                    />
                    <span className="text-xs font-bold text-foreground">{name}</span>
                    {name === "Central" && (
                      <span className="text-[9px] text-muted-foreground font-normal">(all campuses)</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const isToday = dayKey === today;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              return (
                <tr
                  key={dayKey}
                  className={`border-b border-border ${isWeekend ? "bg-muted/30" : "bg-background"} ${isToday ? "ring-1 ring-inset ring-primary/30" : ""}`}
                >
                  {/* Day label */}
                  <td className="px-3 py-2 border-r border-border align-top w-24">
                    <div className="flex flex-col">
                      <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {DAY_NAMES[day.getDay()]}
                      </span>
                      <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                        {format(day, "d")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{MONTH_NAMES[day.getMonth()].slice(0, 3)}</span>
                    </div>
                  </td>

                  {/* Campus columns */}
                  {campusData.map(({ name, query }) => {
                    const events = getEventsForDay(query.data ?? [], day);
                    const accentColor = CAMPUS_COLORS[name] ?? "#888";

                    return (
                      <td
                        key={name}
                        className="px-2 py-2 border-r border-border last:border-r-0 align-top min-h-[60px] cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => onCellClick(day)}
                      >
                        {query.isLoading ? (
                          <div className="h-4 w-16 bg-muted/50 rounded animate-pulse" />
                        ) : events.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground/40">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {events.map((e) => (
                              <button
                                key={e.event.id}
                                className="text-left w-full group"
                                onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                              >
                                <div
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight truncate transition-opacity group-hover:opacity-80"
                                  style={{
                                    backgroundColor: `${e.ministry?.color ?? accentColor}22`,
                                    borderLeft: `3px solid ${e.ministry?.color ?? accentColor}`,
                                    color: "var(--foreground)",
                                  }}
                                  title={`${e.event.title} — ${statusLabel(e.event.status)}`}
                                >
                                  {e.event.title}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
