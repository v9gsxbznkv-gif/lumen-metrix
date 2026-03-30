/**
 * PCO Integration tRPC Router
 * OAuth 2.0 authorization code flow + sync triggers + dashboard data queries.
 */
import { z } from "zod";
import { desc, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import {
  syncLogs,
  attendance,
  attendanceMonthly,
  giving,
  givingMonthly,
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

export const pcoRouter = router({
  // ============================================================
  // OAuth 2.0 Flow
  // ============================================================

  /**
   * Get the PCO authorization URL to redirect the user to.
   * The frontend passes its origin so we can build the correct callback URL.
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
    // Update org name if we got one
    if (result.valid && result.orgName) {
      const { storeTokens: _st, ...rest } = await import("./client");
      // We can't easily update just the org name without the full token,
      // but the org name was stored during initial token exchange.
    }
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
        syncType: z.enum(["attendance", "giving", "groups", "events", "people", "full"]),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const client = await createAuthenticatedPcoClient();
      if (!client) {
        throw new Error("Not connected to Planning Center. Go to Settings and connect your account.");
      }

      let results;
      if (input.syncType === "full") {
        results = await syncAll(client, input.dateFrom, input.dateTo);
      } else {
        let result;
        switch (input.syncType) {
          case "attendance":
            result = await syncAttendance(client, input.dateFrom, input.dateTo);
            break;
          case "giving":
            result = await syncGiving(client, input.dateFrom, input.dateTo);
            break;
          case "groups":
            result = await syncGroups(client);
            break;
          case "events":
            result = await syncEvents(client, input.dateFrom, input.dateTo);
            break;
          case "people":
            result = await syncPeople(client);
            break;
          default:
            throw new Error(`Unknown sync type: ${input.syncType}`);
        }
        results = [result!];
      }

      // Log all results
      for (const result of results) {
        await logSyncResult(result);
      }

      return { results };
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
  getDashboardData: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [
      attendanceRows,
      attendanceMonthlyRows,
      givingRows,
      givingMonthlyRows,
      nextStepsRows,
      nextStepsMonthlyRows,
      servingRows,
      servingMonthlyRows,
    ] = await Promise.all([
      db.select().from(attendance),
      db.select().from(attendanceMonthly),
      db.select().from(giving),
      db.select().from(givingMonthly),
      db.select().from(nextSteps),
      db.select().from(nextStepsMonthly),
      db.select().from(serving),
      db.select().from(servingMonthly),
    ]);

    // Extract unique years
    const yearsSet = new Set<number>();
    for (const r of attendanceRows) yearsSet.add(r.year);
    for (const r of givingRows) yearsSet.add(r.year);
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
