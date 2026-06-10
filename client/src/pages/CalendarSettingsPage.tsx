import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, RefreshCw, Calendar, Download, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { MinistryManager } from "@/components/settings/MinistryManager";
import { CampusManager } from "@/components/settings/CampusManager";

export default function SettingsPage() {
  const [syncing, setSyncing] = useState(false);

  const statusQuery = trpc.calendar.getGoogleCalendarStatus.useQuery();
  const status = statusQuery.data;
  const isConfigured = status?.configured;
  type SyncLogEntry = { id: number; eventId: number; action: string; googleEventId?: string | null; errorMessage?: string | null; syncedAt: Date | string };
  const syncLog: SyncLogEntry[] = (status?.recentLog ?? []) as SyncLogEntry[];

  const handleFullSync = () => {
    setSyncing(true);
    toast.info("Sync is triggered automatically when events are approved. Approve events on the Approvals page to push them to Google Calendar.", { duration: 5000 });
    setTimeout(() => setSyncing(false), 1000);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure Google Calendar sync and manage calendar integrations.
        </p>
      </div>

      {/* Google Calendar Integration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Google Calendar Sync</CardTitle>
            </div>
            {isConfigured ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                <XCircle className="w-3 h-3 mr-1" /> Not Connected
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            When connected, approved events are automatically pushed to your church-wide Google Calendar.
            Rejected events are removed. Edits sync in real-time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConfigured ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-600">Google Calendar credentials not configured</p>
                  <p className="text-xs text-muted-foreground">
                    To enable automatic sync, add your Google Service Account JSON and Calendar ID as environment secrets.
                    Once added, all approved events will sync automatically — no further action needed.
                  </p>
                </div>
              </div>
              <div className="rounded-md bg-card border border-border p-3 font-mono text-xs space-y-1 text-muted-foreground">
                <p className="text-foreground font-semibold mb-2">Required secrets:</p>
                <p><span className="text-primary">GOOGLE_SERVICE_ACCOUNT_JSON</span> — Service account key JSON (from Google Cloud Console)</p>
                <p><span className="text-primary">GOOGLE_CALENDAR_ID</span> — Target calendar ID (e.g. <span className="text-amber-500">abc123@group.calendar.google.com</span>)</p>
              </div>
              <div className="rounded-md bg-card border border-border p-3 text-xs space-y-2">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" /> How to set up a Google Service Account
                </p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Go to <span className="text-primary">console.cloud.google.com</span> → APIs &amp; Services → Credentials</li>
                  <li>Create a Service Account → download the JSON key file</li>
                  <li>In Google Calendar, share your church calendar with the service account email (give it "Make changes to events" permission)</li>
                  <li>Add the JSON contents as <code className="bg-muted px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> and the calendar ID as <code className="bg-muted px-1 rounded">GOOGLE_CALENDAR_ID</code> in Settings → Secrets</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-card/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Calendar ID</p>
                  <p className="font-mono text-xs truncate">{status?.calendarId || "—"}</p>
                </div>
                <div className="rounded-lg border border-border bg-card/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Last Sync</p>
                  <p className="text-xs">
                    {syncLog[0]?.syncedAt
                      ? format(new Date(syncLog[0].syncedAt), "MMM d, h:mm a")
                      : "Never"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleFullSync}
                  disabled={syncing}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : "Sync Info"}
                </Button>
                <p className="text-xs text-muted-foreground self-center">
                  Events sync automatically when approved
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* iCal Export */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">iCal / .ics Export</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Download a .ics file to import into Google Calendar, Apple Calendar, or Outlook.
            Use the Export button in the Calendar toolbar to filter by campus or ministry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[2025, 2026, 2027].map((year) => (
              <Button
                key={year}
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 justify-start"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/ical?year=${year}`);
                    const text = await res.text();
                    const blob = new Blob([text], { type: "text/calendar" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `lumenmetrix-all-${year}.ics`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(`${year} calendar exported`);
                  } catch {
                    toast.error("Export failed");
                  }
                }}
              >
                <Download className="w-3 h-3" />
                All Campuses — {year}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sync Log */}
      {isConfigured && syncLog.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Sync Activity</CardTitle>
            <CardDescription className="text-xs">Last 10 Google Calendar sync operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {syncLog.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-xs">
                  <div className="flex items-center gap-2">
                    {log.action === "created" || log.action === "updated" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : log.action === "deleted" ? (
                      <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                    <span className="font-medium truncate max-w-[200px]">Event #{log.eventId}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {log.action}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {log.syncedAt ? format(new Date(log.syncedAt), "MMM d, h:mm a") : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Ministries Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ministries</CardTitle>
          <CardDescription>Rename ministries, change their colors, and adjust display order. Colors appear on event chips and the ministry legend throughout the calendar.</CardDescription>
        </CardHeader>
        <CardContent>
          <MinistryManager />
        </CardContent>
      </Card>

      {/* Campuses Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campuses</CardTitle>
          <CardDescription>Add, rename, or recolor campuses. Campuses with existing events cannot be deleted — reassign those events first.</CardDescription>
        </CardHeader>
        <CardContent>
          <CampusManager />
        </CardContent>
      </Card>

      <Separator />

      {/* About */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">LumenMetrix Smart Calendar</p>
        <p>Multi-campus church scheduling and event management. Built for Revolution Church.</p>
        <p>When connected to LumenMetrix, login will be managed through the main platform.</p>
      </div>
    </div>
  );
}
