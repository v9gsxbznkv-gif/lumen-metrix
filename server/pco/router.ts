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
import { getSchedulerStatus } from "./scheduler";
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
      await progress(20, "Syncing monthly data...");
      const monthlyResults = await syncAll(client, dateFrom, dateTo);
      await progress(60, "Syncing weekly data...");
      const weeklyResults = await syncAllWeekly(client, dateFrom, dateTo, progress);
      results = [...monthlyResults, weeklyResults.attendance, weeklyResults.giving];
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
      return await getJob(input.jobId);
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
});
