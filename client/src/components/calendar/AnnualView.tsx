import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { CalendarEventRow, getWeeksInYear, chipClass, MONTH_NAMES } from "@/lib/calendarUtils";
import { format, isSameMonth } from "date-fns";
import { toast } from "sonner";

interface Props {
  year: number;
  campusId?: number;
  onEventClick: (event: CalendarEventRow) => void;
  onCellClick: (date: Date) => void;
  onRefresh: () => void;
}

export function AnnualView({ year, campusId, onEventClick, onCellClick, onRefresh }: Props) {
  const weeks = getWeeksInYear(year);
  const ministriesQuery = trpc.calendar.getMinistries.useQuery();
  const eventsQuery = trpc.calendar.getEvents.useQuery({ year, campusId });
  const moveMutation = trpc.calendar.moveEvent.useMutation({
    onSuccess: (data) => {
      if (data.conflicts && data.conflicts.length > 0) {
        toast.warning(`Event moved — ${data.conflicts.length} conflict(s) detected`);
      } else {
        toast.success("Event rescheduled");
      }
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const [dragging, setDragging] = useState<{ eventId: number; originalStart: Date; originalEnd: Date } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const ministries = ministriesQuery.data ?? [];
  const events = eventsQuery.data ?? [];

  // Group events by weekNumber + ministryId
  const eventMap = new Map<string, CalendarEventRow[]>();
  for (const row of events) {
    const d = new Date(row.event.startDate);
    const wk = weeks.findIndex((w) => d >= w.startDate && d <= w.endDate);
    if (wk === -1) continue;
    const key = `${wk}-${row.event.ministryId}`;
    if (!eventMap.has(key)) eventMap.set(key, []);
    eventMap.get(key)!.push(row);
  }

  // Month header spans
  const monthSpans: { month: number; label: string; start: number; span: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, i) => {
    const m = w.startDate.getMonth();
    if (m !== lastMonth) {
      monthSpans.push({ month: m, label: MONTH_NAMES[m], start: i, span: 1 });
      lastMonth = m;
    } else {
      monthSpans[monthSpans.length - 1].span++;
    }
  });

  const handleDragStart = (e: React.DragEvent, row: CalendarEventRow) => {
    setDragging({
      eventId: row.event.id,
      originalStart: new Date(row.event.startDate),
      originalEnd: new Date(row.event.endDate),
    });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e: React.DragEvent, weekIdx: number, ministryId: number) => {
    e.preventDefault();
    if (!dragging) return;
    const targetWeek = weeks[weekIdx];
    if (!targetWeek) return;

    const duration = dragging.originalEnd.getTime() - dragging.originalStart.getTime();
    const newStart = new Date(targetWeek.startDate);
    newStart.setHours(dragging.originalStart.getHours(), dragging.originalStart.getMinutes());
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

  if (eventsQuery.isLoading || ministriesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <div style={{ minWidth: `${140 + weeks.length * 82}px` }}>
        {/* Month header row */}
        <div className="flex sticky top-0 z-20 bg-background">
          <div className="w-[140px] shrink-0 border-b border-r border-border" />
          {monthSpans.map((ms) => (
            <div
              key={ms.month}
              className="border-b border-r border-border text-center py-1.5"
              style={{ width: `${ms.span * 82}px`, minWidth: `${ms.span * 82}px` }}
            >
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {ms.label}
              </span>
            </div>
          ))}
        </div>

        {/* Week number header */}
        <div className="flex sticky top-[33px] z-20 bg-background">
          <div className="w-[140px] shrink-0 border-b border-r border-border px-3 py-1 text-xs text-muted-foreground font-medium">
            Ministry
          </div>
          {weeks.map((w, i) => (
            <div
              key={i}
              className="border-b border-r border-border text-center py-1 cursor-pointer hover:bg-secondary/50 transition-colors"
              style={{ width: "82px", minWidth: "82px" }}
              onClick={() => onCellClick(w.startDate)}
            >
              <div className="text-[10px] text-muted-foreground font-medium">{w.label}</div>
              <div className="text-[9px] text-muted-foreground/60">
                {format(w.startDate, "M/d")}
              </div>
            </div>
          ))}
        </div>

        {/* Ministry rows */}
        {ministries.map((ministry) => (
          <div key={ministry.id} className="flex group hover:bg-secondary/20 transition-colors">
            {/* Ministry label */}
            <div
              className="w-[140px] shrink-0 border-b border-r border-border px-3 py-2 flex items-center gap-2"
              style={{ borderLeft: `3px solid ${ministry.color}` }}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ministry.color }} />
              <span className="text-xs font-medium text-foreground truncate">{ministry.name}</span>
            </div>

            {/* Week cells */}
            {weeks.map((w, wIdx) => {
              const key = `${wIdx}-${ministry.id}`;
              const cellEvents = eventMap.get(key) ?? [];
              const isDragTarget = dragOver === key;

              return (
                <div
                  key={wIdx}
                  className={`border-b border-r border-border py-1 px-0.5 min-h-[44px] cursor-pointer transition-colors ${isDragTarget ? "drag-over" : "hover:bg-secondary/30"}`}
                  style={{ width: "82px", minWidth: "82px" }}
                  onClick={() => cellEvents.length === 0 && onCellClick(w.startDate)}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, wIdx, ministry.id)}
                >
                  <div className="space-y-0.5">
                    {cellEvents.slice(0, 2).map((row) => (
                      <div
                        key={row.event.id}
                        draggable={row.event.status !== "locked"}
                        onDragStart={(e) => handleDragStart(e, row)}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        className={`${chipClass(row.event.status as any)} w-full text-[10px] leading-tight`}
                        style={{
                          backgroundColor: (row.ministry?.color ?? "#6B7280") + "33",
                          color: row.ministry?.color ?? "#6B7280",
                          borderColor: (row.ministry?.color ?? "#6B7280") + "55",
                        }}
                        onClick={(e) => { e.stopPropagation(); onEventClick(row); }}
                        title={row.event.title}
                      >
                        {row.event.title}
                      </div>
                    ))}
                    {cellEvents.length > 2 && (
                      <div
                        className="text-[9px] text-muted-foreground px-1 cursor-pointer hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); onEventClick(cellEvents[0]); }}
                      >
                        +{cellEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
