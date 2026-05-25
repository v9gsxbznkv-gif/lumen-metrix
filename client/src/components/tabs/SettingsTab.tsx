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
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Trash2,
  Copy,
  Ban,
  CheckCircle,
  Mail,
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
  const [manualJobId, setManualJobId] = useState<string | null>(null);
  const [manualJobDone, setManualJobDone] = useState(false);

  const triggerNightlySync = trpc.pco.triggerNightlySync.useMutation({
    onSuccess: (result) => {
      setManualJobId(result.jobId);
      setManualJobDone(false);
      toast.success("Nightly sync started — running in background");
    },
    onError: (err) => {
      toast.error(`Failed to start sync: ${err.message}`);
    },
  });

  // Poll the manual sync job status
  const { data: manualJobStatus } = trpc.pco.getSyncJobStatus.useQuery(
    { jobId: manualJobId ?? "" },
    { enabled: manualJobId != null && !manualJobDone, refetchInterval: 3000 }
  );

  // Handle job completion
  useEffect(() => {
    if (!manualJobStatus) return;
    if (manualJobStatus.status === "completed") {
      toast.success(`Nightly sync complete — ${manualJobStatus.recordsProcessed.toLocaleString()} records`);
      setManualJobDone(true);
    } else if (manualJobStatus.status === "failed") {
      toast.error(`Sync failed: ${manualJobStatus.error || "Unknown error"}`);
      setManualJobDone(true);
    }
  }, [manualJobStatus?.status]);

  const isConnected = connectionStatus?.connected === true;
  const isSyncing = triggerNightlySync.isPending || (manualJobId != null && !manualJobDone && manualJobStatus?.status === "running");

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
              {schedulerStatus?.isCurrentlySyncing || isSyncing
                ? "Syncing now..."
                : schedulerStatus?.lastSyncAt
                  ? formatDate(schedulerStatus.lastSyncAt)
                  : "Not yet (will run at midnight)"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Modules</span>
            <span className="text-xs">Attendance, Giving, Groups, Events, People, Volunteers</span>
          </div>

          {/* Sync Now button */}
          <button
            onClick={() => triggerNightlySync.mutate()}
            disabled={isSyncing || schedulerStatus?.isCurrentlySyncing}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-md text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: "#E8913A" }}
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Sync Now
              </>
            )}
          </button>

          {/* Manual sync progress */}
          {manualJobId && manualJobStatus && (
            <div className={`rounded-md border p-3 space-y-2 ${
              manualJobStatus.status === "completed"
                ? "border-green-500/40 bg-green-50 dark:bg-green-950/20"
                : manualJobStatus.status === "failed"
                ? "border-red-500/40 bg-red-50 dark:bg-red-950/20"
                : "border-border/40 bg-muted/10"
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${
                  manualJobStatus.status === "completed"
                    ? "text-green-700 dark:text-green-400"
                    : manualJobStatus.status === "failed"
                    ? "text-red-700 dark:text-red-400"
                    : "text-muted-foreground"
                }`}>
                  {manualJobStatus.status === "completed"
                    ? `Sync complete — ${manualJobStatus.recordsProcessed.toLocaleString()} records`
                    : manualJobStatus.status === "failed"
                    ? `Sync failed: ${manualJobStatus.error || "Unknown error"}`
                    : manualJobStatus.message || "Running nightly sync…"}
                </span>
              </div>
              {manualJobStatus.status === "running" && (
                <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 animate-pulse"
                    style={{ width: "100%", backgroundColor: "#E8913A" }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              The auto-sync runs a full sync of all PCO modules every night at midnight (ET). Use "Sync Now" to trigger an immediate sync. Data from 2026 onward is sourced exclusively from PCO. Historical data (2025 and earlier) is preserved from the original spreadsheets.
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
  // Persist the last known job status so the progress bar doesn't reset to 0
  // when activeJobId is cleared on completion/failure
  const [lastJobStatus, setLastJobStatus] = useState<{
    status: string;
    progress: number;
    message: string;
    recordsProcessed: number;
  } | null>(null);

  const { data: connectionStatus } = trpc.pco.getConnectionStatus.useQuery();
  const { data: logs, refetch: refetchLogs } = trpc.pco.getSyncLogs.useQuery({ limit: 10 });

  // Poll job status every 2 seconds while a job is running
  const { data: jobStatus } = trpc.pco.getSyncJobStatus.useQuery(
    { jobId: activeJobId ?? "" },
    { enabled: activeJobId != null, refetchInterval: 2000 }
  );

  // Mirror live job status into lastJobStatus so we always have the latest snapshot
  useEffect(() => {
    if (!jobStatus) return;
    setLastJobStatus({
      status: jobStatus.status,
      progress: jobStatus.progress,
      message: jobStatus.message,
      recordsProcessed: jobStatus.recordsProcessed,
    });
  }, [jobStatus]);

  // When job finishes, show toast and clear the active job
  useEffect(() => {
    if (!jobStatus) return;
    if (jobStatus.status === "completed") {
      toast.success(`Sync complete — ${jobStatus.recordsProcessed.toLocaleString()} records processed`);
      setActiveJobId(null);
      refetchLogs();
      // Auto-clear the completed panel after 8 seconds
      setTimeout(() => setLastJobStatus(null), 8000);
    } else if (jobStatus.status === "failed") {
      const errMsg = jobStatus.error ?? "Unknown error";
      if (errMsg.toLowerCase().includes("not connected") || errMsg.toLowerCase().includes("planning center")) {
        toast.error("PCO token expired — please reconnect Planning Center in the section above.", { duration: 8000 });
      } else {
        toast.error(`Sync failed: ${errMsg}`);
      }
      setActiveJobId(null);
      refetchLogs();
      // Keep failed state visible for 10 seconds
      setTimeout(() => setLastJobStatus(null), 10000);
    }
  }, [jobStatus?.status]);

  const syncMutation = trpc.pco.triggerSync.useMutation({
    onSuccess: (result) => {
      // Reset last status and start polling the new job
      setLastJobStatus({ status: "running", progress: 5, message: "Starting sync…", recordsProcessed: 0 });
      setActiveJobId(result.jobId);
    },
    onError: (err) => {
      const msg = err.message ?? "";
      if (msg.toLowerCase().includes("not connected") || msg.toLowerCase().includes("planning center")) {
        toast.error("PCO not connected — please reconnect Planning Center in the section above.", { duration: 8000 });
      } else {
        toast.error(`Sync failed: ${msg}`);
      }
    },
  });

  const isConnected = connectionStatus?.connected === true;
  const isRunning = syncMutation.isPending || (activeJobId != null && (jobStatus?.status === "running" || jobStatus == null));
  // Use live jobStatus when available, fall back to lastJobStatus to avoid reset
  const displayStatus = jobStatus ?? (lastJobStatus ? { ...lastJobStatus } as any : null);

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
                  disabled={isRunning}
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
                  disabled={isRunning}
                  className="w-full bg-muted/30 rounded-md px-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
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
                  disabled={isRunning}
                  className="w-full bg-muted/30 rounded-md px-3 py-2 text-sm border border-border/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <button
            onClick={() =>
              syncMutation.mutate({
                syncType: selectedSync,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
              })
            }
            disabled={isRunning}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-md text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: "#E8913A" }}
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting to PCO…
              </>
            ) : isRunning ? (
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

          {/* Live progress panel — shown while job is running or just completed */}
          {(activeJobId != null || lastJobStatus != null) && displayStatus && (
            <div className={`rounded-md border p-3 space-y-2 ${
              displayStatus.status === "completed"
                ? "border-green-500/40 bg-green-50 dark:bg-green-950/20"
                : displayStatus.status === "failed"
                ? "border-red-500/40 bg-red-50 dark:bg-red-950/20"
                : "border-border/40 bg-muted/10"
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${
                  displayStatus.status === "completed"
                    ? "text-green-700 dark:text-green-400"
                    : displayStatus.status === "failed"
                    ? "text-red-700 dark:text-red-400"
                    : "text-muted-foreground"
                }`}>
                  {displayStatus.status === "completed"
                    ? "✓ Sync complete"
                    : displayStatus.status === "failed"
                    ? "✗ Sync failed"
                    : displayStatus.message || "Connecting to PCO…"}
                </span>
                <span className="text-muted-foreground">
                  {displayStatus.progress}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${displayStatus.progress}%`,
                    backgroundColor:
                      displayStatus.status === "completed" ? "#4A7C59"
                      : displayStatus.status === "failed" ? "#C45B4A"
                      : "#E8913A",
                  }}
                />
              </div>
              {displayStatus.recordsProcessed > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  {displayStatus.recordsProcessed.toLocaleString()} records processed
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

// ─── Manual Giving Entry Section ─────────────────────────────────────────────
function GivingEntrySection() {
  const CAMPUSES = ["Canton", "Jasper"];
  const [weekDate, setWeekDate] = useState(() => {
    // Default to most recent Sunday
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  });

  // Fetch existing data for selected week
  const { data: existingRows, refetch } = trpc.pco.getWeeklyGiving.useQuery(
    { weekStartDate: weekDate },
    { enabled: !!weekDate }
  );

  // Form state per campus
  const [formData, setFormData] = useState<Record<string, { total: string; general: string; designated: string; donationCount: string; locked: boolean }>>({});

  // Populate form when data loads
  useEffect(() => {
    const newData: typeof formData = {};
    for (const campus of CAMPUSES) {
      const row = existingRows?.find((r: any) => r.campus === campus);
      if (row) {
        newData[campus] = {
          total: String(Number(row.total) || 0),
          general: String(Number(row.general) || 0),
          designated: String(Number(row.designated) || 0),
          donationCount: String(row.donationCount || 0),
          locked: !!(row as any).manualLock,
        };
      } else {
        newData[campus] = { total: "0", general: "0", designated: "0", donationCount: "0", locked: false };
      }
    }
    setFormData(newData);
  }, [existingRows, weekDate]);

  const upsertMutation = trpc.pco.upsertWeeklyGiving.useMutation({
    onSuccess: () => {
      toast.success("Giving data saved");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const unlockMutation = trpc.pco.unlockWeeklyGiving.useMutation({
    onSuccess: () => {
      toast.success("Unlocked — auto-sync can now overwrite");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (campus: string) => {
    const d = formData[campus];
    if (!d) return;
    upsertMutation.mutate({
      weekStartDate: weekDate,
      campus,
      total: parseFloat(d.total) || 0,
      general: parseFloat(d.general) || 0,
      designated: parseFloat(d.designated) || 0,
      donationCount: parseInt(d.donationCount) || 0,
      lock: true,
    });
  };

  const updateField = (campus: string, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [campus]: { ...prev[campus], [field]: value },
    }));
  };

  // Auto-calculate total when general/designated change
  const autoTotal = (campus: string, field: "general" | "designated", value: string) => {
    const d = formData[campus];
    if (!d) return;
    const gen = field === "general" ? parseFloat(value) || 0 : parseFloat(d.general) || 0;
    const des = field === "designated" ? parseFloat(value) || 0 : parseFloat(d.designated) || 0;
    setFormData(prev => ({
      ...prev,
      [campus]: { ...prev[campus], [field]: value, total: String((gen + des).toFixed(2)) },
    }));
  };

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
        <span className="text-base" style={{ color: "#E8913A" }}>$</span>
        <h3 className="text-sm font-semibold">Manual Giving Entry</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Locked rows won't be overwritten by auto-sync</span>
      </div>

      {/* Week Picker */}
      <div className="mb-4">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Week Starting (Sunday)</label>
        <input
          type="date"
          value={weekDate}
          onChange={(e) => setWeekDate(e.target.value)}
          className="bg-muted/30 border border-border/40 rounded-md px-3 py-1.5 text-sm w-48"
        />
      </div>

      {/* Per-Campus Entry */}
      <div className="space-y-4">
        {CAMPUSES.map((campus) => {
          const d = formData[campus];
          if (!d) return null;
          const existingRow = existingRows?.find((r: any) => r.campus === campus);
          const isLocked = !!(existingRow as any)?.manualLock;
          return (
            <div key={campus} className="border border-border/30 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">{campus}</span>
                <div className="flex items-center gap-2">
                  {isLocked && (
                    <button
                      onClick={() => unlockMutation.mutate({ weekStartDate: weekDate, campus })}
                      className="text-[10px] text-amber-500 hover:underline"
                    >
                      🔒 Unlock
                    </button>
                  )}
                  {existingRow && (
                    <span className="text-[10px] text-muted-foreground">
                      Source: {(existingRow as any).source || "unknown"}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">General $</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.general}
                    onChange={(e) => autoTotal(campus, "general", e.target.value)}
                    className="bg-muted/30 border border-border/40 rounded px-2 py-1 text-sm w-full font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Designated $</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.designated}
                    onChange={(e) => autoTotal(campus, "designated", e.target.value)}
                    className="bg-muted/30 border border-border/40 rounded px-2 py-1 text-sm w-full font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Total $</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.total}
                    onChange={(e) => updateField(campus, "total", e.target.value)}
                    className="bg-muted/20 border border-border/40 rounded px-2 py-1 text-sm w-full font-mono text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5"># Donations</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={d.donationCount}
                    onChange={(e) => updateField(campus, "donationCount", e.target.value)}
                    className="bg-muted/30 border border-border/40 rounded px-2 py-1 text-sm w-full font-mono"
                  />
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => handleSave(campus)}
                  disabled={upsertMutation.isPending}
                  className="text-xs px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                >
                  {upsertMutation.isPending ? "Saving..." : "Save & Lock"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Team Management Section (Admin Only) ───────────────────────────────────
function TeamManagementSection({ currentUser }: { currentUser: { id: number; email: string; name: string; role: string } | null | undefined }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState("");

  const utils = trpc.useUtils();

  const { data: users, isLoading: usersLoading } = trpc.staffAuth.listUsers.useQuery(undefined, {
    retry: false,
  });

  const { data: invites } = trpc.staffAuth.listInvites.useQuery(undefined, {
    retry: false,
  });

  const inviteMutation = trpc.staffAuth.invite.useMutation({
    onSuccess: (result) => {
      toast.success(`Invite sent to ${result.email}`);
      setCopiedUrl(result.inviteUrl);
      setInviteEmail("");
      setShowInviteForm(false);
      utils.staffAuth.listInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleStatusMutation = trpc.staffAuth.toggleUserStatus.useMutation({
    onSuccess: () => {
      toast.success("User status updated");
      utils.staffAuth.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUserMutation = trpc.staffAuth.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User removed");
      utils.staffAuth.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleRoleMutation = trpc.staffAuth.toggleRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated");
      utils.staffAuth.listUsers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = trpc.staffAuth.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success("Invite revoked");
      utils.staffAuth.listInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  }

  function copyToClipboard(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    toast.success("Invite link copied!");
    setTimeout(() => setCopiedUrl(""), 3000);
  }

  const isAdmin = currentUser?.role === "admin";
  if (!isAdmin) return null;

  const pendingInvites = invites?.filter(i => !i.used && !i.expired) ?? [];

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold">Team Members</h3>
        </div>
        <button
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "#E8913A" }}
        >
          <UserPlus className="w-3 h-3" />
          Invite
        </button>
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <form onSubmit={handleInvite} className="mb-4 p-3 rounded-md bg-muted/20 border border-border/30">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5">Email Address</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="staff@revolution.church"
                className="w-full rounded-md pl-8 pr-3 py-2 text-xs bg-background border border-border/60 outline-none focus:border-[#E8913A] transition-colors"
                disabled={inviteMutation.isPending}
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "user")}
              className="rounded-md px-2 py-2 text-xs bg-background border border-border/60 outline-none focus:border-[#E8913A] transition-colors"
              disabled={inviteMutation.isPending}
            >
              <option value="user">Team Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#E8913A" }}
            >
              {inviteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              Send Invite
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Invite expires in 7 days. User will create their own password. An email will be sent via Resend.</p>
        </form>
      )}

      {/* Copied URL banner */}
      {copiedUrl && (
        <div className="mb-4 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium mb-1">Invite Link (copy and send to user):</p>
              <p className="text-[11px] font-mono text-emerald-800 dark:text-emerald-300 truncate">{copiedUrl}</p>
            </div>
            <button
              onClick={() => copyToClipboard(copiedUrl)}
              className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 transition-colors"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
        </div>
      )}

      {/* Users List */}
      {usersLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#E8913A" }} />
        </div>
      ) : (
        <div className="space-y-2">
          {users?.map((user) => (
            <div
              key={user.id}
              className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                user.status === "disabled" ? "border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-950/10" : "border-border/30 bg-muted/10"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  user.role === "admin" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                }`}>
                  {user.name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{user.name || "Unnamed"}</span>
                    {user.role === "admin" && (
                      <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        <ShieldCheck className="w-2.5 h-2.5" /> Admin
                      </span>
                    )}
                    {user.status === "disabled" && (
                      <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                        <Ban className="w-2.5 h-2.5" /> Disabled
                      </span>
                    )}
                    {user.id === currentUser?.id && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">You</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                  {user.lastLoginAt && (
                    <p className="text-[9px] text-muted-foreground/60">Last login: {formatDate(user.lastLoginAt)}</p>
                  )}
                </div>
              </div>

              {/* Actions (can't modify yourself) */}
              {user.id !== currentUser?.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      const newRole = user.role === "admin" ? "user" : "admin";
                      if (confirm(`${newRole === "admin" ? "Promote" : "Demote"} ${user.name || user.email} to ${newRole}?`)) {
                        toggleRoleMutation.mutate({ userId: user.id, role: newRole });
                      }
                    }}
                    disabled={toggleRoleMutation.isPending}
                    className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    title={user.role === "admin" ? "Demote to user" : "Promote to admin"}
                  >
                    {user.role === "admin" ? (
                      <Shield className="w-3.5 h-3.5 text-amber-500 hover:text-muted-foreground" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 text-muted-foreground hover:text-amber-500" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      const newStatus = user.status === "active" ? "disabled" : "active";
                      toggleStatusMutation.mutate({ userId: user.id, status: newStatus });
                    }}
                    disabled={toggleStatusMutation.isPending}
                    className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    title={user.status === "active" ? "Disable user" : "Enable user"}
                  >
                    {user.status === "active" ? (
                      <Ban className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-emerald-500" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${user.name || user.email}? This cannot be undone.`)) {
                        deleteUserMutation.mutate({ userId: user.id });
                      }
                    }}
                    disabled={deleteUserMutation.isPending}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    title="Delete user"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Pending Invites</p>
          <div className="space-y-1.5">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/10">
                <div className="flex items-center gap-2">
                  <Mail className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs">{inv.email}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    (inv as any).role === "admin"
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                      : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                  }`}>
                    {(inv as any).role === "admin" ? "Admin" : "Member"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm(`Revoke invite for ${inv.email}?`)) {
                        revokeMutation.mutate({ inviteId: inv.id });
                      }
                    }}
                    disabled={revokeMutation.isPending}
                    className="text-[9px] px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    title="Revoke invite"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Tab ────────────────────────────────────────────────────────
interface SettingsTabProps {
  currentUser?: { id: number; email: string; name: string; role: string } | null;
}

export default function SettingsTab({ currentUser }: SettingsTabProps) {
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

      {/* Team Management (Admin Only) */}
      <TeamManagementSection currentUser={currentUser} />

      {/* PCO Connection (OAuth) */}
      <PcoConnectionSection />

      {/* Sync Controls */}
      <SyncControlsSection />

      {/* Auto-Sync Scheduler */}
      <AutoSyncSection />

      {/* Manual Giving Entry */}
      <GivingEntrySection />

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
