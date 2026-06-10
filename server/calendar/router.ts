import { z } from "zod";
import { protectedProcedure, publicProcedure, router, calendarAdminProcedure, staffProcedure } from "../_core/trpc";
import { syncEventToGoogle, deleteEventFromGoogle, isGoogleCalendarConfigured, getRecentSyncLog } from "./googleCalendarSync";
import {
  getCampuses,
  getMinistries,
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  detectConflicts,
  saveConflicts,
  getConflicts,
  getApprovalHistory,
  addApprovalHistory,
  getPendingApprovals,
  getStaffMembers,
  getTimeOffRequests,
  createTimeOffRequest,
  updateTimeOffStatus,
  getBlackoutDates,
  createBlackoutDate,
  deleteBlackoutDate,
  updateBlackoutDate,
  getEventsOnBlackoutDates,
  createMinistry,
  updateMinistry,
  deleteMinistry,
  createCampus,
  updateCampus,
  deleteCampus,
} from "./db";

const eventStatusEnum = z.enum(["draft", "pending_approval", "approved", "rejected", "locked"]);

export const calendarRouter = router({
  // ─── Campuses ───────────────────────────────────────────────────────────────
  getCampuses: publicProcedure.query(async () => {
    return getCampuses();
  }),

  // ─── Ministries ─────────────────────────────────────────────────────────────
  getMinistries: publicProcedure.query(async () => {
    return getMinistries();
  }),

  // ─── Events ─────────────────────────────────────────────────────────────────
  getEvents: publicProcedure
    .input(
      z.object({
        campusId: z.number().optional(),
        ministryId: z.number().optional(),
        year: z.number().optional(),
        month: z.number().optional(), // 0-11
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (input.year && input.month !== undefined) {
        startDate = new Date(input.year, input.month, 1);
        endDate = new Date(input.year, input.month + 1, 0, 23, 59, 59);
      } else if (input.year) {
        startDate = new Date(input.year, 0, 1);
        endDate = new Date(input.year, 11, 31, 23, 59, 59);
      } else if (input.startDate) {
        startDate = new Date(input.startDate);
        endDate = input.endDate ? new Date(input.endDate) : undefined;
      }

      return getEvents({
        campusId: input.campusId,
        ministryId: input.ministryId,
        status: input.status,
        startDate,
        endDate,
        year: input.year && !input.month ? input.year : undefined,
      });
    }),

  getEvent: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getEventById(input.id);
    }),

  createEvent: staffProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        campusId: z.number(),
        ministryId: z.number(),
        location: z.string().optional(),
        capacity: z.number().optional(),
        startDate: z.string(),
        endDate: z.string(),
        isAllDay: z.boolean().default(false),
        status: eventStatusEnum.default("draft"),
        recurrenceGroupId: z.number().optional(),
        color: z.string().optional(),
        attendeeNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await createEvent({
        ...input,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });

      // Run conflict detection
      const conflicts = await detectConflicts(
        id,
        input.campusId,
        input.ministryId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
      if (conflicts.length > 0) {
        await saveConflicts(id, conflicts);
      }

      // Log creation in approval history
      await addApprovalHistory({
        eventId: id,
        action: input.status === "pending_approval" ? "submitted" : "submitted",
        actorName: "System",
        notes: `Event created with status: ${input.status}`,
      });

      return { id, conflicts };
    }),

  updateEvent: staffProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        campusId: z.number().optional(),
        ministryId: z.number().optional(),
        location: z.string().optional(),
        capacity: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        isAllDay: z.boolean().optional(),
        status: eventStatusEnum.optional(),
        color: z.string().optional(),
        attendeeNotes: z.string().optional(),
        actorName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, actorName, ...rest } = input;
      const updateData: any = { ...rest };
      if (rest.startDate) updateData.startDate = new Date(rest.startDate);
      if (rest.endDate) updateData.endDate = new Date(rest.endDate);

      await updateEvent(id, updateData);

      // Sync to Google Calendar if event is already approved
      const updatedEvent = await getEventById(id);
      if (updatedEvent && updatedEvent.event.status === "approved") {
        syncEventToGoogle({
          id: updatedEvent.event.id,
          title: updatedEvent.event.title,
          description: updatedEvent.event.description ?? undefined,
          location: updatedEvent.event.location ?? undefined,
          startDate: updatedEvent.event.startDate,
          endDate: updatedEvent.event.endDate,
          isAllDay: updatedEvent.event.isAllDay,
        }).catch((e) => console.error("[GoogleSync] update failed", e));
      }

      // Re-run conflict detection if dates changed
      if (rest.startDate && rest.endDate && rest.campusId && rest.ministryId) {
        const conflicts = await detectConflicts(
          id,
          rest.campusId,
          rest.ministryId,
          new Date(rest.startDate),
          new Date(rest.endDate)
        );
        await saveConflicts(id, conflicts);
      }

      await addApprovalHistory({
        eventId: id,
        action: "moved",
        actorName: actorName ?? "User",
        notes: rest.startDate ? `Rescheduled to ${rest.startDate}` : "Event updated",
      });

      return { success: true };
    }),

  moveEvent: staffProcedure
    .input(
      z.object({
        id: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        actorName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const event = await getEventById(input.id);
      if (!event) throw new Error("Event not found");
      if (event.event.status === "locked") throw new Error("Cannot move a locked event");

      await updateEvent(input.id, {
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });

      // Sync to Google Calendar if event is already approved
      if (event.event.status === "approved") {
        syncEventToGoogle({
          id: event.event.id,
          title: event.event.title,
          description: event.event.description ?? undefined,
          location: event.event.location ?? undefined,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          isAllDay: event.event.isAllDay,
        }).catch((e) => console.error("[GoogleSync] moveEvent sync failed", e));
      }

      const conflicts = await detectConflicts(
        input.id,
        event.event.campusId,
        event.event.ministryId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
      await saveConflicts(input.id, conflicts);

      await addApprovalHistory({
        eventId: input.id,
        action: "moved",
        actorName: input.actorName ?? "User",
        notes: `Moved to ${input.startDate}`,
      });

      return { success: true, conflicts };
    }),

  deleteEvent: calendarAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Remove from Google Calendar before deleting (non-blocking)
      deleteEventFromGoogle(input.id).catch((e) => console.error("[GoogleSync] delete failed", e));
      await deleteEvent(input.id);
      return { success: true };
    }),

  // ─── Conflicts ──────────────────────────────────────────────────────────────
  getConflicts: publicProcedure
    .input(z.object({ resolved: z.boolean().optional(), campusId: z.number().optional() }))
    .query(async ({ input }) => {
      return getConflicts(input);
    }),

  checkConflicts: publicProcedure
    .input(
      z.object({
        eventId: z.number(),
        campusId: z.number(),
        ministryId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      return detectConflicts(
        input.eventId,
        input.campusId,
        input.ministryId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    }),

  // ─── Approvals ──────────────────────────────────────────────────────────────
  getPendingApprovals: staffProcedure.query(async () => {
    return getPendingApprovals();
  }),

  getApprovalHistory: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      return getApprovalHistory(input.eventId);
    }),

  approveEvent: calendarAdminProcedure
    .input(
      z.object({
        eventId: z.number(),
        actorName: z.string().optional(),
        notes: z.string().optional(),
        lock: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      await updateEvent(input.eventId, {
        status: input.lock ? "locked" : "approved",
        approvedAt: new Date(),
      });
      await addApprovalHistory({
        eventId: input.eventId,
        action: input.lock ? "locked" : "approved",
        actorName: input.actorName ?? "Admin",
        notes: input.notes,
      });
      // Sync to Google Calendar when approved (non-blocking)
      if (!input.lock) {
        const eventRow = await getEventById(input.eventId);
        if (eventRow) {
          syncEventToGoogle({
            id: eventRow.event.id,
            title: eventRow.event.title,
            description: eventRow.event.description,
            location: eventRow.event.location,
            startDate: eventRow.event.startDate,
            endDate: eventRow.event.endDate,
            isAllDay: eventRow.event.isAllDay,
          }).catch((e) => console.error("[GoogleSync] approve failed", e));
        }
      }
      return { success: true };
    }),

  rejectEvent: calendarAdminProcedure
    .input(
      z.object({
        eventId: z.number(),
        reason: z.string().min(1),
        actorName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updateEvent(input.eventId, {
        status: "rejected",
        rejectionReason: input.reason,
      });
      await addApprovalHistory({
        eventId: input.eventId,
        action: "rejected",
        actorName: input.actorName ?? "Admin",
        notes: input.reason,
      });
      // Remove from Google Calendar when rejected (non-blocking)
      deleteEventFromGoogle(input.eventId).catch((e) => console.error("[GoogleSync] reject/delete failed", e));
      return { success: true };
    }),

  submitForApproval: staffProcedure
    .input(z.object({ eventId: z.number(), actorName: z.string().optional() }))
    .mutation(async ({ input }) => {
      await updateEvent(input.eventId, { status: "pending_approval" });
      await addApprovalHistory({
        eventId: input.eventId,
        action: "submitted",
        actorName: input.actorName ?? "Ministry Leader",
        notes: "Submitted for approval",
      });
      return { success: true };
    }),

  addComment: staffProcedure
    .input(
      z.object({
        eventId: z.number(),
        comment: z.string().min(1),
        actorName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await addApprovalHistory({
        eventId: input.eventId,
        action: "comment",
        actorName: input.actorName ?? "User",
        notes: input.comment,
      });
      return { success: true };
    }),

  // ─── Staff ──────────────────────────────────────────────────────────────────
  getStaff: publicProcedure
    .input(z.object({ campusId: z.number().optional() }))
    .query(async ({ input }) => {
      return getStaffMembers(input.campusId);
    }),

  getTimeOffRequests: publicProcedure
    .input(z.object({ staffId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      return getTimeOffRequests(input);
    }),

  requestTimeOff: publicProcedure
    .input(
      z.object({
        staffId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await createTimeOffRequest(input);
      return { success: true };
    }),

  updateTimeOffStatus: calendarAdminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["approved", "denied"]),
      })
    )
    .mutation(async ({ input }) => {
      await updateTimeOffStatus(input.id, input.status);
      return { success: true };
    }),

  // ─── Blackout Dates ─────────────────────────────────────────────────────────
  getBlackoutDates: publicProcedure
    .input(z.object({ campusId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return getBlackoutDates(input ?? {});
    }),

  createBlackoutDate: calendarAdminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        startDate: z.string(),
        endDate: z.string(),
        campusId: z.number().optional(),
        severity: z.enum(["info", "warning", "critical"]).optional(),
        createdBy: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await createBlackoutDate(input);
      return { success: true };
    }),

  updateBlackoutDate: calendarAdminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        campusId: z.number().nullable().optional(),
        severity: z.enum(["info", "warning", "critical"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateBlackoutDate(id, data);
      return { success: true };
    }),

  deleteBlackoutDate: calendarAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteBlackoutDate(input.id);
      return { success: true };
    }),

  getEventsOnBlackoutDates: publicProcedure.query(async () => {
    return getEventsOnBlackoutDates();
  }),

  // ─── iCal Export ────────────────────────────────────────────────────────────
  exportIcal: publicProcedure
    .input(
      z.object({
        campusId: z.number().optional(),
        ministryId: z.number().optional(),
        year: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const events = await getEvents({
        campusId: input.campusId,
        ministryId: input.ministryId,
        year: input.year,
        status: "approved",
      });

      const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LumenMetrix//Smart Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:LumenMetrix Church Calendar",
        "X-WR-TIMEZONE:America/New_York",
      ];

      for (const { event, ministry, campus } of events) {
        const uid = `lumenmetrix-${event.id}@lumenmetrix.com`;
        const dtStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const dtStart = event.isAllDay
          ? `DTSTART;VALUE=DATE:${event.startDate.toISOString().split("T")[0].replace(/-/g, "")}`
          : `DTSTART;TZID=America/New_York:${event.startDate.toISOString().replace(/[-:]/g, "").split(".")[0]}`;
        const dtEnd = event.isAllDay
          ? `DTEND;VALUE=DATE:${event.endDate.toISOString().split("T")[0].replace(/-/g, "")}`
          : `DTEND;TZID=America/New_York:${event.endDate.toISOString().replace(/[-:]/g, "").split(".")[0]}`;

        const summary = event.title.replace(/,/g, "\\,").replace(/;/g, "\\;");
        const desc = [
          ministry ? `Ministry: ${ministry.name}` : "",
          campus ? `Campus: ${campus.name}` : "",
          event.description ?? "",
        ].filter(Boolean).join(" | ").replace(/,/g, "\\,").replace(/;/g, "\\;");

        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${uid}`);
        lines.push(`DTSTAMP:${dtStamp}`);
        lines.push(dtStart);
        lines.push(dtEnd);
        lines.push(`SUMMARY:${summary}`);
        if (desc) lines.push(`DESCRIPTION:${desc}`);
        if (event.location) lines.push(`LOCATION:${event.location.replace(/,/g, "\\,")}`);
        lines.push("END:VEVENT");
      }

      lines.push("END:VCALENDAR");
      return { ics: lines.join("\r\n"), count: events.length };
    }),

  // ─── Weekly Event Counts (for dashboard bar chart) ────────────────────────
  getWeeklyEventCounts: publicProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const yearStart = new Date(input.year, 0, 1);
      const yearEnd = new Date(input.year, 11, 31, 23, 59, 59);
      const events = await getEvents({ startDate: yearStart, endDate: yearEnd });
      const ministries = await getMinistries();

      // Build a map: weekKey (YYYY-WW) → ministryId → count
      const weekMap = new Map<string, Record<string, number>>();

      for (const { event } of events) {
        const d = new Date(event.startDate);
        // ISO week number
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
        const weekKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
        const weekStart = new Date(jan1);
        weekStart.setDate(jan1.getDate() + (weekNum - 1) * 7 - jan1.getDay());

        if (!weekMap.has(weekKey)) weekMap.set(weekKey, {});
        const bucket = weekMap.get(weekKey)!;
        const mKey = event.ministryId ? String(event.ministryId) : "other";
        bucket[mKey] = (bucket[mKey] ?? 0) + 1;
      }

      // Convert to sorted array of week objects
      const weeks = Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekKey, counts]) => {
          const total = Object.values(counts).reduce((s, v) => s + v, 0);
          return { weekKey, counts, total };
        });

      return { weeks, ministries };
    }),

  // ─── Google Calendar Status ───────────────────────────────────────────────
  getGoogleCalendarStatus: publicProcedure.query(async () => {
    const configured = isGoogleCalendarConfigured();
    const recentLog = configured ? await getRecentSyncLog(10) : [];
    return {
      configured,
      calendarId: configured ? process.env.GOOGLE_CALENDAR_ID : null,
      recentLog,
    };
  }),

  // ─── Ministry CRUD ─────────────────────────────────────────────────────────
  createMinistry: calendarAdminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      icon: z.string().optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await createMinistry(input);
      return { success: true, id };
    }),

  updateMinistry: calendarAdminProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      icon: z.string().optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateMinistry(id, data);
      return { success: true };
    }),

  deleteMinistry: calendarAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteMinistry(input.id);
      return { success: true };
    }),

  // ─── Campus CRUD ──────────────────────────────────────────────────────────
  createCampus: calendarAdminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    }))
    .mutation(async ({ input }) => {
      const id = await createCampus(input);
      return { success: true, id };
    }),

  updateCampus: calendarAdminProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateCampus(id, data);
      return { success: true };
    }),

  deleteCampus: calendarAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteCampus(input.id);
      return { success: true };
    }),

  // ─── Dashboard Summary ──────────────────────────────────────────────────────
  getDashboardSummary: publicProcedure.query(async () => {
    const now = new Date();
    const twoWeeksOut = new Date(now);
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

    const [upcomingRows, pendingRows, conflictRows] = await Promise.all([
      getEvents({ startDate: now, endDate: twoWeeksOut }),
      getPendingApprovals(),
      getConflicts({ resolved: false }),
    ]);

    return {
      upcomingEvents: upcomingRows.slice(0, 10),
      pendingApprovals: pendingRows,
      unresolvedConflicts: conflictRows,
    };
  }),
});
