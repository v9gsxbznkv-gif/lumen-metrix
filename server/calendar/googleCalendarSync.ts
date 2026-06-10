/**
 * Google Calendar Sync Engine
 * Pushes approved LumenMetrix events to a connected Google Calendar.
 * Credentials are loaded from environment variables at runtime.
 * When GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_CALENDAR_ID are not set,
 * all sync calls are no-ops — the engine is credential-ready but silent.
 */
import { google } from "googleapis";
import { getDb } from "../db";
import { googleCalendarSyncLog } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Credential helpers ───────────────────────────────────────────────────────

function getCalendarClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!raw || !calendarId) return null;

  try {
    const credentials = JSON.parse(raw);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });
    return { calendar, calendarId };
  } catch {
    console.error("[GoogleCalendarSync] Failed to parse service account JSON");
    return null;
  }
}

// ─── ICS date formatting ──────────────────────────────────────────────────────

function toGoogleDateTime(date: Date): string {
  return date.toISOString();
}

// ─── Sync log helpers ─────────────────────────────────────────────────────────

async function logSync(
  eventId: number,
  action: "created" | "updated" | "deleted" | "failed",
  googleEventId?: string,
  calendarId?: string,
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(googleCalendarSyncLog).values({
    eventId,
    googleEventId: googleEventId ?? null,
    calendarId: calendarId ?? null,
    action,
    errorMessage: errorMessage ?? null,
  });
}

async function getGoogleEventId(eventId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(googleCalendarSyncLog)
    .where(eq(googleCalendarSyncLog.eventId, eventId))
    .orderBy(googleCalendarSyncLog.syncedAt)
    .limit(50);
  // Find the most recent successful create/update
  const last = [...rows]
    .reverse()
    .find((r) => (r.action === "created" || r.action === "updated") && r.googleEventId);
  return last?.googleEventId ?? null;
}

// ─── Public sync API ──────────────────────────────────────────────────────────

export interface SyncEventPayload {
  id: number;
  title: string;
  description?: string | null;
  location?: string | null;
  startDate: Date;
  endDate: Date;
  isAllDay?: boolean | null;
}

/**
 * Push a newly approved event to Google Calendar.
 * Safe to call even when credentials are not configured — returns silently.
 */
export async function syncEventToGoogle(event: SyncEventPayload): Promise<void> {
  const client = getCalendarClient();
  if (!client) {
    console.log("[GoogleCalendarSync] No credentials configured — skipping sync for event", event.id);
    return;
  }

  const { calendar, calendarId } = client;

  const resource: any = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
  };

  if (event.isAllDay) {
    const dateStr = event.startDate.toISOString().split("T")[0];
    const endStr = event.endDate.toISOString().split("T")[0];
    resource.start = { date: dateStr };
    resource.end = { date: endStr };
  } else {
    resource.start = { dateTime: toGoogleDateTime(event.startDate), timeZone: "America/New_York" };
    resource.end = { dateTime: toGoogleDateTime(event.endDate), timeZone: "America/New_York" };
  }

  try {
    const existingGoogleId = await getGoogleEventId(event.id);

    if (existingGoogleId) {
      // Update existing
      const res = await calendar.events.update({
        calendarId,
        eventId: existingGoogleId,
        requestBody: resource,
      });
      await logSync(event.id, "updated", res.data.id ?? existingGoogleId, calendarId);
      console.log("[GoogleCalendarSync] Updated event", event.id, "→", res.data.id);
    } else {
      // Create new
      const res = await calendar.events.insert({
        calendarId,
        requestBody: resource,
      });
      await logSync(event.id, "created", res.data.id ?? undefined, calendarId);
      console.log("[GoogleCalendarSync] Created event", event.id, "→", res.data.id);
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[GoogleCalendarSync] Failed to sync event", event.id, msg);
    await logSync(event.id, "failed", undefined, calendarId, msg);
  }
}

/**
 * Delete an event from Google Calendar (called on rejection or deletion).
 */
export async function deleteEventFromGoogle(eventId: number): Promise<void> {
  const client = getCalendarClient();
  if (!client) return;

  const { calendar, calendarId } = client;
  const googleEventId = await getGoogleEventId(eventId);
  if (!googleEventId) return;

  try {
    await calendar.events.delete({ calendarId, eventId: googleEventId });
    await logSync(eventId, "deleted", googleEventId, calendarId);
    console.log("[GoogleCalendarSync] Deleted event", eventId, "from Google Calendar");
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[GoogleCalendarSync] Failed to delete event", eventId, msg);
    await logSync(eventId, "failed", googleEventId, calendarId, msg);
  }
}

/**
 * Get sync log entries for a specific event.
 */
export async function getSyncLog(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(googleCalendarSyncLog)
    .where(eq(googleCalendarSyncLog.eventId, eventId))
    .orderBy(googleCalendarSyncLog.syncedAt);
}

/**
 * Get recent sync log entries across all events.
 */
export async function getRecentSyncLog(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(googleCalendarSyncLog)
    .orderBy(googleCalendarSyncLog.syncedAt)
    .limit(limit);
}

/**
 * Returns true if Google Calendar credentials are configured.
 */
export function isGoogleCalendarConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID);
}
