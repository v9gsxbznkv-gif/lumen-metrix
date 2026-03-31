/**
 * DB-backed background job manager for long-running PCO syncs.
 * All state is persisted to the sync_jobs MySQL table so it survives
 * Cloud Run container recycling between HTTP requests.
 */
import { eq, desc } from "drizzle-orm";
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

export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
