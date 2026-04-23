/**
 * DB-backed background job manager for long-running PCO syncs.
 * All state is persisted to the sync_jobs MySQL table so it survives
 * Cloud Run container recycling between HTTP requests.
 */
import { eq, desc, and } from "drizzle-orm";
import { syncJobs } from "../../drizzle/schema";
import { getDb } from "../db";

export type JobStatus = "running" | "completed" | "failed";

export interface SyncJob {
  jobId: string;
  syncType: string;
  status: JobStatus;
  progress: number;
  message: string;
  recordsProcessed: number;
  results?: any[];
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

/** How long a job can go without a progress update before being marked as stalled */
const STALL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — full sync can take 10+ minutes

/** In-memory map of jobId → last progress update timestamp */
const lastProgressUpdate = new Map<string, number>();

/** Watchdog interval handle */
let watchdogInterval: ReturnType<typeof setInterval> | null = null;

export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Start the stall watchdog. Checks every 60 seconds for stalled jobs.
 */
function ensureWatchdogRunning(): void {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(async () => {
    const now = Date.now();
    for (const [jobId, lastUpdate] of Array.from(lastProgressUpdate.entries())) {
      if (now - lastUpdate > STALL_TIMEOUT_MS) {
        console.warn(`[JobManager] Job ${jobId} stalled (no progress for ${Math.round((now - lastUpdate) / 1000)}s). Marking as failed.`);
        await updateJob(jobId, {
          status: "failed",
          error: `Job stalled — no progress update for ${Math.round(STALL_TIMEOUT_MS / 60000)} minutes. This usually means PCO rate limiting caused the sync to hang. Try again later or reduce the date range.`,
          completedAt: new Date(),
        });
        lastProgressUpdate.delete(jobId);
      }
    }
  }, 60_000); // Check every 60 seconds
}

export async function createJob(jobId: string, syncType: string): Promise<void> {
  try {
    const db = await getDb();
    if (db == null) return;
    await db.insert(syncJobs).values({
      jobId,
      syncType,
      status: "running",
      progress: 5,
      message: "Starting sync...",
      recordsProcessed: 0,
    });
    // Track this job for stall detection
    lastProgressUpdate.set(jobId, Date.now());
    ensureWatchdogRunning();
  } catch (e) {
    console.error("[JobManager] Failed to create job:", e);
  }
}

export async function updateJob(
  jobId: string,
  updates: Partial<{
    status: JobStatus;
    progress: number;
    message: string;
    recordsProcessed: number;
    results: any[];
    error: string;
    completedAt: Date;
  }>
): Promise<void> {
  try {
    const db = await getDb();
    if (db == null) return;
    const values: Record<string, any> = { ...updates };
    if (updates.results !== undefined) {
      values.results = JSON.stringify(updates.results);
    }
    await db.update(syncJobs).set(values).where(eq(syncJobs.jobId, jobId));

    // Update the stall watchdog timestamp on any progress update
    if (updates.progress !== undefined || updates.message !== undefined || updates.recordsProcessed !== undefined) {
      lastProgressUpdate.set(jobId, Date.now());
    }

    // Clean up tracking when job completes or fails
    if (updates.status === "completed" || updates.status === "failed") {
      lastProgressUpdate.delete(jobId);
    }
  } catch (e) {
    console.error("[JobManager] Failed to update job:", e);
  }
}

export async function getJob(jobId: string): Promise<SyncJob | null> {
  try {
    const db = await getDb();
    if (db == null) return null;
    const rows = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.jobId, jobId))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      jobId: row.jobId,
      syncType: row.syncType,
      status: row.status as JobStatus,
      progress: row.progress,
      message: row.message,
      recordsProcessed: row.recordsProcessed,
      results: row.results ? JSON.parse(row.results) : undefined,
      error: row.error ?? undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
    };
  } catch (e) {
    console.error("[JobManager] Failed to get job:", e);
    return null;
  }
}

export async function getRecentJobs(limit = 10): Promise<SyncJob[]> {
  try {
    const db = await getDb();
    if (db == null) return [];
    const rows = await db
      .select()
      .from(syncJobs)
      .orderBy(desc(syncJobs.startedAt))
      .limit(limit);
    return rows.map((row) => ({
      jobId: row.jobId,
      syncType: row.syncType,
      status: row.status as JobStatus,
      progress: row.progress,
      message: row.message,
      recordsProcessed: row.recordsProcessed,
      results: row.results ? JSON.parse(row.results) : undefined,
      error: row.error ?? undefined,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
    }));
  } catch (e) {
    console.error("[JobManager] Failed to get recent jobs:", e);
    return [];
  }
}
