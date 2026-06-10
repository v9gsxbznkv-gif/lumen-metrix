import { and, eq, gte, lte, or, desc, asc, ne, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  calendarEvents,
  calendarMinistries,
  calendarCampuses,
  calendarConflicts,
  calendarApprovalHistory,
  calendarStaffMembers,
  calendarStaffTimeOff,
  calendarCoverageRules,
  calendarBlackoutDates,
  InsertCalendarEvent,
  InsertCalendarBlackoutDate,
} from "../../drizzle/schema";

// ─── Campuses ─────────────────────────────────────────────────────────────────
export async function getCampuses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendarCampuses).orderBy(asc(calendarCampuses.name));
}

// ─── Ministries ───────────────────────────────────────────────────────────────
export async function getMinistries() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(calendarMinistries).orderBy(asc(calendarMinistries.sortOrder));
}

// ─── Events ───────────────────────────────────────────────────────────────────
export async function getEvents(filters: {
  campusId?: number;
  ministryId?: number;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  year?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.campusId) conditions.push(eq(calendarEvents.campusId, filters.campusId));
  if (filters.ministryId) conditions.push(eq(calendarEvents.ministryId, filters.ministryId));
  if (filters.status) conditions.push(eq(calendarEvents.status, filters.status as any));
  if (filters.startDate) conditions.push(gte(calendarEvents.startDate, filters.startDate));
  if (filters.endDate) conditions.push(lte(calendarEvents.startDate, filters.endDate));
  if (filters.year) {
    const yearStart = new Date(filters.year, 0, 1);
    const yearEnd = new Date(filters.year, 11, 31, 23, 59, 59);
    conditions.push(gte(calendarEvents.startDate, yearStart));
    conditions.push(lte(calendarEvents.startDate, yearEnd));
  }

  const rows = await db
    .select({
      event: calendarEvents,
      ministry: calendarMinistries,
      campus: calendarCampuses,
    })
    .from(calendarEvents)
    .leftJoin(calendarMinistries, eq(calendarEvents.ministryId, calendarMinistries.id))
    .leftJoin(calendarCampuses, eq(calendarEvents.campusId, calendarCampuses.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(calendarEvents.startDate));

  return rows;
}

export async function getEventById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      event: calendarEvents,
      ministry: calendarMinistries,
      campus: calendarCampuses,
    })
    .from(calendarEvents)
    .leftJoin(calendarMinistries, eq(calendarEvents.ministryId, calendarMinistries.id))
    .leftJoin(calendarCampuses, eq(calendarEvents.campusId, calendarCampuses.id))
    .where(eq(calendarEvents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createEvent(data: InsertCalendarEvent) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(calendarEvents).values(data);
  return (result as any).insertId as number;
}

export async function updateEvent(id: number, data: Partial<InsertCalendarEvent>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(calendarEvents).set(data).where(eq(calendarEvents.id, id));
}

export async function deleteEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
}

// ─── Conflict Detection ───────────────────────────────────────────────────────
export async function detectConflicts(
  eventId: number,
  campusId: number,
  ministryId: number,
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) return [];

  const conflicts: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    conflictingEventId?: number;
    message: string;
  }> = [];

  // 1. Same ministry, same date
  const sameDayStart = new Date(startDate);
  sameDayStart.setHours(0, 0, 0, 0);
  const sameDayEnd = new Date(startDate);
  sameDayEnd.setHours(23, 59, 59, 999);

  const sameMinistryEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.ministryId, ministryId),
        eq(calendarEvents.campusId, campusId),
        gte(calendarEvents.startDate, sameDayStart),
        lte(calendarEvents.startDate, sameDayEnd),
        ne(calendarEvents.id, eventId),
        ne(calendarEvents.status, "rejected" as any)
      )
    );

  if (sameMinistryEvents.length > 0) {
    conflicts.push({
      type: "same_ministry_same_date",
      severity: "warning",
      conflictingEventId: sameMinistryEvents[0].id,
      message: `Ministry already has an event on this date: "${sameMinistryEvents[0].title}"`,
    });
  }

  // 2. Ministry overload: 3+ ministries with events on same weekend
  const weekStart = new Date(startDate);
  const day = weekStart.getDay();
  const daysToSat = day === 6 ? 0 : 6 - day;
  const daysToSun = day === 0 ? 0 : 7 - day;
  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    const weekendStart = new Date(startDate);
    weekendStart.setDate(weekendStart.getDate() - (day === 0 ? 1 : 0));
    weekendStart.setHours(0, 0, 0, 0);
    const weekendEnd = new Date(weekendStart);
    weekendEnd.setDate(weekendEnd.getDate() + (day === 0 ? 1 : 2));
    weekendEnd.setHours(23, 59, 59, 999);

    const weekendEvents = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.campusId, campusId),
          gte(calendarEvents.startDate, weekendStart),
          lte(calendarEvents.startDate, weekendEnd),
          ne(calendarEvents.id, eventId),
          ne(calendarEvents.status, "rejected" as any)
        )
      );

    const uniqueMinistries = new Set(weekendEvents.map((e) => e.ministryId));
    uniqueMinistries.add(ministryId);
    if (uniqueMinistries.size >= 3) {
      conflicts.push({
        type: "ministry_overload",
        severity: "critical",
        message: `${uniqueMinistries.size} ministries have events this weekend — high load alert`,
      });
    }
  }

  // 3. Room/location overlap (same location, overlapping time)
  // (simplified: check same campus, overlapping time window)
  const timeOverlap = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.campusId, campusId),
        ne(calendarEvents.id, eventId),
        ne(calendarEvents.status, "rejected" as any),
        lte(calendarEvents.startDate, endDate),
        gte(calendarEvents.endDate, startDate)
      )
    );

  if (timeOverlap.length > 0) {
    for (const overlap of timeOverlap) {
      if (overlap.ministryId !== ministryId) {
        conflicts.push({
          type: "room_overlap",
          severity: "info",
          conflictingEventId: overlap.id,
          message: `Time overlap with "${overlap.title}" at same campus`,
        });
        break;
      }
    }
  }

  return conflicts;
}

export async function saveConflicts(
  eventId: number,
  conflicts: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    conflictingEventId?: number;
    message: string;
  }>
) {
  const db = await getDb();
  if (!db) return;
  // Clear old unresolved conflicts for this event
  await db
    .delete(calendarConflicts)
    .where(and(eq(calendarConflicts.eventAId, eventId), eq(calendarConflicts.resolved, false)));

  for (const c of conflicts) {
    await db.insert(calendarConflicts).values({
      eventAId: eventId,
      eventBId: c.conflictingEventId ?? null,
      conflictType: c.type as any,
      severity: c.severity,
      resolved: false,
      notes: c.message,
    });
  }
}

export async function getConflicts(filters: { resolved?: boolean; campusId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.resolved !== undefined) conditions.push(eq(calendarConflicts.resolved, filters.resolved));
  return db
    .select({
      conflict: calendarConflicts,
      eventA: calendarEvents,
    })
    .from(calendarConflicts)
    .leftJoin(calendarEvents, eq(calendarConflicts.eventAId, calendarEvents.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(calendarConflicts.createdAt));
}

// ─── Approval History ─────────────────────────────────────────────────────────
export async function getApprovalHistory(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(calendarApprovalHistory)
    .where(eq(calendarApprovalHistory.eventId, eventId))
    .orderBy(asc(calendarApprovalHistory.createdAt));
}

export async function addApprovalHistory(data: {
  eventId: number;
  action: string;
  actorName?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(calendarApprovalHistory).values({
    eventId: data.eventId,
    action: data.action as any,
    actorName: data.actorName,
    notes: data.notes,
  });
}

export async function getPendingApprovals() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      event: calendarEvents,
      ministry: calendarMinistries,
      campus: calendarCampuses,
    })
    .from(calendarEvents)
    .leftJoin(calendarMinistries, eq(calendarEvents.ministryId, calendarMinistries.id))
    .leftJoin(calendarCampuses, eq(calendarEvents.campusId, calendarCampuses.id))
    .where(eq(calendarEvents.status, "pending_approval"))
    .orderBy(asc(calendarEvents.startDate));
}

// ─── Staff ────────────────────────────────────────────────────────────────────
export async function getStaffMembers(campusId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = campusId ? [eq(calendarStaffMembers.campusId, campusId)] : [];
  return db
    .select()
    .from(calendarStaffMembers)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(calendarStaffMembers.name));
}

export async function getTimeOffRequests(filters: { staffId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.staffId) conditions.push(eq(calendarStaffTimeOff.staffId, filters.staffId));
  if (filters.status) conditions.push(eq(calendarStaffTimeOff.status, filters.status as any));
  return db
    .select({
      timeOff: calendarStaffTimeOff,
      staff: calendarStaffMembers,
    })
    .from(calendarStaffTimeOff)
    .leftJoin(calendarStaffMembers, eq(calendarStaffTimeOff.staffId, calendarStaffMembers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(calendarStaffTimeOff.createdAt));
}

export async function createTimeOffRequest(data: {
  staffId: number;
  startDate: string;
  endDate: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(calendarStaffTimeOff).values({
    staffId: data.staffId,
    startDate: data.startDate as any,
    endDate: data.endDate as any,
    notes: data.notes,
    status: "pending",
  });
}

export async function updateTimeOffStatus(id: number, status: "approved" | "denied") {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(calendarStaffTimeOff).set({ status }).where(eq(calendarStaffTimeOff.id, id));
}

// ─── Blackout Dates ───────────────────────────────────────────────────────────
export async function getBlackoutDates(filters?: { campusId?: number; startDate?: string; endDate?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.campusId) {
    // campus-specific OR all-campus (null campusId)
    conditions.push(or(eq(calendarBlackoutDates.campusId, filters.campusId), isNull(calendarBlackoutDates.campusId)));
  }
  if (filters?.startDate) conditions.push(lte(calendarBlackoutDates.startDate as any, filters.endDate ?? filters.startDate));
  if (filters?.endDate) conditions.push(gte(calendarBlackoutDates.endDate as any, filters.startDate ?? filters.endDate));
  const rows = await db
    .select({ blackout: calendarBlackoutDates, campus: calendarCampuses })
    .from(calendarBlackoutDates)
    .leftJoin(calendarCampuses, eq(calendarBlackoutDates.campusId, calendarCampuses.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(calendarBlackoutDates.startDate));
  return rows;
}

export async function createBlackoutDate(data: {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  campusId?: number;
  severity?: "info" | "warning" | "critical";
  createdBy?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(calendarBlackoutDates).values({
    title: data.title,
    description: data.description ?? null,
    startDate: data.startDate as any,
    endDate: data.endDate as any,
    campusId: data.campusId ?? null,
    severity: data.severity ?? "warning",
    createdBy: data.createdBy ?? null,
  });
  return result;
}

export async function deleteBlackoutDate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(calendarBlackoutDates).where(eq(calendarBlackoutDates.id, id));
}

export async function updateBlackoutDate(id: number, data: {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  campusId?: number | null;
  severity?: "info" | "warning" | "critical";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Partial<InsertCalendarBlackoutDate> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.startDate !== undefined) update.startDate = data.startDate as any;
  if (data.endDate !== undefined) update.endDate = data.endDate as any;
  if ("campusId" in data) update.campusId = data.campusId ?? null;
  if (data.severity !== undefined) update.severity = data.severity;
  await db.update(calendarBlackoutDates).set(update).where(eq(calendarBlackoutDates.id, id));
}

export async function getEventsOnBlackoutDates() {
  const db = await getDb();
  if (!db) return [];
  // Find events whose startDate falls within any blackout date range
  const blackouts = await db.select().from(calendarBlackoutDates);
  if (blackouts.length === 0) return [];

  const conflictingEvents: Array<{ event: typeof calendarEvents.$inferSelect; blackout: typeof calendarBlackoutDates.$inferSelect }> = [];

  for (const blackout of blackouts) {
    const conditions = [
      gte(calendarEvents.startDate, new Date(`${blackout.startDate}T00:00:00`)),
      lte(calendarEvents.startDate, new Date(`${blackout.endDate}T23:59:59`)),
    ];
    if (blackout.campusId) {
      conditions.push(eq(calendarEvents.campusId, blackout.campusId));
    }
    const events = await db.select().from(calendarEvents).where(and(...conditions));
    for (const event of events) {
      conflictingEvents.push({ event, blackout });
    }
  }
  return conflictingEvents;
}

// ─── Ministry CRUD ────────────────────────────────────────────────────────────
export async function createMinistry(data: { name: string; color: string; icon?: string; sortOrder?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(calendarMinistries).values({
    name: data.name,
    color: data.color,
    icon: data.icon ?? "church",
    sortOrder: data.sortOrder ?? 99,
  });
  return (result as any).insertId as number;
}

export async function updateMinistry(id: number, data: Partial<{ name: string; color: string; icon: string; sortOrder: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.color !== undefined) update.color = data.color;
  if (data.icon !== undefined) update.icon = data.icon;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (Object.keys(update).length === 0) return;
  await db.update(calendarMinistries).set(update as any).where(eq(calendarMinistries.id, id));
}

export async function deleteMinistry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Check if any events use this ministry
  const events = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.ministryId, id)).limit(1);
  if (events.length > 0) throw new Error("Cannot delete ministry with existing events");
  await db.delete(calendarMinistries).where(eq(calendarMinistries.id, id));
}

// ─── Campus CRUD ──────────────────────────────────────────────────────────────
export async function createCampus(data: { name: string; color: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(calendarCampuses).values({ name: data.name, color: data.color });
  return (result as any).insertId as number;
}

export async function updateCampus(id: number, data: Partial<{ name: string; color: string }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.color !== undefined) update.color = data.color;
  if (Object.keys(update).length === 0) return;
  await db.update(calendarCampuses).set(update as any).where(eq(calendarCampuses.id, id));
}

export async function deleteCampus(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Check if any events use this campus
  const events = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.campusId, id)).limit(1);
  if (events.length > 0) throw new Error("Cannot delete campus with existing events");
  await db.delete(calendarCampuses).where(eq(calendarCampuses.id, id));
}
