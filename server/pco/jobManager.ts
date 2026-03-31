/**
 * PCO Sync Job Manager — DB-backed
 *
 * Cloud Run containers are ephemeral: in-memory Maps are wiped between requests
 * when the container scales down or is replaced. All job state is persisted to
 * the `sync_jobs` MySQL table so progress survives across container restarts.
 */
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import { syncJobs } from "../../drizzle/schema";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface SyncJobResult {
  syncType: string;
  status: string;
  recordsProcessed: number;
  errorMessage: string | null;
  durationMs: number | null;
}

export interface SyncJob {
  jobId: string;
  syncType: string;
  status: JobStatus;
  progress: number;
  message: string;
  recordsProcessed: number;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
  results: SyncJobResult[];
}

function rowToJob(row: typeof syncJobs.$inferSelect): SyncJob {
  return {
    jobId: row.jobId,
    syncType: row.syncType,
    status: row.status as JobStatus,
    progress: row.progress,
    message: row.message ?? "",
    recordsProcessed: row.recordsProcessed,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    error: row.error ?? null,
    results: (row.results as SyncJobResult[]) ?? [],
  };
}

export async function createJob(syncType: string): Promise<SyncJob> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const jobId = `${syncType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(syncJobs).values({
    jobId,
    syncType,
    status: "pending",
    progress: 0,
    message: "Preparing sync…",
    recordsProcessed: 0,
    results: [],
  });
  const [row] = await db.select().from(syncJobs).where(eq(syncJobs.jobId, jobId));
  return rowToJob(row);
}

export async function updateJob(jobId: string, patch: Partial<SyncJob>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.progress !== undefined) update.progress = patch.progress;
  if (patch.message !== undefined) update.message = patch.message;
  if (patch.recordsProcessed !== undefined) update.recordsProcessed = patch.recordsProcessed;
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.results !== undefined) update.results = patch.results;
  if (patch.completedAt !== undefined) update.completedAt = patch.completedAt;
  if (Object.keys(update).length === 0) return;
  await db.update(syncJobs).set(update).where(eq(syncJobs.jobId, jobId));
}

export async function getJob(jobId: string): Promise<SyncJob | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(syncJobs).where(eq(syncJobs.jobId, jobId));
  if (!row) return null;
  return rowToJob(row);
}

export async function getRecentJobs(): Promise<SyncJob[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(syncJobs)
    .orderBy(desc(syncJobs.startedAt))
    .limit(10);
  return rows.map(rowToJob);
}
