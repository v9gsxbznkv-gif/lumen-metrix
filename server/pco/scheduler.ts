/**
 * PCO Auto-Sync Scheduler
 * Runs a full sync at midnight (Eastern Time) every Tuesday night.
 * Tuesday gives PCO 2 full days after Sunday services to finalize
 * all check-in and donation data.
 * Uses setInterval with 30-minute checks to avoid drift.
 */
import { createAuthenticatedPcoClient } from "./client";
import { syncAll, logSyncResult } from "./sync";
import { syncAllWeekly } from "./weeklySync";
import { getDb } from "../db";
import { pcoSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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

/** Get Eastern day of week: 0=Sunday, 1=Monday, 2=Tuesday, ... */
function getEasternDayOfWeek(): number {
  const now = new Date();
  const dayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return dayMap[dayStr] ?? -1;
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
  console.log(`[Scheduler] Starting Tuesday nightly sync at ${getEasternTimeString()}`);

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
      await logSyncResult(weeklyResults.attendance);
      await logSyncResult(weeklyResults.giving);
      const weeklyRecords = weeklyResults.attendance.recordsProcessed + weeklyResults.giving.recordsProcessed;
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

// Sync day: default Tuesday (day 2), but configurable via database
let SYNC_DAY = 2;

/**
 * Load sync day from database.
 * Falls back to Tuesday (2) if not configured.
 */
async function loadSyncDay(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Scheduler] Database not available, using default sync day");
      return 2;
    }
    // Query pco_settings table for the first record
    const results = await db.select().from(pcoSettings).limit(1);
    if (results.length > 0 && (results[0] as any).weeklySyncDay !== null && (results[0] as any).weeklySyncDay !== undefined) {
      SYNC_DAY = (results[0] as any).weeklySyncDay;
      console.log(`[Scheduler] Loaded sync day from database: ${getDayName(SYNC_DAY)} (${SYNC_DAY})`);
      return SYNC_DAY;
    }
  } catch (error: any) {
    console.warn(`[Scheduler] Failed to load sync day from database: ${error.message}`);
  }
  SYNC_DAY = 2; // Default to Tuesday
  return SYNC_DAY;
}

/**
 * Convert day number to name.
 */
function getDayName(day: number): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[day] ?? "Unknown";
}

/**
 * Start the auto-sync scheduler.
 * Checks every 30 minutes if it's midnight Eastern on Tuesday, then runs the sync.
 */
export async function startAutoSyncScheduler(): Promise<void> {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running.");
    return;
  }

  // Load configurable sync day from database
  await loadSyncDay();
  console.log(`[Scheduler] Auto-sync scheduler started. Will sync at midnight Eastern Time every ${getDayName(SYNC_DAY)}.`);

  // Check every 30 minutes
  schedulerInterval = setInterval(() => {
    const hour = getEasternHour();
    const day = getEasternDayOfWeek();
    const today = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      dateStyle: "short",
    }).format(new Date());

    // Run at midnight (hour 0) on Tuesday (day 2) and only once per day
    if (hour === 0 && day === SYNC_DAY && lastSyncDate !== today) {
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
  syncDay: number;
  syncDayName: string;
} {
  // Calculate next sync day midnight Eastern
  const now = new Date();
  const easternNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const currentDay = easternNow.getDay(); // 0=Sun...6=Sat
  // Days until next sync day
  let daysUntilSyncDay = (SYNC_DAY - currentDay + 7) % 7;
  // If it's already sync day past midnight, next one is in 7 days
  if (daysUntilSyncDay === 0 && easternNow.getHours() >= 1) {
    daysUntilSyncDay = 7;
  }
  const nextSyncDayMidnight = new Date(easternNow);
  nextSyncDayMidnight.setDate(nextSyncDayMidnight.getDate() + daysUntilSyncDay);
  nextSyncDayMidnight.setHours(0, 0, 0, 0);

  return {
    active: schedulerInterval !== null,
    nextSyncTime: nextSyncDayMidnight.toISOString(),
    isCurrentlySyncing: isRunning,
    lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
    syncDay: SYNC_DAY,
    syncDayName: getDayName(SYNC_DAY),
  };
}

/**
 * Update the sync day and reload scheduler.
 * Called when user changes sync day in Settings.
 */
export async function updateSyncDay(newDay: number): Promise<void> {
  if (newDay < 0 || newDay > 6) {
    throw new Error("Invalid sync day: must be 0-6 (Sunday-Saturday)");
  }

  try {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }
    // Update the first pco_settings record
    await db.update(pcoSettings).set({ weeklySyncDay: newDay } as any);
    SYNC_DAY = newDay;
    console.log(`[Scheduler] Updated sync day to ${getDayName(newDay)} (${newDay})`);
  } catch (error: any) {
    console.error(`[Scheduler] Failed to update sync day: ${error.message}`);
    throw error;
  }
}
