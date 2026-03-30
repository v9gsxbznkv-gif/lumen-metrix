/**
 * Weekly Report Tab — snapshot of the most recent week's numbers per campus
 * with comparison options and auto-generation scheduling.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Users,
  DollarSign,
  Heart,
  UserPlus,
  Sparkles,
  Droplets,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarClock,
  Send,
  Loader2,
  Settings,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CampusMetrics {
  campus: string;
  attendance: number;
  giving: number;
  volunteers: number;
  ftg: number;
  salvations: number;
  baptisms: number;
}

interface WeeklyPeriod {
  year: number;
  month: number;
  label: string;
  weekNumber: number;
  campuses: CampusMetrics[];
  totals: CampusMetrics;
}

type ComparisonKey = "sameWeekLastYear" | "previousWeek" | "samePeriodLastYear";

const COMPARISON_LABELS: Record<ComparisonKey, string> = {
  sameWeekLastYear: "Same Week Last Year",
  previousWeek: "Previous Week",
  samePeriodLastYear: "Same Period Last Year (YTD)",
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const METRIC_CONFIG = [
  { key: "attendance" as const, label: "Attendance", icon: Users, color: "#4A7FB5", prefix: "" },
  { key: "giving" as const, label: "Giving", icon: DollarSign, color: "#4A7C59", prefix: "$" },
  { key: "volunteers" as const, label: "Volunteers", icon: Heart, color: "#8B6DAF", prefix: "" },
  { key: "ftg" as const, label: "First-Time Guests", icon: UserPlus, color: "#E8913A", prefix: "" },
  { key: "salvations" as const, label: "Salvations", icon: Sparkles, color: "#C45B4A", prefix: "" },
  { key: "baptisms" as const, label: "Baptisms", icon: Droplets, color: "#2D8B8B", prefix: "" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(val: number, prefix: string): string {
  if (prefix === "$") {
    return val >= 1000
      ? `$${(val / 1000).toFixed(1)}K`
      : `$${val.toLocaleString()}`;
  }
  return val.toLocaleString();
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const change = pctChange(current, previous);
  if (change === null) return <span className="text-[11px] text-muted-foreground">—</span>;

  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 0.5;

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-medium"
      style={{ color: isNeutral ? "#9CA3AF" : isPositive ? "#4A7C59" : "#C45B4A" }}
    >
      {isNeutral ? (
        <Minus className="w-3 h-3" />
      ) : isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {isNeutral ? "0%" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WeeklyReportTab() {
  const { isAuthenticated } = useAuth();
  const currentYear = new Date().getFullYear();

  // State
  const [selectedComparisons, setSelectedComparisons] = useState<ComparisonKey[]>(["previousWeek"]);
  const [showScheduleSettings, setShowScheduleSettings] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Queries
  const { data: reportData, isLoading } = trpc.weeklyReport.getData.useQuery({
    year: selectedYear,
    comparisons: selectedComparisons,
  });

  const { data: scheduleData } = trpc.weeklyReport.getSchedule.useQuery();
  const utils = trpc.useUtils();

  // Mutations
  const saveScheduleMutation = trpc.weeklyReport.saveSchedule.useMutation({
    onSuccess: () => {
      utils.weeklyReport.getSchedule.invalidate();
      toast.success("Schedule saved");
    },
    onError: () => toast.error("Failed to save schedule"),
  });

  const generateMutation = trpc.weeklyReport.generateAndSend.useMutation({
    onSuccess: (data) => {
      utils.weeklyReport.getSchedule.invalidate();
      toast.success("Weekly report generated and sent");
    },
    onError: () => toast.error("Failed to generate report"),
  });

  // Schedule form state
  const [schedDay, setSchedDay] = useState(scheduleData?.dayOfWeek ?? 1);
  const [schedHour, setSchedHour] = useState(scheduleData?.hour ?? 8);
  const [schedMinute, setSchedMinute] = useState(scheduleData?.minute ?? 0);
  const [schedEnabled, setSchedEnabled] = useState(scheduleData?.enabled ?? false);

  // Update schedule form when data loads
  useMemo(() => {
    if (scheduleData) {
      setSchedDay(scheduleData.dayOfWeek);
      setSchedHour(scheduleData.hour);
      setSchedMinute(scheduleData.minute);
      setSchedEnabled(scheduleData.enabled);
    }
  }, [scheduleData]);

  // Toggle comparison
  const toggleComparison = (key: ComparisonKey) => {
    setSelectedComparisons((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const current = reportData?.current;
  const comparisons = reportData?.comparisons;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#E8913A" }} />
        <span className="ml-2 text-muted-foreground">Loading weekly report...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowScheduleSettings(!showScheduleSettings)}
          className="gap-1.5"
        >
          <CalendarClock className="w-3.5 h-3.5" />
          Auto-Generate
          {showScheduleSettings ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </Button>

        <Button
          size="sm"
          onClick={() =>
            generateMutation.mutate({
              year: selectedYear,
              comparisons: selectedComparisons,
            })
          }
          disabled={generateMutation.isPending || !isAuthenticated}
          className="gap-1.5"
          style={{ background: "#E8913A" }}
        >
          {generateMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Generate & Send
        </Button>
      </div>

      {/* Auto-generation schedule settings */}
      {showScheduleSettings && (
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
            <Settings className="w-4 h-4" style={{ color: "#E8913A" }} />
            <h3 className="text-sm font-semibold">Auto-Generation Schedule</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Set a recurring day and time for the weekly report to auto-generate and send via notification.
          </p>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Day</label>
              <Select value={String(schedDay)} onValueChange={(v) => setSchedDay(Number(v))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_LABELS.map((label, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Time (ET)</label>
              <div className="flex items-center gap-1">
                <Select value={String(schedHour)} onValueChange={(v) => setSchedHour(Number(v))}>
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">:</span>
                <Select value={String(schedMinute)} onValueChange={(v) => setSchedMinute(Number(v))}>
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 15, 30, 45].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {String(m).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={schedEnabled}
                onCheckedChange={setSchedEnabled}
              />
              <span className="text-xs">{schedEnabled ? "Enabled" : "Disabled"}</span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                saveScheduleMutation.mutate({
                  dayOfWeek: schedDay,
                  hour: schedHour,
                  minute: schedMinute,
                  enabled: schedEnabled,
                })
              }
              disabled={saveScheduleMutation.isPending || !isAuthenticated}
            >
              {saveScheduleMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : null}
              Save Schedule
            </Button>
          </div>

          {scheduleData?.lastGeneratedAt && (
            <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last generated: {new Date(scheduleData.lastGeneratedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Comparison toggles */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs font-medium text-muted-foreground self-center mr-1">Compare with:</span>
        {(Object.keys(COMPARISON_LABELS) as ComparisonKey[]).map((key) => (
          <button
            key={key}
            onClick={() => toggleComparison(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              selectedComparisons.includes(key)
                ? "border-[#E8913A]/40 bg-[#E8913A]/10 text-[#E8913A]"
                : "border-border/60 bg-card text-muted-foreground hover:border-border"
            }`}
          >
            {COMPARISON_LABELS[key]}
          </button>
        ))}
      </div>

      {!current ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No data available for {selectedYear}.</p>
          <p className="text-xs mt-1">Try selecting a different year or sync data from Planning Center.</p>
        </div>
      ) : (
        <>
          {/* Period label */}
          <div className="flex items-center gap-2">
            <div
              className="px-3 py-1.5 rounded-md text-xs font-semibold"
              style={{ background: "rgba(232,145,58,0.12)", color: "#E8913A" }}
            >
              {current.label}
            </div>
            <span className="text-xs text-muted-foreground">
              Weekly averages derived from monthly data
            </span>
          </div>

          {/* All Campuses summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {METRIC_CONFIG.map((metric) => {
              const val = current.totals[metric.key];
              return (
                <div
                  key={metric.key}
                  className="bg-card rounded-lg border border-border/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <metric.icon className="w-3.5 h-3.5" style={{ color: metric.color }} />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {metric.label}
                    </span>
                  </div>
                  <p className="text-xl font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {formatNumber(val, metric.prefix)}
                  </p>

                  {/* Comparison indicators */}
                  <div className="mt-2 space-y-0.5">
                    {selectedComparisons.map((compKey) => {
                      const compPeriod =
                        compKey === "samePeriodLastYear"
                          ? (comparisons as any)?.currentYTD
                          : null;
                      const compData = (comparisons as any)?.[compKey];
                      if (!compData) return null;

                      // For same period, compare current YTD vs last year YTD
                      const currentVal =
                        compKey === "samePeriodLastYear" && compPeriod
                          ? compPeriod.totals[metric.key]
                          : val;
                      const prevVal = compData.totals[metric.key];

                      return (
                        <div key={compKey} className="flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground truncate max-w-[80px]">
                            {compKey === "sameWeekLastYear"
                              ? "vs LY"
                              : compKey === "previousWeek"
                                ? "vs prev"
                                : "vs LY YTD"}
                          </span>
                          <ChangeIndicator current={currentVal} previous={prevVal} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Campus breakdown table */}
          <div className="bg-card rounded-lg border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40">
              <h3 className="text-sm font-semibold">Campus Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Campus
                    </th>
                    {METRIC_CONFIG.map((m) => (
                      <th
                        key={m.key}
                        className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.campuses.map((campus) => (
                    <tr key={campus.campus} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-sm">{campus.campus}</td>
                      {METRIC_CONFIG.map((m) => (
                        <td key={m.key} className="text-right px-4 py-3 tabular-nums" style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
                          {formatNumber(campus[m.key], m.prefix)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-muted/20 font-semibold">
                    <td className="px-5 py-3 text-sm">All Campuses</td>
                    {METRIC_CONFIG.map((m) => (
                      <td key={m.key} className="text-right px-4 py-3 tabular-nums" style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
                        {formatNumber(current.totals[m.key], m.prefix)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table></div>
            </div>
          </div>

          {/* Comparison detail tables */}
          {selectedComparisons.map((compKey) => {
            const compData = (comparisons as any)?.[compKey];
            if (!compData) return null;

            const isYTD = compKey === "samePeriodLastYear";
            const currentForComp = isYTD ? (comparisons as any)?.currentYTD : current;
            if (!currentForComp) return null;

            return (
              <div
                key={compKey}
                className="bg-card rounded-lg border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{COMPARISON_LABELS[compKey]}</h3>
                  <span className="text-[10px] text-muted-foreground">{compData.label}</span>
                </div>
                <div className="overflow-x-auto">
                  <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Metric
                        </th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {isYTD ? `YTD ${currentForComp.year}` : currentForComp.label}
                        </th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {compData.label}
                        </th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Change
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_CONFIG.map((m) => {
                        const curr = currentForComp.totals[m.key];
                        const prev = compData.totals[m.key];
                        return (
                          <tr key={m.key} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-3 font-medium text-sm flex items-center gap-2">
                              <m.icon className="w-3.5 h-3.5" style={{ color: m.color }} />
                              {m.label}
                            </td>
                            <td className="text-right px-4 py-3 tabular-nums" style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
                              {formatNumber(curr, m.prefix)}
                            </td>
                            <td className="text-right px-4 py-3 tabular-nums text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
                              {formatNumber(prev, m.prefix)}
                            </td>
                            <td className="text-right px-4 py-3">
                              <ChangeIndicator current={curr} previous={prev} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
