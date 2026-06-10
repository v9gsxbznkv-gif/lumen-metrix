import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CalendarEventRow, getMonthDays, chipClass, DAY_NAMES } from "@/lib/calendarUtils";
import { format, isSameMonth, isToday, addDays } from "date-fns";
import { toast } from "sonner";

interface Props {
  year: number;
  month: number;
  campusId?: number;
  ministryId?: number;
  onEventClick: (event: CalendarEventRow) => void;
  onCellClick: (date: Date) => void;
  onRefresh: () => void;
}

export function MonthlyView({ year, month, campusId, ministryId, onEventClick, onCellClick, onRefresh }: Props) {
  const eventsQuery = trpc.calendar.getEvents.useQuery({ year, month, campusId, ministryId });
  const timeOffQuery = trpc.calendar.getTimeOffRequests.useQuery({ status: "approved" });
  const moveMutation = trpc.calendar.moveEvent.useMutation({
    onSuccess: (data) => {
      if (data.conflicts?.length) toast.warning(`Moved — ${data.conflicts.length} conflict(s)`);
      else toast.success("Event rescheduled");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const [dragging, setDragging] = useState<{ eventId: number; originalStart: Date; originalEnd: Date } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const days = getMonthDays(year, month);
  const firstDay = days[0];
  const startPad = firstDay.getDay();
  const calStart = addDays(firstDay, -startPad);
  const totalCells = Math.ceil((startPad + days.length) / 7) * 7;
  const allCells = Array.from({ length: totalCells }, (_, i) => addDays(calStart, i));

  const events = eventsQuery.data ?? [];
  const approvedTimeOff = timeOffQuery.data ?? [];

  const eventsByDate = new Map<string, CalendarEventRow[]>();
  for (const row of events) {
    const key = format(new Date(row.event.startDate), "yyyy-MM-dd");
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(row);
  }

  const getTimeOffForDate = (date: Date) =>
    approvedTimeOff.filter((req) => {
      const start = new Date(req.timeOff.startDate);
      const end = new Date(req.timeOff.endDate);
      return date >= start && date <= end;
    });

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (!dragging) return;
    const duration = dragging.originalEnd.getTime() - dragging.originalStart.getTime();
    const newStart = new Date(date);
    newStart.setHours(dragging.originalStart.getHours(), dragging.originalStart.getMinutes());
    const newEnd = new Date(newStart.getTime() + duration);
    moveMutation.mutate({ id: dragging.eventId, startDate: newStart.toISOString(), endDate: newEnd.toISOString(), actorName: "Admin" });
    setDragging(null);
    setDragOver(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d.slice(0, 1)}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "minmax(90px, 1fr)" }}>
        {allCells.map((date, i) => {
          const key = format(date, "yyyy-MM-dd");
          const cellEvents = eventsByDate.get(key) ?? [];
          const inMonth = isSameMonth(date, new Date(year, month, 1));
          const today = isToday(date);
          const isDragTarget = dragOver === key;
          const timeOffList = getTimeOffForDate(date);
          const hasTimeOff = timeOffList.length > 0;

          return (
            <div
              key={i}
              className={`border-b border-r border-border p-1 sm:p-1.5 cursor-pointer transition-colors relative overflow-hidden
                ${!inMonth ? "opacity-35" : ""}
                ${isDragTarget ? "bg-primary/8 outline-dashed outline-1 outline-primary" : "hover:bg-secondary/30"}
              `}
              onClick={() => onCellClick(date)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, date)}
            >
              {/* Time-off stripe background */}
              {hasTimeOff && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(196,91,74,0.07) 5px, rgba(196,91,74,0.07) 10px)",
                  }}
                />
              )}

              {/* Date number row */}
              <div className="flex items-center justify-between mb-0.5 relative z-10">
                <span
                  className={`text-[11px] font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full
                    ${today ? "bg-primary text-primary-foreground" : "text-muted-foreground"}
                  `}
                >
                  {format(date, "d")}
                </span>
                {hasTimeOff && (
                  <span
                    className="text-[8px] font-medium px-1 rounded hidden sm:inline"
                    style={{ background: "rgba(196,91,74,0.12)", color: "#C45B4A" }}
                    title={timeOffList.map((r) => r.staff?.name).join(", ")}
                  >
                    {timeOffList.length === 1 ? `${timeOffList[0].staff?.name?.split(" ")[0]} off` : `${timeOffList.length} off`}
                  </span>
                )}
              </div>

              {/* Events */}
              <div className="space-y-0.5 relative z-10">
                {cellEvents.slice(0, 3).map((row) => (
                  <div
                    key={row.event.id}
                    draggable={row.event.status !== "locked"}
                    onDragStart={(e) => {
                      setDragging({ eventId: row.event.id, originalStart: new Date(row.event.startDate), originalEnd: new Date(row.event.endDate) });
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => { setDragging(null); setDragOver(null); }}
                    className={`${chipClass(row.event.status as any)} w-full text-[9px] sm:text-[10px] leading-tight`}
                    style={{
                      backgroundColor: (row.ministry?.color ?? "#6B7280") + "22",
                      color: row.ministry?.color ?? "#6B7280",
                      borderLeft: `2px solid ${row.ministry?.color ?? "#6B7280"}`,
                      borderRadius: "2px",
                      padding: "1px 3px",
                    }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(row); }}
                    title={row.event.title}
                  >
                    {row.event.title}
                  </div>
                ))}
                {cellEvents.length > 3 && (
                  <div className="text-[9px] text-muted-foreground px-0.5">
                    +{cellEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
