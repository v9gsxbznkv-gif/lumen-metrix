/*
 * Lumen Metrix — Settings Page
 * Church profile, PCO OAuth integration, sync controls, and data source info
 */
import { useState, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Building2,
  Database,
  Info,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Link2,
  Unlink,
  Play,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type SyncType = "attendance" | "giving" | "groups" | "events" | "people" | "weekly_attendance" | "weekly_giving" | "weekly_all" | "full";

const SYNC_OPTIONS: { value: SyncType; label: string; description: string }[] = [
  { value: "full", label: "Full Sync", description: "Sync all modules from PCO (monthly + weekly)" },
  { value: "attendance", label: "Attendance (Monthly)", description: "Monthly check-ins & headcounts" },
  { value: "giving", label: "Giving (Monthly)", description: "Monthly donations & fund totals" },
  { value: "weekly_all", label: "Weekly Data (All)", description: "Per-Sunday attendance + giving from PCO" },
  { value: "weekly_attendance", label: "Weekly Attendance", description: "Per-Sunday check-in headcounts" },
  { value: "weekly_giving", label: "Weekly Giving", description: "Per-Sunday donation totals" },
  { value: "groups", label: "Groups", description: "Small groups & memberships" },
  { value: "events", label: "Events", description: "Calendar event instances" },
  { value: "people", label: "People", description: "Person records & profiles" },
];

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "Never";
  return new Date(d).toLocaleString();
}

// ─── PCO Connection Section (OAuth 2.0) ──────────────────────────────────────
function PcoConnectionSection() {
  const { data: connectionStatus, refetch } = trpc.pco.getConnectionStatus.useQuery();
  const { data: authorizeData } = trpc.pco.getAuthorizeUrl.useQuery();

  const testMutation = trpc.pco.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Connected! ${result.organizationName ? `Organization: ${result.organizationName}` : ""}`);
        refetch();
      } else {
        toast.error(`Connection test failed: ${result.error}`);
      }
    },
    onError: (err) => toast.error(`Test failed: ${err.message}`),
  });

  const disconnectMutation = trpc.pco.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Disconnected from Planning Center.");
      refetch();
    },
    onError: (err) => toast.error(`Disconnect failed: ${err.message}`),
  });

  // Check for callback query params (success/error from OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pcoStatus = params.get("pco");
    if (pcoStatus === "connected") {
      toast.success("Successfully connected to Planning Center!");
      refetch();
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (pcoStatus === "error") {
      const message = params.get("message") || "Unknown error";
      toast.error(`PCO connection failed: ${message}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const isConnected = connectionStatus?.connected === true;

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold">Planning Center Integration</h3>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
              <Wifi className="w-3 h-3" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-full">
              <WifiOff className="w-3 h-3" /> Not connected
            </span>
          )}
        </div>
      </div>

      {isConnected ? (
        <div className="space-y-3">
          {connectionStatus?.organizationName && (
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <span className="text-xs text-muted-foreground">Organization</span>
              <span className="text-xs font-medium">{connectionStatus.organizationName}</span>
            </div>
          )}
          {connectionStatus?.expiresAt && (
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <span className="text-xs text-muted-foreground">Token Expires</span>
              <span className="text-xs">{formatDate(connectionStatus.expiresAt)}</span>
            </div>
          )}
          {connectionStatus?.scope && (
            <div className="flex items-center justify-between py-2 border-b border-border/20">
              <span className="text-xs text-muted-foreground">Scopes</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {connectionStatus.scope.split(" ").map((s) => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 font-mono">{s}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border/60 hover:bg-muted/30 transition-colors disabled:opacity-50"
            >
              {testMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wifi className="w-3 h-3" />
              )}
              Test Connection
            </button>
            <button
              onClick={() => {
                if (confirm("Disconnect from Planning Center? You can reconnect anytime.")) {
                  disconnectMutation.mutate();
                }
              }}
              disabled={disconnectMutation.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Unlink className="w-3 h-3" />
              )}
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Connect your Planning Center account to sync attendance, giving, groups, events, and people data directly into Lumen Metrix.
          </p>
          <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-700 dark:text-blue-400">
              <p className="font-medium mb-1">How it works:</p>
              <p>Click the button below to authorize Lumen Metrix with your Planning Center account. You'll be redirected to PCO to grant access, then returned here automatically.</p>
            </div>
          </div>
          <a
            href={authorizeData?.url || "#"}
            className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-md text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#E8913A" }}
          >
            <Link2 className="w-4 h-4" />
            Connect to Planning Center
          </a>
          <p className="text-[10px] text-muted-foreground">
            Requires a Planning Center account with admin access.{" "}
            <a
              href="https://www.planningcenter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Learn more
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Auto-Sync Scheduler Section ─────────────────────────────────────────────
function AutoSyncSection() {
  const { data: schedulerStatus } = trpc.pco.getSchedulerStatus.useQuery(undefined, {
    refetchInterval: 60000, // refresh every minute
  });
  const { data: connectionStatus } = trpc.pco.getConnectionStatus.useQuery();

  const isConnected = connectionStatus?.connected === true;

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
        <Clock className="w-4 h-4" style={{ color: "#E8913A" }} />
        <h3 className="text-sm font-semibold">Auto-Sync Scheduler</h3>
      </div>

      {!isConnected ? (
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/20 text-xs text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Connect your Planning Center account to enable automatic nightly syncs.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Status</span>
            <span className="flex items-center gap-1.5 text-xs">
              {schedulerStatus?.active ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-600 font-medium">Active</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-amber-600 font-medium">Waiting for connection</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Schedule</span>
            <span className="text-xs font-medium">Every night at midnight (ET)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Next Sync</span>
            <span className="text-xs font-mono">
              {schedulerStatus?.nextSyncTime ? formatDate(schedulerStatus.nextSyncTime) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Last Auto-Sync</span>
            <span className="text-xs font-mono">
              {schedulerStatus?.isCurrentlySyncing
                ? "Syncing now..."
                : schedulerStatus?.lastSyncAt
                  ? formatDate(schedulerStatus.lastSyncAt)
                  : "Not yet (will run at midnight)"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">Modules</span>
            <span className="text-xs">Attendance, Giving, Groups, Events, People</span>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              The auto-sync runs a full sync of all PCO modules every night at midnight. Data from 2026 onward is sourced exclusively from PCO. Historical data (2025 and earlier) is preserved from the original spreadsheets.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Data Source Section ──────────────────────────────────────────────────────
function SyncControlsSection() {
  const [selectedSync, setSelectedSync] = useState<SyncType>("full");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: connectionStatus } = trpc.pco.getConnectionStatus.useQuery();
  const { data: logs, refetch: refetchLogs } = trpc.pco.getSyncLogs.useQuery({ limit: 10 });

  // Poll the active job status every 2 seconds while a job is running
  const { data: jobStatus } = trpc.pco.getSyncJobStatus.useQuery(
    { jobId: activeJobId! },
    {
      enabled: !!activeJobId,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2000;
        // Stop polling once the job is done
        if (data.status === "completed" || data.status === "failed") return false;
        return 2000;
      },
    }
  );

  // When a job finishes, show a toast and refresh logs
  const [notifiedJobId, setNotifiedJobId] = useState<string | null>(null);
  useEffect(() => {
    if (!jobStatus) return;
    if (jobStatus.status !== "completed" && jobStatus.status !== "failed") return;
    // Only fire once per job completion
    if (notifiedJobId === jobStatus.jobId) return;
    setNotifiedJobId(jobStatus.jobId);
    if (jobStatus.status === "completed") {
      toast.success(`Sync completed — ${jobStatus.recordsProcessed.toLocaleString()} records processed`);
    } else {
      toast.error(`Sync failed: ${jobStatus.error ?? jobStatus.message}`, { duration: 8000 });
    }
    refetchLogs();
  }, [jobStatus?.status, jobStatus?.jobId]);

  const startSyncMutation = trpc.pco.triggerSync.useMutation({
    onSuccess: (result) => {
      setActiveJobId(result.jobId);
      setNotifiedJobId(null); // reset so completion toast fires for the new job
      toast.info("Sync started in background — progress shown below");
    },
    onError: (err) => {
      // Show a persistent, descriptive error — not just a toast that disappears
      const isAuthError =
        err.message.toLowerCase().includes("not connected") ||
        err.message.toLowerCase().includes("token") ||
        err.message.toLowerCase().includes("connect");
      toast.error(
        isAuthError
          ? "PCO connection expired. Go to the Planning Center section above and click \"Connect to Planning Center\" to re-authorize."
          : `Sync failed: ${err.message}`,
        { duration: 8000 }
      );
    },
  });

  const isJobRunning = jobStatus && (jobStatus.status === "pending" || jobStatus.status === "running");
  const isConnected = connectionStatus?.connected === true;

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
        <RefreshCw className="w-4 h-4" style={{ color: "#E8913A" }} />
        <h3 className="text-sm font-semibold">PCO Sync Controls</h3>
      </div>

      {!isConnected ? (
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/20 text-xs text-muted-foreground">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Connect your Planning Center account above before running a sync.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Sync type selector */}
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-2">
              Sync Module
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SYNC_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedSync(opt.value)}
                  disabled={!!isJobRunning}
                  className={`text-left px-3 py-2 rounded-md border text-xs transition-colors disabled:opacity-50 ${
                    selectedSync === opt.value
                      ? "border-amber-500/60 bg-amber-50 dark:bg-amber-950/20"
                      : "border-border/40 hover:bg-muted/20"
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-muted-foreground mt-0.5">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Date range (optional) */}
          {(selectedSync === "attendance" || selectedSync === "giving" || selectedSync === "events" || selectedSync === "full") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                  From Date (optional)
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full bg-muted/30 rounded-md px-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                  To Date (optional)
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-muted/30 rounded-md px-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
              </div>
            </div>
          )}

          <button
            onClick={() =>
              startSyncMutation.mutate({
                syncType: selectedSync,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
              })
            }
            disabled={!!isJobRunning || startSyncMutation.isPending}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-md text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: "#E8913A" }}
          >
            {startSyncMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting…
              </>
            ) : isJobRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run {SYNC_OPTIONS.find((o) => o.value === selectedSync)?.label}
              </>
            )}
          </button>

          {/* Live job progress panel */}
          {activeJobId && jobStatus && (
            <div
              className={`rounded-md border p-3 text-xs space-y-2 ${
                jobStatus.status === "completed"
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
                  : jobStatus.status === "failed"
                  ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40"
                  : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40"
              }`}
            >
              {/* Status header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {jobStatus.status === "completed" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : jobStatus.status === "failed" ? (
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  )}
                  <span className="font-medium capitalize">{jobStatus.syncType}</span>
                </div>
                <span className="text-muted-foreground">
                  {jobStatus.recordsProcessed.toLocaleString()} records
                </span>
              </div>

              {/* Progress bar */}
              {(jobStatus.status === "running" || jobStatus.status === "pending") && (
                <div className="w-full bg-blue-200 dark:bg-blue-900/40 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${jobStatus.progress}%` }}
                  />
                </div>
              )}

              {/* Status message */}
              <p className="text-muted-foreground">{jobStatus.message}</p>

              {/* Per-module results when done */}
              {jobStatus.status !== "pending" && jobStatus.status !== "running" && jobStatus.results.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-current/10">
                  {jobStatus.results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {r.status === "completed" ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-500" />
                        )}
                        <span className="capitalize">{r.syncType}</span>
                        {r.errorMessage && <span className="text-muted-foreground">— {r.errorMessage}</span>}
                      </div>
                      <span className="text-muted-foreground">
                        {r.recordsProcessed.toLocaleString()} · {formatDuration(r.durationMs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Auth error: show reconnect prompt */}
              {jobStatus.status === "failed" && jobStatus.error?.toLowerCase().includes("token") && (
                <div className="flex items-center gap-2 pt-1 border-t border-red-200 dark:border-red-800/40">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span className="text-red-700 dark:text-red-400">
                    PCO session expired — scroll up and click <strong>"Connect to Planning Center"</strong> to re-authorize.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sync History */}
      {logs && logs.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Sync History ({logs.length})
            {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showLogs && (
            <div className="mt-3 space-y-1.5">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/20 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {log.status === "completed" ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    ) : log.status === "failed" ? (
                      <XCircle className="w-3 h-3 text-red-500" />
                    ) : (
                      <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                    )}
                    <span className="font-medium capitalize">{log.syncType}</span>
                    <span className="text-muted-foreground">{formatDate(log.startedAt)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{log.recordsProcessed?.toLocaleString() ?? 0} records</span>
                    <span>{formatDuration(log.durationMs)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Tab ────────────────────────────────────────────────────────
export default function SettingsTab() {
  const { data } = useData();

  const years = data?.meta.years ?? [];
  const campuses = data?.meta.campuses.filter((c) => c !== "All Campuses") ?? [];

  const dataStats = {
    years: years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : "—",
    campuses: campuses.length,
    attendanceRecords: data?.attendance.length ?? 0,
    givingRecords: data?.giving.length ?? 0,
    nextStepsRecords: data?.next_steps.length ?? 0,
    servingRecords: data?.serving.length ?? 0,
    monthlyRecords:
      (data?.attendance_monthly.length ?? 0) +
      (data?.giving_monthly.length ?? 0) +
      (data?.next_steps_monthly.length ?? 0) +
      (data?.serving_monthly.length ?? 0),
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Church Profile */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
          <Building2 className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold">Church Profile</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Church Name</label>
            <div className="bg-muted/30 rounded-md px-3 py-2 text-sm">Revolution Church</div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Location</label>
            <div className="bg-muted/30 rounded-md px-3 py-2 text-sm">Canton, GA</div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Campuses</label>
            <div className="flex gap-2 flex-wrap">
              {campuses.length > 0
                ? campuses.map((c) => (
                    <span key={c} className="text-xs px-2 py-1 rounded-md bg-muted/30">{c}</span>
                  ))
                : ["Canton", "Jasper", "Online"].map((c) => (
                    <span key={c} className="text-xs px-2 py-1 rounded-md bg-muted/30">{c}</span>
                  ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Data Range</label>
            <div className="bg-muted/30 rounded-md px-3 py-2 text-sm">{dataStats.years}</div>
          </div>
        </div>
      </div>

      {/* PCO Connection (OAuth) */}
      <PcoConnectionSection />

      {/* Sync Controls */}
      <SyncControlsSection />

      {/* Auto-Sync Scheduler */}
      <AutoSyncSection />

      {/* Data Source */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
          <Database className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold">Data Source</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">2014–2025 Data</span>
            <span className="text-xs font-medium">Google Sheets (historical, 12 workbooks)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">2026+ Data</span>
            <span className="text-xs font-medium">Planning Center Online (live sync via OAuth 2.0)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Attendance Records</span>
            <span className="text-xs font-mono">{dataStats.attendanceRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Giving Records</span>
            <span className="text-xs font-mono">{dataStats.givingRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Next Steps Records</span>
            <span className="text-xs font-mono">{dataStats.nextStepsRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Serving Records</span>
            <span className="text-xs font-mono">{dataStats.servingRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">Monthly Detail Records</span>
            <span className="text-xs font-mono">{dataStats.monthlyRecords.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Data Integrity Notes */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
          <Info className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold">Data Integrity Notes</h3>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>All historical data extracted directly from raw campus tab sheets (not History/Summary sheets) for maximum accuracy.</p>
          <p>2013 and 2015 data is not available (missing spreadsheets).</p>
          <p>2020–2021 serving data may be incomplete due to COVID-19 volunteer tracking changes.</p>
          <p>2026 data is YTD (January–March) and uses partial-year-aware comparisons.</p>
          <p>Online campus attendance tracking began in 2020. Jasper campus launched in 2017.</p>
          <p>From 2026 onward, all data comes exclusively from Planning Center Online (PCO). Historical spreadsheet data (2014–2025) is preserved and used for prior years.</p>
          <p>Auto-sync runs nightly at midnight (ET) to keep PCO data current.</p>
        </div>
      </div>

      {/* About */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
          <ExternalLink className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold">About Lumen Metrix</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Lumen Metrix is a church analytics platform that transforms raw data into actionable insights for church leaders.
          "Lumen" means light — we illuminate the path forward through measurement and clarity.
        </p>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Version 2.0.0</span>
          <a
            href="https://lumenmetrix.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:underline"
            style={{ color: "#E8913A" }}
          >
            lumenmetrix.com <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
