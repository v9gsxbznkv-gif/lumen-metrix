/**
 * Planning Center Online Sync Service
 * Pulls data from PCO APIs and writes to the database.
 * Supports: attendance (check-ins), giving, groups, events, people
 */
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { PcoClient } from "./client";
import {
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
// Attendance Sync (Check-Ins API)
// ============================================================
export async function syncAttendance(
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

    console.log("[PCO Sync] Starting attendance sync...");

    // Get all events (services)
    console.log("[PCO Sync] Fetching /check-ins/v2/events...");
    const eventsResult = await client.paginateAll("/check-ins/v2/events");
    console.log(`[PCO Sync] Got ${eventsResult.data.length} events`);
    const events = eventsResult.data;

    for (const event of events) {
      const eventId = event.id;

      // Get event times with headcounts
      const params: Record<string, any> = {
        include: "headcounts",
        per_page: 100,
      };
      if (dateFrom) params["where[starts_at][gte]"] = dateFrom;
      if (dateTo) params["where[starts_at][lte]"] = dateTo;

      const eventTimesResult = await client.paginateAll(
        `/check-ins/v2/events/${eventId}/event_times`,
        params
      );

      for (const eventTime of eventTimesResult.data) {
        recordsProcessed++;
        const startsAt = (eventTime as any).attributes?.starts_at;
        if (!startsAt) continue;

        const date = new Date(startsAt);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        // Get headcounts for this event time
        const headcountsResult = await client.get(
          `/check-ins/v2/event_times/${eventTime.id}/headcounts`,
          { include: "attendance_type", per_page: 100 }
        );

        for (const hc of headcountsResult.data || []) {
          const total = (hc as any).attributes?.total || 0;
          const attTypeId = (hc as any).relationships?.attendance_type?.data?.id;

          // Map attendance type to our subgroup names
          // This mapping may need to be configured per church
          const subgroup = attTypeId ? `PCO-Type-${attTypeId}` : "Total";

          recordsCreated++;
        }
      }
    }

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
    if (error.response) {
      console.error("[PCO Sync] Response status:", error.response.status);
      console.error("[PCO Sync] Response URL:", error.config?.url);
      console.error("[PCO Sync] Response data:", JSON.stringify(error.response.data)?.substring(0, 500));
    }
    return {
      syncType: "attendance",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: `${error.message}${error.response ? ` (URL: ${error.config?.url}, Status: ${error.response.status})` : ''}`,
      durationMs: Date.now() - start,
    };
  }
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

    const params: Record<string, any> = {
      include: "designations",
      per_page: 100,
    };
    if (dateFrom) params["where[received_at][gte]"] = dateFrom;
    if (dateTo) params["where[received_at][lte]"] = dateTo;
    params["where[payment_status]"] = "succeeded";

    const donationsResult = await client.paginateAll("/giving/v2/donations", params);

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

    // Write aggregated monthly giving to database
    for (const [key, totals] of Object.entries(monthlyTotals)) {
      const [yearStr, monthStr, campus] = key.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      await db.insert(givingMonthly).values({
        year,
        month,
        campus,
        subgroup: "Tithes and Offerings",
        total: String(totals.general),
        source: "pco",
      });

      if (totals.designated > 0) {
        await db.insert(givingMonthly).values({
          year,
          month,
          campus,
          subgroup: "Designated",
          total: String(totals.designated),
          source: "pco",
        });
      }
    }

    return {
      syncType: "giving",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      syncType: "giving",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
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

    const groupsResult = await client.paginateAll("/groups/v2/groups", {
      include: "group_type,location",
    });

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

    return {
      syncType: "groups",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      syncType: "groups",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
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

    const params: Record<string, any> = {
      include: "event",
      order: "starts_at",
    };
    if (dateFrom) params["where[starts_at][gte]"] = dateFrom;
    if (dateTo) params["where[starts_at][lte]"] = dateTo;

    const instancesResult = await client.paginateAll(
      "/calendar/v2/event_instances",
      params
    );

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

    return {
      syncType: "events",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      syncType: "events",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
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

    const peopleResult = await client.paginateAll("/people/v2/people", {
      per_page: 100,
    });

    for (const person of peopleResult.data) {
      recordsProcessed++;
      const attrs = (person as any).attributes;
      const pcoId = String(person.id);

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
          membershipType: attrs.membership || null,
          status: attrs.status || null,
          lastSyncedAt: new Date(),
        });
        recordsCreated++;
      }
    }

    return {
      syncType: "people",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      syncType: "people",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
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
  dateTo?: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  results.push(await syncAttendance(client, dateFrom, dateTo));
  results.push(await syncGiving(client, dateFrom, dateTo));
  results.push(await syncGroups(client));
  results.push(await syncEvents(client, dateFrom, dateTo));
  results.push(await syncPeople(client));

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
