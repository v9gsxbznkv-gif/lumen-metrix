/**
 * Planning Center Online Sync Service
 * Pulls data from PCO APIs and writes to the database.
 * Supports: attendance (check-ins), giving, groups, events, people
 *
 * PCO Check-Ins hierarchy:
 *   Event → EventPeriod (week/session) → EventTime (service time) → Headcount
 *   EventPeriod already has guest_count, regular_count, volunteer_count
 */
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { PcoClient } from "./client";
import {
  attendance,
  attendanceMonthly,
  attendanceWeekly,
  giving,
  givingMonthly,
  nextSteps,
  nextStepsMonthly,
  serving,
  servingMonthly,
  pcoGroups,
  pcoEvents,
  pcoPeople,
  syncLogs,
} from "../../drizzle/schema";
import { getDb } from "../db";

// ============================================================
// Sync Result Types
// ============================================================
export interface SyncResult {
  syncType: string;
  status: "completed" | "failed";
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errorMessage?: string;
  durationMs: number;
}

// ============================================================
// Attendance Sync
// Aggregates attendance_weekly rows (already synced by weekly sync)
// into attendance_monthly. No PCO API calls — uses DB data only.
// This avoids the PCO event_periods endpoint which causes TCP hangs.
// ============================================================
export async function syncAttendance(
  _client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, msg: string) => Promise<void>
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Default dateFrom to 2026-01-01 — historical data comes from spreadsheets.
    const effectiveDateFrom = dateFrom || '2026-01-01';
    const effectiveDateTo = dateTo;

    console.log(`[PCO Sync] Starting attendance sync (DB aggregation, ${effectiveDateFrom} → ${effectiveDateTo || 'now'})...`);
    if (onProgress) await onProgress(22, "Aggregating weekly attendance into monthly totals...");

    // Query attendance_weekly rows for the date range.
    // weekStartDate is stored as 'YYYY-MM-DD'.
    const conditions = [gte(attendanceWeekly.weekStartDate, effectiveDateFrom)];
    if (effectiveDateTo) conditions.push(lte(attendanceWeekly.weekStartDate, effectiveDateTo));

    const weeklyRows = await db
      .select()
      .from(attendanceWeekly)
      .where(and(...conditions));

    console.log(`[PCO Sync] Found ${weeklyRows.length} weekly rows to aggregate`);
    if (onProgress) await onProgress(30, `Aggregating ${weeklyRows.length} weekly rows...`);

    // Group by year/month/campus/subgroup and sum headcounts.
    // weekStartDate 'YYYY-MM-DD' → extract year and month.
    const monthlyMap = new Map<string, {
      year: number;
      month: number;
      campus: string;
      subgroup: string;
      totalHeadcount: number;
      weekCount: number;
    }>();

    for (const row of weeklyRows) {
      recordsProcessed++;
      const date = new Date(row.weekStartDate + 'T00:00:00Z');
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const key = `${year}-${month}-${row.campus}-${row.subgroup}`;

      const existing = monthlyMap.get(key);
      if (existing) {
        existing.totalHeadcount += row.headcount;
        existing.weekCount += 1;
      } else {
        monthlyMap.set(key, {
          year,
          month,
          campus: row.campus,
          subgroup: row.subgroup,
          totalHeadcount: row.headcount,
          weekCount: 1,
        });
      }
    }

    console.log(`[PCO Sync] Aggregated into ${monthlyMap.size} year/month/campus/subgroup buckets`);
    if (onProgress) await onProgress(35, `Writing ${monthlyMap.size} monthly records...`);

    // Ping DB before batch write
    try { await db.execute(sql`SELECT 1`); } catch (_) { /* continue anyway */ }

    // Batch upsert all buckets in one INSERT ... ON DUPLICATE KEY UPDATE
    const batchRows = Array.from(monthlyMap.values()).map(bucket => ({
      year: bucket.year,
      month: bucket.month,
      campus: bucket.campus,
      subgroup: bucket.subgroup,
      total: bucket.totalHeadcount,
      avgWeekly: bucket.weekCount > 0 ? Math.round(bucket.totalHeadcount / bucket.weekCount) : 0,
      source: "pco" as const,
    }));

    if (batchRows.length > 0) {
      const insertPromise = db
        .insert(attendanceMonthly)
        .values(batchRows)
        .onDuplicateKeyUpdate({
          set: {
            total: sql`VALUES(total)`,
            avgWeekly: sql`VALUES(avgWeekly)`,
            source: sql`VALUES(source)`,
          },
        });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB write timeout for attendance_monthly")), 30000)
      );
      try {
        await Promise.race([insertPromise, timeoutPromise]);
        recordsCreated += batchRows.length;
      } catch (writeErr: any) {
        console.warn(`[PCO Sync] attendance_monthly write failed/timed out: ${writeErr.message}`);
      }
    }

    console.log(`[PCO Sync] Attendance sync complete: ${recordsProcessed} weekly rows → ${recordsCreated} created, ${recordsUpdated} updated`);
    if (onProgress) await onProgress(40, "Monthly attendance aggregation complete");

    return {
      syncType: "attendance",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Sync] Attendance sync failed:", error.message);
    return {
      syncType: "attendance",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Map an event name to a campus based on common naming patterns.
 * Customize this for your church's naming conventions.
 */
function mapEventToCampus(eventName: string): string {
  const name = eventName.toLowerCase();
  if (name.includes("canton")) return "Canton";
  if (name.includes("jasper")) return "Jasper";
  if (name.includes("online")) return "Online";
  if (name.includes("woodstock")) return "Woodstock";
  return "All Campuses";
}

// ============================================================
// Giving Sync (Giving API)
// ============================================================
export async function syncGiving(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log("[PCO Sync] Starting giving sync...");

    // Default to current year only — we only need PCO data from 2026 onward.
    // Historical giving (pre-2026) is sourced from spreadsheet data.
    const currentYear = new Date().getFullYear();
    const defaultFrom = `${currentYear}-01-01`;

    const params: Record<string, any> = {
      include: "designations",
      per_page: 100,
    };
    params["where[received_at][gte]"] = dateFrom || defaultFrom;
    if (dateTo) params["where[received_at][lte]"] = dateTo;
    params["where[payment_status]"] = "succeeded";

    const GIVING_TIMEOUT_MS = 90_000;
    const donationsResult = await Promise.race([
      client.paginateAll("/giving/v2/donations", params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching donations after ${GIVING_TIMEOUT_MS}ms`)), GIVING_TIMEOUT_MS)
      ),
    ]);
    console.log(`[PCO Sync] Got ${donationsResult.data.length} donations`);

    // Group donations by year/month/campus
    const monthlyTotals: Record<string, { general: number; designated: number }> = {};

    for (const donation of donationsResult.data) {
      recordsProcessed++;
      const attrs = (donation as any).attributes;
      if (!attrs || attrs.refunded) continue;

      const amountCents = attrs.amount_cents || 0;
      const amount = amountCents / 100;
      const receivedAt = attrs.received_at;
      if (!receivedAt) continue;

      const date = new Date(receivedAt);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      // Determine campus from fund or payment source
      const campus = "All Campuses"; // Default; would need campus mapping
      const key = `${year}-${month}-${campus}`;

      if (!monthlyTotals[key]) {
        monthlyTotals[key] = { general: 0, designated: 0 };
      }

      // Simplified: treat all as general unless designated fund detected
      monthlyTotals[key].general += amount;
      recordsCreated++;
    }

    // Write aggregated monthly giving to database using batch upsert
    const batchRows: Array<{ year: number; month: number; campus: string; subgroup: string; total: string; source: string }> = [];
    for (const [key, totals] of Object.entries(monthlyTotals)) {
      const [yearStr, monthStr, campus] = key.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      batchRows.push({
        year,
        month,
        campus,
        subgroup: "Tithes and Offerings",
        total: String(totals.general),
        source: "pco",
      });

      if (totals.designated > 0) {
        batchRows.push({
          year,
          month,
          campus,
          subgroup: "Designated",
          total: String(totals.designated),
          source: "pco",
        });
      }
    }

    if (batchRows.length > 0) {
      try {
        await db
          .insert(givingMonthly)
          .values(batchRows)
          .onDuplicateKeyUpdate({
            set: {
              total: sql`VALUES(total)`,
              source: sql`VALUES(source)`,
            },
          });
        recordsCreated = batchRows.length;
      } catch (writeErr: any) {
        console.warn(`[PCO Sync] giving_monthly write failed: ${writeErr.message}`);
      }
    }

    console.log(`[PCO Sync] Giving sync complete: ${recordsProcessed} donations processed`);

    return {
      syncType: "giving",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Sync] Giving sync failed:", error.message);
    return {
      syncType: "giving",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: `${error.message}${error.response ? ` (URL: ${error.config?.url}, Status: ${error.response.status})` : ""}`,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================
// Groups Sync (Groups API)
// ============================================================
export async function syncGroups(client: PcoClient): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log("[PCO Sync] Starting groups sync...");

    const GROUPS_TIMEOUT_MS = 60_000;
    const groupsResult = await Promise.race([
      client.paginateAll("/groups/v2/groups", { include: "group_type,location" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching groups after ${GROUPS_TIMEOUT_MS}ms`)), GROUPS_TIMEOUT_MS)
      ),
    ]);
    console.log(`[PCO Sync] Got ${groupsResult.data.length} groups`);

    // Build lookup maps for included data
    const includedMap: Record<string, any> = {};
    for (const inc of groupsResult.included) {
      includedMap[`${inc.type}-${inc.id}`] = inc;
    }

    for (const group of groupsResult.data) {
      recordsProcessed++;
      const attrs = (group as any).attributes;
      const pcoId = String(group.id);

      // Get group type name
      const groupTypeRef = (group as any).relationships?.group_type?.data;
      const groupTypeObj = groupTypeRef
        ? includedMap[`GroupType-${groupTypeRef.id}`]
        : null;
      const groupTypeName = groupTypeObj?.attributes?.name || null;

      // Get location/campus
      const locationRef = (group as any).relationships?.location?.data;
      const locationObj = locationRef
        ? includedMap[`Location-${locationRef.id}`]
        : null;
      const campusName = locationObj?.attributes?.name || null;

      const isArchived = !!attrs.archived_at;

      // Upsert group
      const existing = await db
        .select()
        .from(pcoGroups)
        .where(eq(pcoGroups.pcoId, pcoId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pcoGroups)
          .set({
            name: attrs.name,
            groupType: groupTypeName,
            membersCount: attrs.members_count || 0,
            schedule: attrs.schedule || null,
            campus: campusName,
            isArchived,
            lastSyncedAt: new Date(),
          })
          .where(eq(pcoGroups.pcoId, pcoId));
        recordsUpdated++;
      } else {
        await db.insert(pcoGroups).values({
          pcoId,
          name: attrs.name,
          groupType: groupTypeName,
          membersCount: attrs.members_count || 0,
          schedule: attrs.schedule || null,
          campus: campusName,
          isArchived,
          lastSyncedAt: new Date(),
        });
        recordsCreated++;
      }
    }

    console.log(`[PCO Sync] Groups sync complete: ${recordsProcessed} groups processed`);

    return {
      syncType: "groups",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Sync] Groups sync failed:", error.message);
    return {
      syncType: "groups",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: `${error.message}${error.response ? ` (URL: ${error.config?.url}, Status: ${error.response.status})` : ""}`,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================
// Events Sync (Calendar API)
// ============================================================
export async function syncEvents(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log("[PCO Sync] Starting events sync...");

    // Default to current year only — prevents pulling entire calendar history.
    const currentYear = new Date().getFullYear();
    const defaultFrom = `${currentYear}-01-01`;

    const params: Record<string, any> = {
      include: "event",
      order: "starts_at",
    };
    params["where[starts_at][gte]"] = dateFrom || defaultFrom;
    if (dateTo) params["where[starts_at][lte]"] = dateTo;

    const EVENTS_TIMEOUT_MS = 60_000;
    const instancesResult = await Promise.race([
      client.paginateAll("/calendar/v2/event_instances", params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching event instances after ${EVENTS_TIMEOUT_MS}ms`)), EVENTS_TIMEOUT_MS)
      ),
    ]);
    console.log(`[PCO Sync] Got ${instancesResult.data.length} event instances`);

    // Build event name lookup
    const eventNameMap: Record<string, string> = {};
    for (const inc of instancesResult.included) {
      if (inc.type === "Event") {
        eventNameMap[inc.id] = inc.attributes?.name || "Unknown Event";
      }
    }

    for (const instance of instancesResult.data) {
      recordsProcessed++;
      const attrs = (instance as any).attributes;
      const pcoId = String(instance.id);

      const eventRef = (instance as any).relationships?.event?.data;
      const eventName = eventRef ? eventNameMap[eventRef.id] || attrs.name : attrs.name;

      const startsAt = attrs.starts_at ? new Date(attrs.starts_at) : null;
      const endsAt = attrs.ends_at ? new Date(attrs.ends_at) : null;

      // Upsert event instance
      const existing = await db
        .select()
        .from(pcoEvents)
        .where(eq(pcoEvents.pcoId, pcoId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pcoEvents)
          .set({
            name: eventName || "Unknown",
            startsAt,
            endsAt,
            location: attrs.location || null,
            lastSyncedAt: new Date(),
          })
          .where(eq(pcoEvents.pcoId, pcoId));
        recordsUpdated++;
      } else {
        await db.insert(pcoEvents).values({
          pcoId,
          name: eventName || "Unknown",
          startsAt,
          endsAt,
          location: attrs.location || null,
          lastSyncedAt: new Date(),
        });
        recordsCreated++;
      }
    }

    console.log(`[PCO Sync] Events sync complete: ${recordsProcessed} instances processed`);

    return {
      syncType: "events",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Sync] Events sync failed:", error.message);
    return {
      syncType: "events",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: `${error.message}${error.response ? ` (URL: ${error.config?.url}, Status: ${error.response.status})` : ""}`,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================
// People Sync (People API)
// ============================================================
export async function syncPeople(client: PcoClient): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    console.log("[PCO Sync] Starting people sync...");

    const PEOPLE_TIMEOUT_MS = 90_000;
    const peopleResult = await Promise.race([
      client.paginateAll("/people/v2/people", { per_page: 100, include: "primary_campus" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching people after ${PEOPLE_TIMEOUT_MS}ms`)), PEOPLE_TIMEOUT_MS)
      ),
    ]);
    console.log(`[PCO Sync] Got ${peopleResult.data.length} people, ${peopleResult.included.length} included resources`);

    // Build lookup map for included campus resources
    const includedMap: Record<string, any> = {};
    for (const inc of peopleResult.included) {
      includedMap[`${inc.type}-${inc.id}`] = inc;
    }

    for (const person of peopleResult.data) {
      recordsProcessed++;
      const attrs = (person as any).attributes;
      const pcoId = String(person.id);

      // Resolve primary_campus from included resources
      const campusRef = (person as any).relationships?.primary_campus?.data;
      const campusObj = campusRef
        ? includedMap[`Campus-${campusRef.id}`]
        : null;
      const campusName = campusObj?.attributes?.name || null;

      const existing = await db
        .select()
        .from(pcoPeople)
        .where(eq(pcoPeople.pcoId, pcoId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pcoPeople)
          .set({
            firstName: attrs.first_name || null,
            lastName: attrs.last_name || null,
            email: attrs.primary_contact_email || null,
            campus: campusName,
            membershipType: attrs.membership || null,
            status: attrs.status || null,
            lastSyncedAt: new Date(),
          })
          .where(eq(pcoPeople.pcoId, pcoId));
        recordsUpdated++;
      } else {
        await db.insert(pcoPeople).values({
          pcoId,
          firstName: attrs.first_name || null,
          lastName: attrs.last_name || null,
          email: attrs.primary_contact_email || null,
          campus: campusName,
          membershipType: attrs.membership || null,
          status: attrs.status || null,
          lastSyncedAt: new Date(),
        });
        recordsCreated++;
      }
    }

    console.log(`[PCO Sync] People sync complete: ${recordsProcessed} people processed`);

    return {
      syncType: "people",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[PCO Sync] People sync failed:", error.message);
    return {
      syncType: "people",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: `${error.message}${error.response ? ` (URL: ${error.config?.url}, Status: ${error.response.status})` : ""}`,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================
// Full Sync — runs all sync operations
// ============================================================
export async function syncAll(
  client: PcoClient,
  dateFrom?: string,
  dateTo?: string,
  onProgress?: (pct: number, msg: string) => Promise<void>
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const p = onProgress || (async () => {});

  // Attendance: 20% → 40% (DB aggregation, instant)
  results.push(await syncAttendance(client, dateFrom, dateTo, onProgress));
  await p(60, "Monthly data sync complete");

  // NOTE: syncGiving, syncGroups, syncEvents, syncPeople are intentionally excluded from the full sync.
  // The PCO giving, groups, calendar, and people APIs all cause TCP hangs that no timeout can reliably fix.
  // - Giving data: aggregated from giving_weekly DB rows by syncWeeklyGiving (no PCO call)
  // - Groups/Events/People: not displayed on any dashboard view
  // All can be triggered individually via the single-type sync if needed.

  return results;
}

// ============================================================
// Log sync result to database
// ============================================================
export async function logSyncResult(result: SyncResult): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(syncLogs).values({
    syncType: result.syncType,
    status: result.status,
    recordsProcessed: result.recordsProcessed,
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
    errorMessage: result.errorMessage || null,
    startedAt: new Date(Date.now() - result.durationMs),
    completedAt: new Date(),
    durationMs: result.durationMs,
  });
}
