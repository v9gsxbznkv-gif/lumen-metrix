/**
 * PCO Auto-Sync Scheduler
 * Runs a full sync at midnight (Eastern Time) every night.
 * Uses setInterval with 30-minute checks to avoid drift.
 */
import { createAuthenticatedPcoClient } from "./client";
import { syncAll, logSyncResult } from "./sync";
import { syncAllWeekly } from "./weeklySync";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastSyncAt: Date | null = null;
let lastSyncDate = ""; // Track the last date we synced to avoid double-runs

// Eastern Time offset (UTC-5 or UTC-4 during DST)
function getEasternHour(): number {
  const now = new Date();
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(eastern);
}

function getEasternTimeString(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

/**
 * Run the nightly sync — pulls all modules from PCO.
 * Only syncs the current year to keep it fast.
 */
async function runNightlySync(): Promise<void> {
  if (isRunning) {
    console.log("[Scheduler] Sync already in progress, skipping...");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log(`[Scheduler] Starting nightly sync at ${getEasternTimeString()}`);

  try {
    const client = await createAuthenticatedPcoClient();
    if (!client) {
      console.log("[Scheduler] No PCO connection, skipping nightly sync.");
      return;
    }

    // Sync current year data
    const currentYear = new Date().getFullYear();
    const dateFrom = `${currentYear}-01-01`;
    const dateTo = `${currentYear}-12-31`;

    const results = await syncAll(client, dateFrom, dateTo);

    // Log monthly sync results
    for (const result of results) {
      await logSyncResult(result);
    }

    // Also run weekly sync (per-Sunday granularity)
    try {
      console.log(`[Scheduler] Starting weekly data sync for ${currentYear}...`);
      const weeklyResults = await syncAllWeekly(client, dateFrom, dateTo);
      for (const result of weeklyResults) {
        await logSyncResult(result);
      }
      const weeklyRecords = weeklyResults.reduce((sum, r) => sum + r.recordsProcessed, 0);
      console.log(`[Scheduler] Weekly sync completed: ${weeklyRecords} records`);
    } catch (weeklyErr: any) {
      console.warn(`[Scheduler] Weekly sync failed (non-fatal): ${weeklyErr.message}`);
    }

    const totalRecords = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
    const failedModules = results.filter((r) => r.status === "failed");
    const duration = Date.now() - startTime;

    // Track last successful sync time
    lastSyncAt = new Date();

    if (failedModules.length > 0) {
      console.warn(
        `[Scheduler] Nightly sync completed with ${failedModules.length} failures: ${failedModules.map((f) => f.syncType).join(", ")} (${duration}ms)`
      );
    } else {
      console.log(
        `[Scheduler] Nightly sync completed successfully: ${totalRecords} records across ${results.length} modules (${duration}ms)`
      );
    }
  } catch (error: any) {
    console.error("[Scheduler] Nightly sync error:", error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the auto-sync scheduler.
 * Checks every 30 minutes if it's midnight Eastern, then runs the sync.
 */
export function startAutoSyncScheduler(): void {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running.");
    return;
  }

  console.log("[Scheduler] Auto-sync scheduler started. Will sync at midnight Eastern Time.");

  // Check every 30 minutes
  schedulerInterval = setInterval(() => {
    const hour = getEasternHour();
    const today = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      dateStyle: "short",
    }).format(new Date());

    // Run at midnight (hour 0) and only once per day
    if (hour === 0 && lastSyncDate !== today) {
      lastSyncDate = today;
      runNightlySync().catch((err) =>
        console.error("[Scheduler] Unhandled sync error:", err)
      );
    }
  }, 30 * 60 * 1000); // Check every 30 minutes
}

/**
 * Stop the auto-sync scheduler.
 */
export function stopAutoSyncScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Auto-sync scheduler stopped.");
  }
}

/**
 * Get scheduler status with lastSyncAt for the Settings UI.
 */
export function getSchedulerStatus(): {
  active: boolean;
  nextSyncTime: string;
  isCurrentlySyncing: boolean;
  lastSyncAt: string | null;
} {
  // Calculate next midnight Eastern
  const now = new Date();
  const easternNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const nextMidnight = new Date(easternNow);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);

  return {
    active: schedulerInterval !== null,
    nextSyncTime: nextMidnight.toISOString(),
    isCurrentlySyncing: isRunning,
    lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
  };
}
