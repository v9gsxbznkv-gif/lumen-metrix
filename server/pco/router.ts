/**
 * PCO Integration tRPC Router
 * OAuth 2.0 authorization code flow + sync triggers + dashboard data queries.
 * 
 * Data source strategy:
 *   - 2025 and earlier: spreadsheet data (manually curated historical records)
 *   - 2026 and later: PCO data (live synced from Planning Center)
 */
import { z } from "zod";
import { and, desc, eq, gte, lt, ne, or, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import {
  syncLogs,
  attendance,
  attendanceMonthly,
  attendanceWeekly,
  giving,
  givingMonthly,
  givingWeekly,
  nextSteps,
  nextStepsMonthly,
  serving,
  servingMonthly,
  pcoGroups,
  pcoEvents,
  pcoPeople,
  eventOverrides,
} from "../../drizzle/schema";
import {
  getPcoAuthorizeUrl,
  exchangeCodeForTokens,
  storeTokens,
  getTokenInfo,
  deleteTokens,
  createAuthenticatedPcoClient,
} from "./client";
import {
  syncAttendance,
  syncGiving,
  syncGroups,
  syncEvents,
  syncPeople,
  syncAll,
  logSyncResult,
} from "./sync";
import {
  syncWeeklyAttendance,
  syncWeeklyGiving,
  syncAllWeekly,
} from "./weeklySync";
import { getSchedulerStatus, updateSyncDay } from "./scheduler";
import {
  generateJobId,
  createJob,
  updateJob,
  getJob,
  getRecentJobs,
} from "./jobManager";

/**
 * Run a sync in the background without blocking the HTTP response.
 * Progress is written to the sync_jobs DB table so the UI can poll it.
 */
async function runSyncInBackground(
  jobId: string,
  syncType: string,
  client: any,
  dateFrom?: string,
  dateTo?: string
): Promise<void> {
  try {
    await updateJob(jobId, { progress: 15, message: "Connected to PCO, starting sync..." });

    // Helper: write progress to DB (fire-and-forget inside background job)
    const progress = async (pct: number, message: string, processed?: number) => {
      await updateJob(jobId, { progress: pct, message, ...(processed !== undefined ? { recordsProcessed: processed } : {}) });
    };

    let results;
    if (syncType === "full") {
      // Full sync = weekly PCO fetch only (2026-01-01 to today).
      // Monthly aggregates are computed on-the-fly from weekly DB rows — no separate monthly PCO calls.
      // This eliminates all the hanging PCO API calls (giving, groups, events, people) that were
      // blocking the full sync. One source of truth: attendance_weekly + giving_weekly.
      const effectiveDateFrom = dateFrom ?? "2026-01-01";
      const effectiveDateTo = dateTo ?? new Date().toISOString().split("T")[0];
      await progress(20, "Starting weekly sync from PCO (2026 data)...");
      const weeklyResults = await syncAllWeekly(client, effectiveDateFrom, effectiveDateTo, progress, jobId);

      // Phase 2: flush ALL post-PCO DB work via a fresh HTTP request.
      // The flush endpoint handles: attendance_weekly writes, giving_monthly aggregation,
      // sync log inserts, and marking the job completed at 100%.
      // This avoids ALL shared-pool DB calls after the long PCO fetch.
      try {
        const port = process.env.PORT || 3000;
        const flushResp = await fetch(`http://localhost:${port}/api/sync/flush`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        if (flushResp.ok) {
          const flushData = await flushResp.json() as { ok: boolean; rowsWritten?: number; givingRows?: number };
          console.log(`[PCO Sync] Flush complete: ${flushData.rowsWritten ?? 0} attendance + ${flushData.givingRows ?? 0} giving rows. Job marked complete.`);
        } else {
          const errText = await flushResp.text();
          console.warn(`[PCO Sync] Flush endpoint returned ${flushResp.status}: ${errText}`);
          // Flush failed — fall through to the shared-pool path as a best-effort fallback
          results = [weeklyResults.attendance, weeklyResults.giving];
        }
      } catch (flushErr: any) {
        console.warn(`[PCO Sync] Flush call failed: ${flushErr.message}`);
        // Flush failed — fall through to the shared-pool path as a best-effort fallback
        results = [weeklyResults.attendance, weeklyResults.giving];
      }

      // If flush succeeded (results is still undefined), skip the shared-pool log/complete path.
      // The flush endpoint already marked the job completed at 100%.
      if (!results) return;
    } else if (syncType === "weekly_all") {
      const attResult = await syncWeeklyAttendance(client, dateFrom, dateTo, progress);
      await progress(60, "Syncing weekly giving...", attResult.recordsProcessed);
      const givResult = await syncWeeklyGiving(client, dateFrom, dateTo, progress);
      results = [attResult, givResult];
    } else {
      await updateJob(jobId, { progress: 20, message: `Syncing ${syncType}...` });
      let result;
      switch (syncType) {
        case "attendance":
          result = await syncAttendance(client, dateFrom, dateTo);
          break;
        case "giving":
          result = await syncGiving(client, dateFrom, dateTo);
          break;
        case "groups":
          result = await syncGroups(client);
          break;
        case "events":
          result = await syncEvents(client, dateFrom, dateTo);
          break;
        case "people":
          result = await syncPeople(client);
          break;
        case "weekly_attendance":
          result = await syncWeeklyAttendance(client, dateFrom, dateTo);
          break;
        case "weekly_giving":
          result = await syncWeeklyGiving(client, dateFrom, dateTo);
          break;
        default:
          throw new Error(`Unknown sync type: ${syncType}`);
      }
      results = [result!];
    }

    // Log all results to sync_logs
    let totalRecords = 0;
    for (const result of results) {
      await logSyncResult(result);
      totalRecords += result.recordsProcessed || 0;
    }

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      message: `Sync complete — ${totalRecords} records processed`,
      recordsProcessed: totalRecords,
      results,
      completedAt: new Date(),
    });
  } catch (err: any) {
    console.error(`[PCO Sync] Background job ${jobId} failed:`, err);
    await updateJob(jobId, {
      status: "failed",
      progress: 0,
      message: "Sync failed",
      error: err?.message ?? String(err),
      completedAt: new Date(),
    });
  }
}

/**
 * The cutover year: from this year onward, PCO is the source of truth.
 * Before this year, spreadsheet data is used.
 */
const PCO_CUTOVER_YEAR = 2026;

/**
 * Build a WHERE clause that selects:
 *   - spreadsheet rows for years < PCO_CUTOVER_YEAR
 *   - ALL rows (spreadsheet or pco) for years >= PCO_CUTOVER_YEAR
 *
 * We intentionally allow spreadsheet data for 2026+ as a fallback because
 * PCO sync may not have run for every module yet. Once PCO sync runs for a
 * module, its rows will have source='pco' and the upsert logic in sync.ts
 * will replace the spreadsheet rows, so there will never be duplicates.
 */
function sourceFilter(table: { year: any; source: any }) {
  return or(
    lt(table.year, PCO_CUTOVER_YEAR),          // historical: any source
    gte(table.year, PCO_CUTOVER_YEAR)           // current: any source (pco preferred via upsert)
  );
}

export const pcoRouter = router({
  // ============================================================
  // OAuth 2.0 Flow
  // ============================================================

  /**
   * Get the PCO authorization URL to redirect the user to.
   */
  getAuthorizeUrl: publicProcedure
    .query(() => {
      const redirectUri = ENV.pcoRedirectUri;
      const url = getPcoAuthorizeUrl(redirectUri);
      return { url, redirectUri };
    }),

  /**
   * Get the current connection status (are we connected to PCO?).
   */
  getConnectionStatus: publicProcedure.query(async () => {
    const info = await getTokenInfo();
    return info || { connected: false };
  }),

  /**
   * Test the current connection by making a lightweight API call.
   */
  testConnection: publicProcedure.mutation(async () => {
    const client = await createAuthenticatedPcoClient();
    if (!client) {
      return { success: false, error: "Not connected to Planning Center. Please authorize first." };
    }
    const result = await client.validateConnection();
    return {
      success: result.valid,
      organizationName: result.orgName,
      error: result.error,
    };
  }),

  /**
   * Disconnect from PCO (delete stored tokens).
   */
  disconnect: publicProcedure.mutation(async () => {
    await deleteTokens();
    return { success: true };
  }),

  // ============================================================
  // Sync Operations
  // ============================================================
  triggerSync: publicProcedure
    .input(
      z.object({
        syncType: z.enum(["attendance", "giving", "groups", "events", "people", "weekly_attendance", "weekly_giving", "weekly_all", "full"]),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      console.log(`[PCO Sync] Triggering background sync: ${input.syncType}`);

      // Validate PCO connection BEFORE spawning the job so we can return a fast error
      const client = await createAuthenticatedPcoClient();
      if (!client) {
        throw new Error("Not connected to Planning Center. Go to Settings and reconnect your account.");
      }

      // Create the job record in DB immediately so polling can start
      const jobId = generateJobId();
      await createJob(jobId, input.syncType);
      console.log(`[PCO Sync] Job ${jobId} created, running in background...`);

      // Fire-and-forget: run the actual sync without awaiting
      // The job writes progress to the DB; the UI polls getSyncJobStatus
      runSyncInBackground(jobId, input.syncType, client, input.dateFrom, input.dateTo)
        .catch((err) => console.error(`[PCO Sync] Unhandled error in job ${jobId}:`, err));

      return { jobId };
    }),

  getSyncJobStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await getJob(input.jobId);
      if (!job) return null;

      // If the job has been "running" for more than 10 minutes, it likely
      // stalled due to a container restart (in-memory watchdog was wiped).
      // Auto-mark it as failed so the UI doesn't stay stuck.
      if (job.status === "running") {
        const ageMs = Date.now() - job.startedAt.getTime();
        const TEN_MINUTES_MS = 10 * 60 * 1000;
        if (ageMs > TEN_MINUTES_MS) {
          await updateJob(input.jobId, {
            status: "failed",
            error: "Sync timed out — the server may have restarted mid-sync. Please try again.",
            completedAt: new Date(),
          });
          return await getJob(input.jobId);
        }
      }

      return job;
    }),

  getRecentSyncJobs: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      return await getRecentJobs(input?.limit ?? 10);
    }),

  getSyncLogs: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const limit = input?.limit ?? 20;
      return db
        .select()
        .from(syncLogs)
        .orderBy(desc(syncLogs.startedAt))
        .limit(limit);
    }),

  // ============================================================
  // Dashboard Data Queries (serves data to frontend)
  // ============================================================
  /**
   * Returns dashboard data using source-aware filtering:
   *   - Years < 2026: spreadsheet data (historical, manually curated)
   *   - Years >= 2026: PCO data (live synced from Planning Center)
   * This eliminates duplicates and ensures a clean data transition.
   */
  getDashboardData: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [
      attendanceRows,
      attendanceMonthlyRows,
      attendanceWeeklyRows,
      givingRows,
      givingMonthlyRows,
      givingWeeklyRows,
      nextStepsRows,
      nextStepsMonthlyRows,
      servingRows,
      servingMonthlyRows,
      eventOverrideRows,
    ] = await Promise.all([
      db.select().from(attendance).where(sourceFilter(attendance)),
      db.select().from(attendanceMonthly).where(sourceFilter(attendanceMonthly)),
      db.select().from(attendanceWeekly),
      db.select().from(giving).where(sourceFilter(giving)),
      db.select().from(givingMonthly).where(sourceFilter(givingMonthly)),
      db.select().from(givingWeekly),
      db.select().from(nextSteps).where(sourceFilter(nextSteps)),
      db.select().from(nextStepsMonthly).where(sourceFilter(nextStepsMonthly)),
      // Serving: use spreadsheet data for all years until PCO volunteer sync is active.
      // Exclude the pre-aggregated "All Campuses" row — the frontend sums campus rows dynamically.
      db.select().from(serving).where(
        and(eq(serving.source, "spreadsheet"), ne(serving.campus, "All Campuses"))
      ),
      db.select().from(servingMonthly).where(
        and(eq(servingMonthly.source, "spreadsheet"), ne(servingMonthly.campus, "All Campuses"))
      ),
      db.select().from(eventOverrides),
    ]);

    // Extract unique years from ALL tables so that years with partial data
    // (e.g. 2026 serving/nextSteps still on spreadsheet while PCO attendance
    // hasn't synced yet) still appear in the dropdown.
    const yearsSet = new Set<number>();
    for (const r of attendanceRows) yearsSet.add(r.year);
    for (const r of givingRows) yearsSet.add(r.year);
    for (const r of nextStepsRows) yearsSet.add(r.year);
    for (const r of servingRows) yearsSet.add(r.year);
    const years = Array.from(yearsSet).sort();
    const campuses = ["Canton", "Jasper", "Online", "All Campuses"];

    return {
      attendance: attendanceRows.map((r) => ({
        year: r.year,
        campus: r.campus,
        subgroup: r.subgroup,
        avg_weekly: r.avgWeekly,
        total: r.total,
      })),
      attendance_monthly: attendanceMonthlyRows.map((r) => ({
        year: r.year,
        month: r.month,
        campus: r.campus,
        subgroup: r.subgroup,
        total: r.total,
        avg_weekly: r.avgWeekly,
      })),
      giving: givingRows.map((r) => ({
        year: r.year,
        campus: r.campus,
        general: Number(r.general),
        designated: Number(r.designated),
        total: Number(r.total),
      })),
      giving_monthly: givingMonthlyRows.map((r) => ({
        year: r.year,
        month: r.month,
        campus: r.campus,
        subgroup: r.subgroup,
        total: Number(r.total),
      })),
      next_steps: nextStepsRows.map((r) => ({
        year: r.year,
        campus: r.campus,
        metric: r.metric,
        total: r.total,
      })),
      next_steps_monthly: nextStepsMonthlyRows.map((r) => ({
        year: r.year,
        month: r.month,
        campus: r.campus,
        metric: r.metric,
        count: r.count,
      })),
      serving: servingRows.map((r) => ({
        year: r.year,
        campus: r.campus,
        total: r.total,
        avg_weekly: r.avgWeekly,
      })),
      serving_monthly: servingMonthlyRows.map((r) => ({
        year: r.year,
        month: r.month,
        campus: r.campus,
        total: r.total,
      })),
      attendance_weekly: attendanceWeeklyRows.map((r) => ({
        year: r.year,
        weekNumber: r.weekNumber,
        weekStartDate: r.weekStartDate,
        campus: r.campus,
        subgroup: r.subgroup,
        headcount: r.headcount,
        regularCount: r.regularCount,
        guestCount: r.guestCount,
        volunteerCount: r.volunteerCount,
      })),
      giving_weekly: givingWeeklyRows.map((r) => ({
        year: r.year,
        weekNumber: r.weekNumber,
        weekStartDate: r.weekStartDate,
        campus: r.campus,
        total: Number(r.total),
        general: Number(r.general),
        designated: Number(r.designated),
        donationCount: r.donationCount,
      })),
      event_overrides: eventOverrideRows.map((r) => ({
        eventName: r.eventName,
        year: r.year,
        attendance: r.attendance,
        giving: r.giving !== null ? Number(r.giving) : null,
        ftg: r.ftg,
        salvations: r.salvations,
        baptisms: r.baptisms,
        notes: r.notes,
      })),
      years,
      campuses,
    };
  }),

  // ============================================================
  // PCO-specific data queries
  // ============================================================
  getGroups: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(pcoGroups).orderBy(pcoGroups.name);
  }),

  getEvents: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(200).default(50),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const limit = input?.limit ?? 50;
      return db
        .select()
        .from(pcoEvents)
        .orderBy(desc(pcoEvents.startsAt))
        .limit(limit);
    }),

  getSchedulerStatus: publicProcedure.query(() => {
    return getSchedulerStatus();
  }),

  updateSyncDay: publicProcedure
    .input(z.object({ day: z.number().int().min(0).max(6) }))
    .mutation(async ({ input }) => {
      await updateSyncDay(input.day);
      return { success: true, syncDay: input.day };
    }),

  getPeopleStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, byMembership: [] };
    const [totalResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(pcoPeople);
    const byMembership = await db
      .select({
        membershipType: pcoPeople.membershipType,
        count: sql<number>`COUNT(*)`,
      })
      .from(pcoPeople)
      .groupBy(pcoPeople.membershipType);
    return {
      total: totalResult?.count || 0,
      byMembership,
    };
  }),

  // ============================================================
  // Event Overrides — user-entered exact numbers for specific events
  // Priority: override > PCO weekly > monthly estimate
  // ============================================================

  /**
   * Get all event overrides (or for a specific event/year).
   */
  getEventOverrides: publicProcedure
    .input(z.object({
      eventName: z.string().optional(),
      year: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(eventOverrides);
      return rows.map((r) => ({
        id: r.id,
        eventName: r.eventName,
        year: r.year,
        attendance: r.attendance,
        giving: r.giving !== null ? Number(r.giving) : null,
        ftg: r.ftg,
        salvations: r.salvations,
        baptisms: r.baptisms,
        notes: r.notes,
        updatedAt: r.updatedAt,
      }));
    }),

  /**
   * Create or update an event override for a specific event+year.
   * Passing null for a field clears that override (falls back to calculated value).
   */
  upsertEventOverride: publicProcedure
    .input(z.object({
      eventName: z.string().min(1),
      year: z.number().int().min(2010).max(2100),
      attendance: z.number().int().min(0).nullable().optional(),
      giving: z.number().min(0).nullable().optional(),
      ftg: z.number().int().min(0).nullable().optional(),
      salvations: z.number().int().min(0).nullable().optional(),
      baptisms: z.number().int().min(0).nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if override already exists
      const existing = await db
        .select({ id: eventOverrides.id })
        .from(eventOverrides)
        .where(and(
          eq(eventOverrides.eventName, input.eventName),
          eq(eventOverrides.year, input.year)
        ))
        .limit(1);

      if (existing.length > 0) {
        // Update
        await db.update(eventOverrides)
          .set({
            attendance: input.attendance ?? null,
            giving: input.giving !== undefined ? (input.giving !== null ? String(input.giving) : null) : undefined,
            ftg: input.ftg ?? null,
            salvations: input.salvations ?? null,
            baptisms: input.baptisms ?? null,
            notes: input.notes ?? null,
          })
          .where(and(
            eq(eventOverrides.eventName, input.eventName),
            eq(eventOverrides.year, input.year)
          ));
      } else {
        // Insert
        await db.insert(eventOverrides).values({
          eventName: input.eventName,
          year: input.year,
          attendance: input.attendance ?? null,
          giving: input.giving !== null && input.giving !== undefined ? String(input.giving) : null,
          ftg: input.ftg ?? null,
          salvations: input.salvations ?? null,
          baptisms: input.baptisms ?? null,
          notes: input.notes ?? null,
        });
      }

      return { success: true };
    }),

  /**
   * Delete an event override (revert to calculated value).
   */
  deleteEventOverride: publicProcedure
    .input(z.object({
      eventName: z.string(),
      year: z.number().int(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(eventOverrides)
        .where(and(
          eq(eventOverrides.eventName, input.eventName),
          eq(eventOverrides.year, input.year)
        ));
      return { success: true };
    }),

  /**
   * DEBUG: Fetch raw headcount data from PCO for a specific event's most recent period.
   * Used to diagnose attendance_type name mismatches.
   */
  /**
   * DEBUG: Fetch raw event_time data from PCO to find custom headcount fields.
   */
  debugEventTime: publicProcedure
    .input(z.object({ eventTimeId: z.string() }))
    .query(async ({ input }) => {
      const client = await createAuthenticatedPcoClient();
      if (!client) throw new Error("Not connected to PCO");

      // Fetch the raw event_time with all includes
      const etRaw = await client.get(`/check-ins/v2/event_times/${input.eventTimeId}?include=headcounts`);

      // Also try fetching headcount_types for this event
      let headcountTypes: any = null;
      try {
        headcountTypes = await client.get(`/check-ins/v2/event_times/${input.eventTimeId}/headcount_types?per_page=25`);
      } catch (e: any) {
        headcountTypes = { error: e.message };
      }

      // Also try the event's headcount_types
      let eventHeadcountTypes: any = null;
      try {
        // The event_time belongs to an event — get the event's headcount_types
        const etData = (etRaw as any).data;
        const eventId = etData?.relationships?.event?.data?.id;
        if (eventId) {
          eventHeadcountTypes = await client.get(`/check-ins/v2/events/${eventId}/headcount_types?per_page=25`);
        }
      } catch (e: any) {
        eventHeadcountTypes = { error: (e as any).message };
      }

      return {
        eventTime: (etRaw as any).data?.attributes,
        eventTimeRelationships: (etRaw as any).data?.relationships,
        included: (etRaw as any).included,
        headcountTypes,
        eventHeadcountTypes,
      };
    }),

  debugHeadcounts: publicProcedure
    .input(z.object({ eventId: z.string().default('15287') }))
    .query(async ({ input }) => {
      const client = await createAuthenticatedPcoClient();
      if (!client) throw new Error("Not connected to PCO");

      // Get most recent period
      const periods = await client.paginateAll(
        `/check-ins/v2/events/${input.eventId}/event_periods`,
        { per_page: 3, order: '-starts_at' }
      );
      const latestPeriod = periods.data[0] as any;
      if (!latestPeriod) return { error: 'No periods found', rows: [] as any[] };

      const periodId = latestPeriod.id;
      const periodDate = latestPeriod.attributes?.starts_at;

      // Get event times
      const times = await client.paginateAll(
        `/check-ins/v2/events/${input.eventId}/event_periods/${periodId}/event_times`,
        { per_page: 25 }
      );

      const rows: Array<{ eventTimeId: string; dayOfWeek: number; startsAt: string; hour: number; regularCount: number; totalCount: number; attTypeId: string | null; attTypeName: string | null; total: number }> = [];

      for (const et of times.data as any[]) {
        const etId = et.id;
        const etAttrs = et.attributes ?? {};
        const hcs = await client.paginateAll(
          `/check-ins/v2/event_times/${etId}/headcounts`,
          { per_page: 25 }
        );
        for (const hc of hcs.data as any[]) {
          const total: number = hc.attributes?.total ?? 0;
          const attTypeId: string | null = hc.relationships?.attendance_type?.data?.id ?? null;
          let attTypeName: string | null = null;
          if (attTypeId) {
            try {
              const att = await client.get(`/check-ins/v2/attendance_types/${attTypeId}`);
              attTypeName = (att as any).data?.attributes?.name ?? null;
            } catch {}
          }
          rows.push({
            eventTimeId: etId,
            dayOfWeek: etAttrs.day_of_week,
            startsAt: etAttrs.starts_at,
            hour: etAttrs.hour,
            regularCount: etAttrs.regular_count,
            totalCount: etAttrs.total_count,
            attTypeId,
            attTypeName,
            total
          });
        }
        // If no headcounts, still log the event time so we can see all times
        if ((hcs.data as any[]).length === 0) {
          rows.push({
            eventTimeId: etId,
            dayOfWeek: etAttrs.day_of_week,
            startsAt: etAttrs.starts_at,
            hour: etAttrs.hour,
            regularCount: etAttrs.regular_count,
            totalCount: etAttrs.total_count,
            attTypeId: null,
            attTypeName: 'NO_HEADCOUNTS',
            total: 0
          });
        }
      }

      return { periodId, periodDate, eventId: input.eventId, rows };
    }),

  /**
   * DEBUG: Probe the event_period headcounts endpoint to find custom FTG headcount values.
   * Usage: pass eventId (e.g. '15287' for Canton) to see what the period-level headcounts endpoint returns.
   */
  debugPeriodHeadcounts: publicProcedure
    .input(z.object({ eventId: z.string().default('15287') }))
    .query(async ({ input }) => {
      const client = await createAuthenticatedPcoClient();
      if (!client) throw new Error('Not connected to PCO');

      // Get most recent period
      const periods = await client.paginateAll(
        `/check-ins/v2/events/${input.eventId}/event_periods`,
        { per_page: 3, order: '-starts_at' }
      );
      const latestPeriod = periods.data[0] as any;
      if (!latestPeriod) return { error: 'No periods found' };

      const periodId = latestPeriod.id;
      const periodDate = latestPeriod.attributes?.starts_at;

      // Try fetching headcounts at the event_period level (custom headcount types)
      let periodHeadcounts: any = null;
      try {
        periodHeadcounts = await client.get(
          `/check-ins/v2/events/${input.eventId}/event_periods/${periodId}/headcounts?per_page=25&include=headcount_type`
        );
      } catch (e: any) {
        periodHeadcounts = { error: e.message };
      }

      // Also try headcount_types for the event
      let eventHeadcountTypes: any = null;
      try {
        eventHeadcountTypes = await client.get(
          `/check-ins/v2/events/${input.eventId}/headcount_types?per_page=25`
        );
      } catch (e: any) {
        eventHeadcountTypes = { error: e.message };
      }

      // Also try the event_period with includes
      let periodWithIncludes: any = null;
      try {
        periodWithIncludes = await client.get(
          `/check-ins/v2/events/${input.eventId}/event_periods/${periodId}?include=headcounts`
        );
      } catch (e: any) {
        periodWithIncludes = { error: e.message };
      }

      return {
        eventId: input.eventId,
        periodId,
        periodDate,
        periodHeadcounts,
        eventHeadcountTypes,
        periodWithIncludes,
      };
    }),

  debugWeeklyTables: publicProcedure
    .input(z.object({ weekStartDate: z.string().default('2026-04-13') }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const attRows = await db
        .select()
        .from(attendanceWeekly)
        .where(eq(attendanceWeekly.weekStartDate, input.weekStartDate));

      const givRows = await db
        .select()
        .from(givingWeekly)
        .where(eq(givingWeekly.weekStartDate, input.weekStartDate));

      // Also get the most recent 5 weeks in giving_weekly
      const recentGiving = await db
        .select()
        .from(givingWeekly)
        .orderBy(givingWeekly.weekStartDate)
        .limit(10);

      return {
        weekStartDate: input.weekStartDate,
        attRowCount: attRows.length,
        attSubgroups: attRows.map((r: any) => ({ campus: r.campus, subgroup: r.subgroup, headcount: r.headcount, volunteerCount: r.volunteerCount })),
        givRowCount: givRows.length,
        givRows: givRows.map((r: any) => ({ campus: r.campus, total: r.total, general: r.general })),
        recentGivingWeeks: recentGiving.map((r: any) => ({ weekStartDate: r.weekStartDate, campus: r.campus, total: r.total })),
      };
    }),
});
