/**
 * PCO Sync Job Manager
 * Manages long-running background sync jobs so HTTP requests return immediately
 * and the UI can poll for progress without hitting load-balancer timeouts.
 */

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface SyncJob {
  jobId: string;
  syncType: string;
  status: JobStatus;
  progress: number;       // 0-100
  message: string;        // Human-readable status
  recordsProcessed: number;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
  results: Array<{
    syncType: string;
    status: string;
    recordsProcessed: number;
    errorMessage: string | null;
    durationMs: number | null;
  }>;
}

// In-memory store — survives the request lifecycle, reset on server restart
const jobs = new Map<string, SyncJob>();

// Keep only the last 20 jobs to avoid unbounded growth
const MAX_JOBS = 20;

function pruneOldJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = Array.from(jobs.entries()).sort(
    (a, b) => a[1].startedAt.getTime() - b[1].startedAt.getTime()
  );
  const toDelete = sorted.slice(0, jobs.size - MAX_JOBS);
  for (const [id] of toDelete) jobs.delete(id);
}

export function createJob(syncType: string): SyncJob {
  const jobId = `${syncType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: SyncJob = {
    jobId,
    syncType,
    status: "pending",
    progress: 0,
    message: "Preparing sync…",
    recordsProcessed: 0,
    startedAt: new Date(),
    completedAt: null,
    error: null,
    results: [],
  };
  jobs.set(jobId, job);
  pruneOldJobs();
  return job;
}

export function updateJob(jobId: string, patch: Partial<SyncJob>): void {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch);
}

export function getJob(jobId: string): SyncJob | null {
  return jobs.get(jobId) ?? null;
}

export function getRecentJobs(): SyncJob[] {
  return Array.from(jobs.values())
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, 10);
}
