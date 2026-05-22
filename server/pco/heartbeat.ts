/**
 * PCO Heartbeat — External cron-triggered endpoint
 *
 * Called every 30 minutes by an external scheduler. Handles:
 * 1. Proactive token refresh (keeps PCO connection alive)
 * 2. Missed nightly sync detection and recovery
 *
 * This replaces the unreliable in-memory setInterval approach that
 * dies when the container recycles.
 */
import { Request, Response } from "express";
import { desc, eq, and, gte } from "drizzle-orm";
import { getDb } from "../db";
import { syncLogs, pcoTokens } from "../../drizzle/schema";
import { getValidAccessToken } from "./client";
import { runNightlySync } from "./scheduler";
import { autoProcessDemographics, type AutoProcessResult } from "../demographics/autoProcess";

/**
 * Get the current date string in Eastern Time (YYYY-MM-DD format).
 */
function getEasternDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Get the current hour in Eastern Time (0-23).
 */
function getEasternHour(): number {
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return parseInt(eastern);
}

/**
 * Check if a successful sync has already been completed today.
 * Looks at sync_logs for a completed "weekly_attendance" entry from today.
 */
async function hasSyncedToday(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const todayET = getEasternDateString();
  // Start of today in ET (midnight)
  const todayStart = new Date(`${todayET}T00:00:00-04:00`); // EDT offset; close enough for check

  const recentSyncs = await db
    .select()
    .from(syncLogs)
    .where(
      and(
        eq(syncLogs.syncType, "weekly_attendance"),
        eq(syncLogs.status, "completed"),
        gte(syncLogs.startedAt, todayStart)
      )
    )
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);

  return recentSyncs.length > 0;
}

/**
 * Check if the PCO token exists and get its expiry info.
 */
async function getTokenStatus(): Promise<{
  hasToken: boolean;
  isExpired: boolean;
  expiresAt: string | null;
  refreshedNow: boolean;
}> {
  const db = await getDb();
  if (!db) return { hasToken: false, isExpired: true, expiresAt: null, refreshedNow: false };

  const rows = await db.select().from(pcoTokens).limit(1);
  if (rows.length === 0) return { hasToken: false, isExpired: true, expiresAt: null, refreshedNow: false };

  const token = rows[0];
  const expiresAt = token.expiresAt ? new Date(token.expiresAt).toISOString() : null;
  const isExpired = token.expiresAt ? new Date(token.expiresAt).getTime() < Date.now() : true;

  // Attempt to get a valid token (this will refresh if needed)
  const validToken = await getValidAccessToken();
  const refreshedNow = validToken !== null && isExpired;

  return {
    hasToken: true,
    isExpired: validToken === null,
    expiresAt,
    refreshedNow,
  };
}

/**
 * Main heartbeat handler.
 * Called by external cron every 30 minutes.
 *
 * Logic:
 * 1. Always refresh the token if it's close to expiry (30-min buffer already in getValidAccessToken)
 * 2. If it's between midnight and 3am ET AND no sync has completed today, run the nightly sync
 */
export async function heartbeatHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const easternHour = getEasternHour();
  const todayET = getEasternDateString();

  console.log(`[Heartbeat] Triggered at ${new Date().toISOString()} (ET hour: ${easternHour})`);

  // Step 1: Token refresh
  const tokenStatus = await getTokenStatus();
  console.log(`[Heartbeat] Token status: hasToken=${tokenStatus.hasToken}, isExpired=${tokenStatus.isExpired}, refreshedNow=${tokenStatus.refreshedNow}`);

  if (!tokenStatus.hasToken) {
    res.json({
      ok: false,
      message: "No PCO token configured. Please connect in Settings.",
      duration: Date.now() - startTime,
      tokenStatus,
      syncStatus: "skipped",
    });
    return;
  }

  if (tokenStatus.isExpired) {
    // Token couldn't be refreshed — notify and bail
    console.error("[Heartbeat] Token refresh failed. PCO connection is broken.");
    res.json({
      ok: false,
      message: "PCO token refresh failed. Manual reconnect required.",
      duration: Date.now() - startTime,
      tokenStatus,
      syncStatus: "skipped",
    });
    return;
  }

  // Step 2: Auto-process demographics (address fetch + geocode)
  // Runs every heartbeat to chip away at the backlog
  let demographicsResult: AutoProcessResult | null = null;
  try {
    demographicsResult = await autoProcessDemographics();
    console.log(`[Heartbeat] Demographics: ${demographicsResult.addressesFetched} addresses fetched, ${demographicsResult.geocoded} geocoded, ${demographicsResult.addressRemaining} addr remaining, ${demographicsResult.geocodeRemaining} geo remaining`);
  } catch (err: any) {
    console.warn(`[Heartbeat] Demographics auto-process failed: ${err.message}`);
  }

  // Step 3: Check if nightly sync is needed
  // Run sync if: hour is between 0-5 (midnight to 5am ET) AND no sync completed today
  let syncStatus = "not_due";
  let syncMessage = "";

  if (easternHour >= 0 && easternHour <= 5) {
    const alreadySynced = await hasSyncedToday();
    if (!alreadySynced) {
      console.log(`[Heartbeat] No sync completed today (${todayET}). Running nightly sync...`);
      syncStatus = "running";
      try {
        await runNightlySync();
        syncStatus = "completed";
        syncMessage = "Nightly sync completed successfully.";
        console.log("[Heartbeat] Nightly sync completed.");
      } catch (err: any) {
        syncStatus = "failed";
        syncMessage = `Sync failed: ${err.message}`;
        console.error("[Heartbeat] Nightly sync failed:", err.message);
      }
    } else {
      syncStatus = "already_done";
      syncMessage = `Sync already completed today (${todayET}).`;
      console.log(`[Heartbeat] Sync already done today.`);
    }
  } else {
    syncMessage = `Not sync window (ET hour: ${easternHour}, sync runs 0-5am).`;
  }

  const duration = Date.now() - startTime;
  console.log(`[Heartbeat] Done in ${duration}ms. Token: ${tokenStatus.isExpired ? "EXPIRED" : "OK"}, Sync: ${syncStatus}`);

  res.json({
    ok: true,
    message: "Heartbeat processed.",
    duration,
    tokenStatus: {
      hasToken: tokenStatus.hasToken,
      isExpired: tokenStatus.isExpired,
      refreshedNow: tokenStatus.refreshedNow,
      expiresAt: tokenStatus.expiresAt,
    },
    demographics: demographicsResult ? {
      addressesFetched: demographicsResult.addressesFetched,
      addressesNoData: demographicsResult.addressesNoData,
      addressRemaining: demographicsResult.addressRemaining,
      geocoded: demographicsResult.geocoded,
      geocodeRemaining: demographicsResult.geocodeRemaining,
      durationMs: demographicsResult.durationMs,
    } : null,
    syncStatus,
    syncMessage,
    easternHour,
    date: todayET,
  });
}
