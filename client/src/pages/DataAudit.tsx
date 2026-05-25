/**
 * Data Audit Page — Admin Only
 * Shows raw records from the database so admins can verify numbers against PCO.
 * Tabs: Attendance | Giving | Groups | Health Flags | Cross-Tab Check
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, XCircle, Info, RefreshCw, Database, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

const CAMPUSES = ["All", "Canton", "Jasper"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3].map(String);
const MONTHS = [
  { value: "0", label: "All Months" },
  { value: "1", label: "January" }, { value: "2", label: "February" },
  { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

function fmt(n: number | string | null | undefined) {
  if (n == null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  return isNaN(num) ? "—" : num.toLocaleString();
}

function fmtMoney(n: number | string | null | undefined) {
  if (n == null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  return isNaN(num) ? "—" : `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "error") return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
  return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
}

// ─── Attendance Tab ───────────────────────────────────────────────────────────
function AttendanceTab() {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [campus, setCampus] = useState("Canton");
  const [month, setMonth] = useState("0");

  const { data, isLoading, refetch } = trpc.audit.rawAttendanceWeekly.useQuery({
    year: parseInt(year),
    campus: campus === "All" ? undefined : campus,
    month: month !== "0" ? parseInt(month) : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={campus} onValueChange={setCampus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{CAMPUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">{data?.length ?? 0} records</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading records...</div>
      ) : !data?.length ? (
        <div className="text-center py-12 text-muted-foreground">No records found for this selection.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Date", "Campus", "Subgroup", "Headcount", "Regular", "Guests", "Volunteers", "Source", "Cancelled", "Manual Lock", "Synced"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id} className={`border-t border-border ${i % 2 === 0 ? "" : "bg-muted/20"} ${row.cancelled ? "opacity-50" : ""}`}>
                  <td className="px-3 py-1.5 font-mono text-xs">{row.weekStartDate}</td>
                  <td className="px-3 py-1.5">{row.campus}</td>
                  <td className="px-3 py-1.5 max-w-[200px] truncate" title={row.subgroup}>{row.subgroup}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{fmt(row.headcount)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.regularCount)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.guestCount)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.volunteerCount)}</td>
                  <td className="px-3 py-1.5"><Badge variant="outline" className="text-xs">{row.source}</Badge></td>
                  <td className="px-3 py-1.5">{row.cancelled ? <Badge variant="destructive" className="text-xs">Yes</Badge> : <span className="text-muted-foreground text-xs">No</span>}</td>
                  <td className="px-3 py-1.5">{row.manualLock ? <Badge className="text-xs bg-amber-600">Locked</Badge> : <span className="text-muted-foreground text-xs">No</span>}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Giving Tab ───────────────────────────────────────────────────────────────
function GivingTab() {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [campus, setCampus] = useState("Canton");
  const [month, setMonth] = useState("0");

  const { data, isLoading, refetch } = trpc.audit.rawGivingWeekly.useQuery({
    year: parseInt(year),
    campus: campus === "All" ? undefined : campus,
    month: month !== "0" ? parseInt(month) : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={campus} onValueChange={setCampus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{CAMPUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">{data?.length ?? 0} records</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading records...</div>
      ) : !data?.length ? (
        <div className="text-center py-12 text-muted-foreground">No records found for this selection.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Week Start", "Campus", "Total", "General", "Designated", "Donations", "Source", "Cancelled", "Manual Lock", "Synced"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id} className={`border-t border-border ${i % 2 === 0 ? "" : "bg-muted/20"} ${row.cancelled ? "opacity-50" : ""}`}>
                  <td className="px-3 py-1.5 font-mono text-xs">{row.weekStartDate}</td>
                  <td className="px-3 py-1.5">{row.campus}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{fmtMoney(row.total)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtMoney(row.general)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtMoney(row.designated)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.donationCount)}</td>
                  <td className="px-3 py-1.5"><Badge variant="outline" className="text-xs">{row.source}</Badge></td>
                  <td className="px-3 py-1.5">{row.cancelled ? <Badge variant="destructive" className="text-xs">Yes</Badge> : <span className="text-muted-foreground text-xs">No</span>}</td>
                  <td className="px-3 py-1.5">{row.manualLock ? <Badge className="text-xs bg-amber-600">Locked</Badge> : <span className="text-muted-foreground text-xs">No</span>}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Groups Tab ───────────────────────────────────────────────────────────────
function GroupsAuditTab() {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [campus, setCampus] = useState("Canton");

  const { data, isLoading, refetch } = trpc.audit.rawGroupsMonthly.useQuery({
    year: parseInt(year),
    campus: campus === "All" ? undefined : campus,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={campus} onValueChange={setCampus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{CAMPUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">{data?.length ?? 0} records</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading records...</div>
      ) : !data?.length ? (
        <div className="text-center py-12 text-muted-foreground">No records found for this selection.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Month", "Campus", "Total Groups", "Active Groups", "Members", "Leaders", "Avg Attendance", "Source"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id} className={`border-t border-border ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-3 py-1.5">{new Date(row.year, row.month - 1, 1).toLocaleString("default", { month: "long" })}</td>
                  <td className="px-3 py-1.5">{row.campus}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{fmt(row.totalGroups)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.activeGroups)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.totalMembers)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.totalLeaders)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.avgAttendance)}</td>
                  <td className="px-3 py-1.5"><Badge variant="outline" className="text-xs">{row.source}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Health Flags Tab ─────────────────────────────────────────────────────────
function HealthFlagsTab() {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [campus, setCampus] = useState("All");

  const { data, isLoading, refetch } = trpc.audit.healthFlags.useQuery({
    year: parseInt(year),
    campus: campus === "All" ? undefined : campus,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={campus} onValueChange={setCampus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{CAMPUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Checks
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Running health checks...</div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-red-500/30">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <div className="text-2xl font-bold text-red-500">{data.summary.errors}</div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/30">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <div>
                    <div className="text-2xl font-bold text-amber-500">{data.summary.warnings}</div>
                    <div className="text-xs text-muted-foreground">Warnings</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-500/30">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="text-2xl font-bold text-blue-400">{data.summary.info}</div>
                    <div className="text-xs text-muted-foreground">Info</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {data.flags.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <div className="font-medium text-green-400">All checks passed</div>
                <div className="text-sm text-muted-foreground">No data issues found for {year}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {data.flags.map((flag, i) => (
                <div
                  key={i}
                  className={`flex gap-3 p-3 rounded-lg border ${
                    flag.severity === "error"
                      ? "bg-red-500/5 border-red-500/20"
                      : flag.severity === "warning"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-blue-500/5 border-blue-500/20"
                  }`}
                >
                  <SeverityIcon severity={flag.severity} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          flag.severity === "error" ? "border-red-500/40 text-red-400" :
                          flag.severity === "warning" ? "border-amber-500/40 text-amber-400" :
                          "border-blue-500/40 text-blue-400"
                        }`}
                      >
                        {flag.category}
                      </Badge>
                      <span className="text-sm font-medium">{flag.message}</span>
                    </div>
                    {flag.detail && (
                      <div className="text-xs text-muted-foreground mt-0.5">{flag.detail}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Cross-Tab Check Tab ──────────────────────────────────────────────────────
function CrossTabCheckTab() {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [campus, setCampus] = useState("Canton");

  const { data, isLoading, refetch } = trpc.audit.crossTabCheck.useQuery({
    year: parseInt(year),
    month: parseInt(month),
    campus,
  });

  function MatchBadge({ match, variance }: { match: boolean; variance: number }) {
    if (match) return (
      <div className="flex items-center gap-1.5 text-green-400">
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-sm font-medium">Match</span>
      </div>
    );
    return (
      <div className="flex items-center gap-1.5 text-red-400">
        <XCircle className="w-4 h-4" />
        <span className="text-sm font-medium">Mismatch (variance: {variance > 0 ? "+" : ""}{fmt(variance)})</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.slice(1).map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={campus} onValueChange={setCampus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{["Canton", "Jasper"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Run Check
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Running consistency check...</div>
      ) : !data ? null : (
        <div className="space-y-4">
          <div className="text-sm font-medium text-muted-foreground">{data.period}</div>

          {/* Attendance consistency */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Attendance — Adults</CardTitle>
              <CardDescription>Compares sum of weekly raw records vs. monthly aggregate stored in DB</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Weekly Raw Sum</div>
                  <div className="text-2xl font-bold">{fmt(data.attendance.weeklyRawSum)}</div>
                  <div className="text-xs text-muted-foreground">Sum of attendance_weekly headcounts</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Monthly Aggregate Total</div>
                  <div className="text-2xl font-bold">{fmt(data.attendance.monthlyAggregateTotal)}</div>
                  <div className="text-xs text-muted-foreground">attendance_monthly.total (Adults)</div>
                </div>
              </div>
              <MatchBadge match={data.attendance.match} variance={data.attendance.variance} />
              {!data.attendance.match && (
                <p className="text-xs text-muted-foreground mt-2">
                  A variance here means the monthly aggregate wasn't recalculated after weekly records changed, or the sync logic counts differently. Check if any weeks are marked cancelled or manually locked.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Giving consistency */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Giving — Total</CardTitle>
              <CardDescription>Compares sum of weekly giving records vs. monthly aggregate stored in DB</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Weekly Raw Sum</div>
                  <div className="text-2xl font-bold">{fmtMoney(data.giving.weeklyRawSum)}</div>
                  <div className="text-xs text-muted-foreground">Sum of giving_weekly.total</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Monthly Aggregate Total</div>
                  <div className="text-2xl font-bold">{fmtMoney(data.giving.monthlyAggregateTotal)}</div>
                  <div className="text-xs text-muted-foreground">giving_monthly sum</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                <div>
                  <span className="text-muted-foreground">General: </span>
                  <span className="font-medium">{fmtMoney(data.giving.weeklyGeneral)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Designated: </span>
                  <span className="font-medium">{fmtMoney(data.giving.weeklyDesignated)}</span>
                </div>
              </div>
              <MatchBadge match={data.giving.match} variance={data.giving.variance} />
            </CardContent>
          </Card>

          {/* Groups */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Groups — Monthly Record</CardTitle>
              <CardDescription>Raw groups_monthly row for this period</CardDescription>
            </CardHeader>
            <CardContent>
              {data.groups ? (
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Total Groups</div>
                    <div className="text-xl font-bold">{fmt(data.groups.totalGroups)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Active Groups</div>
                    <div className="text-xl font-bold">{fmt(data.groups.activeGroups)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Members</div>
                    <div className="text-xl font-bold">{fmt(data.groups.totalMembers)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Leaders</div>
                    <div className="text-xl font-bold">{fmt(data.groups.totalLeaders)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avg Attendance</div>
                    <div className="text-xl font-bold">{fmt(data.groups.avgAttendance)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Source</div>
                    <Badge variant="outline" className="text-xs">{data.groups.source}</Badge>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">No groups record found for this period.</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Sync Logs Tab ────────────────────────────────────────────────────────────
function SyncLogsTab() {
  const { data, isLoading, refetch } = trpc.audit.syncLogs.useQuery({ limit: 100 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{data?.length ?? 0} recent sync operations</span>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading sync logs...</div>
      ) : !data?.length ? (
        <div className="text-center py-12 text-muted-foreground">No sync logs found.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Started", "Type", "Status", "Records", "Created", "Updated", "Duration", "Error"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id} className={`border-t border-border ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-3 py-1.5 text-xs font-mono">{new Date(row.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-1.5"><Badge variant="outline" className="text-xs">{row.syncType}</Badge></td>
                  <td className="px-3 py-1.5">
                    <Badge className={`text-xs ${row.status === "completed" ? "bg-green-600" : row.status === "failed" ? "bg-red-600" : "bg-amber-600"}`}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.recordsProcessed)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.recordsCreated)}</td>
                  <td className="px-3 py-1.5 text-right">{fmt(row.recordsUpdated)}</td>
                  <td className="px-3 py-1.5 text-right text-xs">{row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-red-400 max-w-[200px] truncate" title={row.errorMessage ?? ""}>{row.errorMessage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DataAudit() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Database className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Data Audit</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verify dashboard numbers against raw PCO source data. Use this to diagnose discrepancies before reporting.
          </p>
        </div>
      </div>

      <Tabs defaultValue="health">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="health" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Health Flags
          </TabsTrigger>
          <TabsTrigger value="crosstab">Cross-Tab Check</TabsTrigger>
          <TabsTrigger value="attendance">Raw Attendance</TabsTrigger>
          <TabsTrigger value="giving">Raw Giving</TabsTrigger>
          <TabsTrigger value="groups">Raw Groups</TabsTrigger>
          <TabsTrigger value="synclogs">Sync Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <HealthFlagsTab />
        </TabsContent>
        <TabsContent value="crosstab" className="mt-4">
          <CrossTabCheckTab />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab />
        </TabsContent>
        <TabsContent value="giving" className="mt-4">
          <GivingTab />
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <GroupsAuditTab />
        </TabsContent>
        <TabsContent value="synclogs" className="mt-4">
          <SyncLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
