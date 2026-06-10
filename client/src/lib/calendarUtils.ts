import { addDays, format, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, getWeek, getYear, parseISO } from "date-fns";

export type EventStatus = "draft" | "pending_approval" | "approved" | "rejected" | "locked";
export type ConflictSeverity = "info" | "warning" | "critical";
export type CalendarView = "annual" | "monthly" | "weekly" | "campuses";

export interface CalendarEventRow {
  event: {
    id: number;
    title: string;
    description: string | null;
    campusId: number;
    ministryId: number;
    location: string | null;
    capacity: number | null;
    startDate: Date;
    endDate: Date;
    isAllDay: boolean;
    status: EventStatus;
    recurrenceGroupId: number | null;
    color: string | null;
    attendeeNotes: string | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  ministry: { id: number; name: string; color: string; icon: string } | null;
  campus: { id: number; name: string; color: string } | null;
}

export interface ConflictAlert {
  id: number;
  type: string;
  severity: ConflictSeverity;
  message: string;
  eventAId: number;
  eventBId: number | null;
  resolved: boolean;
}

// ─── Week generation ──────────────────────────────────────────────────────────
export function getWeeksInYear(year: number) {
  const weeks: { weekNumber: number; startDate: Date; endDate: Date; label: string }[] = [];
  let current = new Date(year, 0, 1);
  // Start from first Sunday of the year (or Jan 1 if it's Sunday)
  while (current.getDay() !== 0) current = addDays(current, 1);

  let weekNum = 1;
  while (current.getFullYear() <= year && weekNum <= 53) {
    const end = addDays(current, 6);
    if (current.getFullYear() === year || end.getFullYear() === year) {
      weeks.push({
        weekNumber: weekNum,
        startDate: new Date(current),
        endDate: new Date(end),
        label: `Wk ${weekNum}`,
      });
    }
    current = addDays(current, 7);
    weekNum++;
    if (current.getFullYear() > year && weekNum > 52) break;
  }
  return weeks.slice(0, 52);
}

// ─── Month days ───────────────────────────────────────────────────────────────
export function getMonthDays(year: number, month: number) {
  const start = startOfMonth(new Date(year, month, 1));
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end });
}

// ─── Weekly days ──────────────────────────────────────────────────────────────
export function getWeekDays(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// ─── Event grouping ───────────────────────────────────────────────────────────
export function groupEventsByDate(events: CalendarEventRow[]) {
  const map = new Map<string, CalendarEventRow[]>();
  for (const row of events) {
    const key = format(new Date(row.event.startDate), "yyyy-MM-dd");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

export function groupEventsByWeek(events: CalendarEventRow[], year: number) {
  const map = new Map<number, CalendarEventRow[]>();
  for (const row of events) {
    const d = new Date(row.event.startDate);
    if (d.getFullYear() !== year) continue;
    const wk = getWeek(d, { weekStartsOn: 0 });
    if (!map.has(wk)) map.set(wk, []);
    map.get(wk)!.push(row);
  }
  return map;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
export function statusLabel(status: EventStatus) {
  const labels: Record<EventStatus, string> = {
    draft: "Draft",
    pending_approval: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    locked: "Locked",
  };
  return labels[status] ?? status;
}

export function statusClass(status: EventStatus) {
  const classes: Record<EventStatus, string> = {
    draft: "status-draft",
    pending_approval: "status-pending",
    approved: "status-approved",
    rejected: "status-rejected",
    locked: "status-locked",
  };
  return classes[status] ?? "status-draft";
}

export function chipClass(status: EventStatus) {
  const classes: Record<EventStatus, string> = {
    draft: "event-chip event-chip--pending",
    pending_approval: "event-chip event-chip--pending",
    approved: "event-chip event-chip--approved",
    rejected: "event-chip event-chip--rejected",
    locked: "event-chip event-chip--locked",
  };
  return classes[status] ?? "event-chip";
}

// ─── Conflict helpers ─────────────────────────────────────────────────────────
export function conflictClass(severity: ConflictSeverity) {
  return `conflict-${severity}`;
}

export function conflictIcon(severity: ConflictSeverity) {
  return severity === "critical" ? "🔴" : severity === "warning" ? "🟡" : "🔵";
}

// ─── Month names ──────────────────────────────────────────────────────────────
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
