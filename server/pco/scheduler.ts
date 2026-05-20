/**
 * PCO Auto-Sync Scheduler
 * Runs a full sync at midnight (Eastern Time) every night.
 * Uses setInterval with 30-minute checks to avoid drift.
 */
import { createAuthenticatedPcoClient } from "./client";
import { logSyncResult } from "./sync";
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

function getEasternDateString(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "short",
  }).format(new Date());
}

/**
 * Run the nightly sync — pulls all modules from PCO.
 * Only syncs the current year to keep it fast.
 * Exported so it can be triggered manually from the UI.
 */
export async function runNightlySync(): Promise<void> {
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

    // Sync current year data using the weekly sync path (the reliable one)
    // This pulls attendance, giving, and volunteers from PCO in one pass.
    const currentYear = new Date().getFullYear();
    const dateFrom = `${currentYear}-01-01`;
    const dateTo = `${currentYear}-12-31`;

    console.log(`[Scheduler] Running full weekly sync for ${currentYear}...`);
    const weeklyResults = await syncAllWeekly(client, dateFrom, dateTo);
    await logSyncResult(weeklyResults.attendance);
    await logSyncResult(weeklyResults.giving);
    await logSyncResult(weeklyResults.volunteers);

    const totalRecords = weeklyResults.attendance.recordsProcessed + weeklyResults.giving.recordsProcessed + weeklyResults.volunteers.recordsProcessed;
    const duration = Date.now() - startTime;

    // Track last successful sync time
    lastSyncAt = new Date();

    console.log(
      `[Scheduler] Nightly sync completed: ${totalRecords} records (${duration}ms)`
    );
  } catch (error: any) {
    console.error("[Scheduler] Nightly sync error:", error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the auto-sync scheduler.
 * Checks every 30 minutes if it's midnight Eastern, then runs the sync.
 * Runs every night — no day-of-week restriction.
 */
export async function startAutoSyncScheduler(): Promise<void> {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running.");
    return;
  }

  console.log(`[Scheduler] Auto-sync scheduler started. Will sync at midnight Eastern Time every night.`);

  // Check every 30 minutes
  schedulerInterval = setInterval(() => {
    const hour = getEasternHour();
    const today = getEasternDateString();

    // Run at midnight (hour 0) every night, only once per day
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
 * Get scheduler status for the Settings UI.
 */
export function getSchedulerStatus(): {
  active: boolean;
  nextSyncTime: string;
  isCurrentlySyncing: boolean;
  lastSyncAt: string | null;
  syncDay: number;
  syncDayName: string;
} {
  // Calculate next midnight Eastern
  const now = new Date();
  const easternNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const nextMidnight = new Date(easternNow);
  if (easternNow.getHours() >= 1) {
    // Past midnight, next sync is tomorrow
    nextMidnight.setDate(nextMidnight.getDate() + 1);
  }
  nextMidnight.setHours(0, 0, 0, 0);

  return {
    active: schedulerInterval !== null,
    nextSyncTime: nextMidnight.toISOString(),
    isCurrentlySyncing: isRunning,
    lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
    syncDay: -1, // -1 means nightly (every day)
    syncDayName: "Every night",
  };
}

/**
 * updateSyncDay is kept for backward compatibility but is now a no-op.
 * The scheduler runs every night regardless.
 */
export async function updateSyncDay(_newDay: number): Promise<void> {
  console.log("[Scheduler] Sync schedule is now nightly. Day-of-week setting is ignored.");
}
