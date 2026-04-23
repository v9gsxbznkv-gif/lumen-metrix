/**
 * Planning Center Online Sync Service
 * Pulls data from PCO APIs and writes to the database.
 * Supports: attendance (check-ins), giving, groups, events, people
 *
 * PCO Check-Ins hierarchy:
 *   Event → EventPeriod (week/session) → EventTime (service time) → Headcount
 *   EventPeriod already has guest_count, regular_count, volunteer_count
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
// Uses: events → event_periods (which have built-in counts)
// ============================================================
export async function syncAttendance(
  client: PcoClient,
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

    // Default dateFrom to 2026-01-01 if not specified.
    // Historical data (2025 and earlier) comes from spreadsheets, not PCO.
    // Fetching all event_periods back to 2013 would cause thousands of unnecessary
    // API calls and DB writes. This keeps the monthly sync fast and focused.
    const effectiveDateFrom = dateFrom || '2026-01-01';
    const effectiveDateTo = dateTo;

    console.log(`[PCO Sync] Starting attendance sync (${effectiveDateFrom} → ${effectiveDateTo || 'now'})...`);
    // Heartbeat: let the watchdog know we've started (before the first API call)
    if (onProgress) await onProgress(20, "Fetching events list from PCO...");

    // Step 1: Only process the 5 known recurring service events.
    // PCO stores 300+ events (RSVPs, one-offs, old events from 2013).
    // The PCO API filter `where[updated_at][gte]` is unreliable — it doesn't
    // actually filter old events. Instead, we fetch all events once and
    // immediately filter to only the 5 key recurring services by name.
    // This reduces event_periods API calls from 300+ to exactly 5.
    const KEY_EVENT_NAMES = new Set([
      "Revolution Canton Check-In",
      "Revolution Jasper Check-In",
      "RevStudents | Canton Campus",
      "RevStudents | Jasper Campus",
      "YA Gathering",
    ]);

    console.log(`[PCO Sync] Fetching events list to find the 5 key recurring services...`);
    const EVENTS_FETCH_TIMEOUT_MS = 60_000;
    const allEventsResult = await Promise.race([
      client.paginateAll("/check-ins/v2/events"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching events list after ${EVENTS_FETCH_TIMEOUT_MS}ms`)), EVENTS_FETCH_TIMEOUT_MS)
      ),
    ]);
    const eventsToProcess = allEventsResult.data.filter((e: any) =>
      KEY_EVENT_NAMES.has(e.attributes?.name)
    );
    console.log(`[PCO Sync] Found ${eventsToProcess.length}/${allEventsResult.data.length} key events to process`);

    const totalEvents = eventsToProcess.length;
    let eventIdx = 0;
    for (const event of eventsToProcess) {
      eventIdx++;
      const eventId = event.id;
      const eventName = (event as any).attributes?.name || `Event-${eventId}`;
      console.log(`[PCO Sync] Processing event: ${eventName} (ID: ${eventId}) [${eventIdx}/${totalEvents}]`);
      // Emit heartbeat before EVERY event's API call so the watchdog sees activity
      // even if a single event_periods fetch hangs (socket-level stall).
      if (onProgress) {
        const pct = Math.round(20 + (eventIdx / totalEvents) * 20); // 20%–40%
        await onProgress(pct, `Syncing monthly attendance... (${eventIdx}/${totalEvents} events: ${eventName})`);
      }

      // Step 2: Get event_periods (weekly sessions) for this event.
      // Wrapped in Promise.race with a 45s hard timeout so a single stalled
      // TCP connection can't block the entire sync indefinitely.
      // Individual event failures are non-fatal: we skip and continue.
      const periodParams: Record<string, any> = {
        per_page: 100,
        order: "-starts_at", // newest first
      };
      periodParams["where[starts_at][gte]"] = effectiveDateFrom; // always set
      if (effectiveDateTo) periodParams["where[starts_at][lte]"] = effectiveDateTo;

      let periodsResult: { data: any[]; included: any[] };
      try {
        const FETCH_TIMEOUT_MS = 45_000;
        periodsResult = await Promise.race([
          client.paginateAll(`/check-ins/v2/events/${eventId}/event_periods`, periodParams),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout fetching event_periods for ${eventName} after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS)
          ),
        ]);
        console.log(`[PCO Sync]   Got ${periodsResult.data.length} event periods for ${eventName}`);
      } catch (fetchErr: any) {
        console.warn(`[PCO Sync]   Skipping ${eventName}: ${fetchErr.message}`);
        continue; // non-fatal: skip this event, process the rest
      }

      for (const period of periodsResult.data) {
        recordsProcessed++;
        const attrs = (period as any).attributes;
        const startsAt = attrs?.starts_at;
        if (!startsAt) continue;

        const date = new Date(startsAt);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        // EventPeriod has built-in counts
        const regularCount = attrs.regular_count || 0;
        const guestCount = attrs.guest_count || 0;
        const volunteerCount = attrs.volunteer_count || 0;
        const totalCount = regularCount + guestCount + volunteerCount;

        if (totalCount === 0) continue; // Skip empty periods

        // Map event name to campus if possible
        const campus = mapEventToCampus(eventName);

        // Upsert into attendanceMonthly
        // We aggregate by year/month/campus/subgroup
        const key = `${year}-${month}-${campus}-${eventName}`;

        try {
          await db.insert(attendanceMonthly).values({
            year,
            month,
            campus,
            subgroup: eventName,
            total: totalCount,
            avgWeekly: totalCount, // Will be recalculated
            source: "pco",
          });
          recordsCreated++;
        } catch (dupError: any) {
          // If duplicate, update instead
          if (dupError.code === "ER_DUP_ENTRY") {
            recordsUpdated++;
          } else {
            console.warn(`[PCO Sync] Insert warning for ${key}:`, dupError.message);
          }
        }
      }
    }

    console.log(`[PCO Sync] Attendance sync complete: ${recordsProcessed} periods processed, ${recordsCreated} created, ${recordsUpdated} updated`);

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
      errorMessage: `${error.message}${error.response ? ` (URL: ${error.config?.url}, Status: ${error.response.status})` : ""}`,
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

    const donationsResult = await client.paginateAll("/giving/v2/donations", params);
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

    // Write aggregated monthly giving to database
    for (const [key, totals] of Object.entries(monthlyTotals)) {
      const [yearStr, monthStr, campus] = key.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      try {
        await db.insert(givingMonthly).values({
          year,
          month,
          campus,
          subgroup: "Tithes and Offerings",
          total: String(totals.general),
          source: "pco",
        });
      } catch (dupError: any) {
        if (dupError.code !== "ER_DUP_ENTRY") {
          console.warn(`[PCO Sync] Giving insert warning:`, dupError.message);
        }
      }

      if (totals.designated > 0) {
        try {
          await db.insert(givingMonthly).values({
            year,
            month,
            campus,
            subgroup: "Designated",
            total: String(totals.designated),
            source: "pco",
          });
        } catch (dupError: any) {
          if (dupError.code !== "ER_DUP_ENTRY") {
            console.warn(`[PCO Sync] Giving designated insert warning:`, dupError.message);
          }
        }
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

    const groupsResult = await client.paginateAll("/groups/v2/groups", {
      include: "group_type,location",
    });
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

    const instancesResult = await client.paginateAll(
      "/calendar/v2/event_instances",
      params
    );
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

    const peopleResult = await client.paginateAll("/people/v2/people", {
      per_page: 100,
    });
    console.log(`[PCO Sync] Got ${peopleResult.data.length} people`);

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

  results.push(await syncAttendance(client, dateFrom, dateTo, onProgress));
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
