import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CalendarEventRow, getWeekDays, chipClass, DAY_NAMES_FULL } from "@/lib/calendarUtils";
import { format, isToday, isSameDay } from "date-fns";
import { toast } from "sonner";

interface Props {
  weekStart: Date;
  campusId?: number;
  ministryId?: number;
  onEventClick: (event: CalendarEventRow) => void;
  onCellClick: (date: Date) => void;
  onRefresh: () => void;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am–9pm

export function WeeklyView({ weekStart, campusId, ministryId, onEventClick, onCellClick, onRefresh }: Props) {
  const days = getWeekDays(weekStart);
  const startDate = days[0].toISOString();
  const endDate = new Date(days[6].getTime() + 86399999).toISOString();

  const eventsQuery = trpc.calendar.getEvents.useQuery({ startDate, endDate, campusId, ministryId });
  const timeOffQuery = trpc.calendar.getTimeOffRequests.useQuery({ status: "approved" });
  const moveMutation = trpc.calendar.moveEvent.useMutation({
    onSuccess: (data) => {
      if (data.conflicts?.length) toast.warning(`Moved — ${data.conflicts.length} conflict(s) detected`);
      else toast.success("Event rescheduled");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const [dragging, setDragging] = useState<{ eventId: number; originalStart: Date; originalEnd: Date } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const events = eventsQuery.data ?? [];
  const approvedTimeOff = timeOffQuery.data ?? [];

  // Group events by day
  const eventsByDay = new Map<string, CalendarEventRow[]>();
  for (const row of events) {
    const key = format(new Date(row.event.startDate), "yyyy-MM-dd");
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(row);
  }

  // Check if a day has approved time-off
  const getDayTimeOff = (day: Date) => {
    return approvedTimeOff.filter((req) => {
      const start = new Date(req.timeOff.startDate);
      const end = new Date(req.timeOff.endDate);
      return day >= start && day <= end;
    });
  };

  const handleDrop = (e: React.DragEvent, date: Date, hour: number) => {
    e.preventDefault();
    if (!dragging) return;
    const duration = dragging.originalEnd.getTime() - dragging.originalStart.getTime();
    const newStart = new Date(date);
    newStart.setHours(hour, 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);
    moveMutation.mutate({
      id: dragging.eventId,
      startDate: newStart.toISOString(),
      endDate: newEnd.toISOString(),
      actorName: "Admin",
    });
    setDragging(null);
    setDragOver(null);
  };

  return (
    <div className="overflow-auto">
      <div style={{ minWidth: "560px" }}>
        {/* Day headers */}
        <div
          className="grid sticky top-0 z-10 border-b border-border"
          style={{ gridTemplateColumns: "52px repeat(7, 1fr)", background: "var(--background)" }}
        >
          <div className="border-r border-border" />
          {days.map((day, i) => {
            const timeOffToday = getDayTimeOff(day);
            const hasTimeOff = timeOffToday.length > 0;
            return (
              <div
                key={i}
                className="py-2 px-1 border-r border-border last:border-r-0 text-center cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => onCellClick(day)}
              >
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {DAY_NAMES_FULL[i].slice(0, 3)}
                </div>
                <div
                  className={`text-base font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full mt-0.5
                    ${isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"}
                  `}
                >
                  {format(day, "d")}
                </div>
                {hasTimeOff && (
                  <div className="mt-0.5 text-[9px] font-medium px-1 py-0.5 rounded" style={{ background: "rgba(196,91,74,0.1)", color: "#C45B4A" }}>
                    {timeOffToday.length === 1
                      ? `${timeOffToday[0].staff?.name?.split(" ")[0]} off`
                      : `${timeOffToday.length} staff off`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid border-b border-border"
              style={{ gridTemplateColumns: "52px repeat(7, 1fr)", minHeight: "48px" }}
            >
              {/* Hour label */}
              <div className="border-r border-border px-1.5 pt-1 shrink-0">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`}
                </span>
              </div>

              {/* Day cells */}
              {days.map((day, di) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const cellKey = `${dayKey}-${hour}`;
                const dayEvents = (eventsByDay.get(dayKey) ?? []).filter((row) => {
                  const h = new Date(row.event.startDate).getHours();
                  return h === hour;
                });
                const isDragTarget = dragOver === cellKey;
                const timeOffNow = getDayTimeOff(day);
                const hasTimeOff = timeOffNow.length > 0;

                return (
                  <div
                    key={di}
                    className={`border-r border-border last:border-r-0 p-0.5 cursor-pointer transition-colors relative
                      ${isDragTarget ? "bg-primary/10 outline-dashed outline-1 outline-primary" : "hover:bg-secondary/20"}
                    `}
                    style={hasTimeOff ? { background: "rgba(196,91,74,0.04)" } : undefined}
                    onClick={() => {
                      const d = new Date(day);
                      d.setHours(hour, 0, 0, 0);
                      onCellClick(d);
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(cellKey); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => handleDrop(e, day, hour)}
                  >
                    {/* Time-off stripe overlay */}
                    {hasTimeOff && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(196,91,74,0.06) 4px, rgba(196,91,74,0.06) 8px)",
                        }}
                      />
                    )}

                    {dayEvents.map((row) => (
                      <div
                        key={row.event.id}
                        draggable={row.event.status !== "locked"}
                        onDragStart={(e) => {
                          setDragging({
                            eventId: row.event.id,
                            originalStart: new Date(row.event.startDate),
                            originalEnd: new Date(row.event.endDate),
                          });
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        className={`${chipClass(row.event.status as any)} w-full text-[10px] mb-0.5 relative z-10`}
                        style={{
                          backgroundColor: (row.ministry?.color ?? "#6B7280") + "22",
                          color: row.ministry?.color ?? "#6B7280",
                          borderLeft: `2px solid ${row.ministry?.color ?? "#6B7280"}`,
                          borderRadius: "3px",
                          padding: "1px 4px",
                        }}
                        onClick={(e) => { e.stopPropagation(); onEventClick(row); }}
                        title={row.event.title}
                      >
                        <span className="font-semibold">{format(new Date(row.event.startDate), "h:mm a")}</span>
                        {" "}{row.event.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Time-off legend (if any this week) */}
        {days.some((d) => getDayTimeOff(d).length > 0) && (
          <div className="px-4 py-2 border-t border-border flex items-center gap-2">
            <div
              className="w-4 h-3 rounded-sm"
              style={{
                backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(196,91,74,0.2) 3px, rgba(196,91,74,0.2) 6px)",
                border: "1px solid rgba(196,91,74,0.3)",
              }}
            />
            <span className="text-[11px] text-muted-foreground">Approved staff time-off</span>
          </div>
        )}
      </div>
    </div>
  );
}
