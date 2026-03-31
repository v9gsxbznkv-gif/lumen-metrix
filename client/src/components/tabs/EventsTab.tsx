/*
 * Lumen Metrix — Events Page
 * Key church events with attendance/giving performance, YoY comparisons
 *
 * Data priority (per event+year):
 * 1. Manual override (user-entered, stored in event_overrides DB table)
 * 2. PCO weekly data (from weekly sync — exact per-Sunday headcounts)
 * 3. Monthly estimate (spreadsheet era — avgWeekly / monthly ÷ Sundays)
 *
 * 2026+ events use PCO weekly as the primary source.
 * Pre-2026 events default to monthly estimates unless a manual override exists.
 */
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  formatNumber, formatCurrency, MONTH_NAMES,
  type AttendanceWeekly, type GivingWeekly, type EventOverride,
} from "@/lib/data";
import { CHURCH_EVENTS, type ChurchEvent } from "@/lib/churchCalendar";
import {
  CalendarDays, TrendingUp, TrendingDown, Database, BarChart3,
  Pencil, Check, Trash2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// Today's date for filtering out future events
const TODAY = new Date();

// Spreadsheet subgroup names that represent main service attendance
const SPREADSHEET_ATTENDANCE_SUBGROUPS = new Set(["Adults", "Kids", "Students", "Young Adults"]);

// Canonical event name keys used in the override table
// These must match what we pass to upsertEventOverride
const EVENT_OVERRIDE_KEYS: Record<string, string> = {
  easter: "Easter Sunday",
  christmas_eve: "Christmas Season",
  mothers_day: "Mother's Day",
  back_to_school: "Back to School",
};

/**
 * Count the number of Sundays in a given year/month.
 */
function countSundaysInMonth(year: number, month: number): number {
  const date = new Date(year, month - 1, 1);
  let count = 0;
  while (date.getMonth() === month - 1) {
    if (date.getDay() === 0) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

/**
 * Get the Sunday of a given date (same day if already Sunday, else previous Sunday).
 */
function getSundayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

/**
 * Format a date as 'YYYY-MM-DD' for matching against weekStartDate.
 */
function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Override Edit Modal ─────────────────────────────────────────────────────

interface OverrideModalProps {
  open: boolean;
  onClose: () => void;
  eventName: string;   // canonical name, e.g. "Easter Sunday"
  year: number;
  existing?: EventOverride;
  onSaved: () => void;
}

function OverrideModal({ open, onClose, eventName, year, existing, onSaved }: OverrideModalProps) {
  const [attendance, setAttendance] = useState(existing?.attendance?.toString() ?? "");
  const [giving, setGiving] = useState(existing?.giving?.toString() ?? "");
  const [ftg, setFtg] = useState(existing?.ftg?.toString() ?? "");
  const [salvations, setSalvations] = useState(existing?.salvations?.toString() ?? "");
  const [baptisms, setBaptisms] = useState(existing?.baptisms?.toString() ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const upsert = trpc.pco.upsertEventOverride.useMutation({
    onSuccess: () => {
      toast.success(`Override saved — ${eventName} ${year} updated.`);
      onSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const deleteOverride = trpc.pco.deleteEventOverride.useMutation({
    onSuccess: () => {
      toast.success(`Override removed — ${eventName} ${year} reverted to calculated value.`);
      onSaved();
      onClose();
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  const handleSave = () => {
    upsert.mutate({
      eventName,
      year,
      attendance: attendance !== "" ? parseInt(attendance, 10) : null,
      giving: giving !== "" ? parseFloat(giving) : null,
      ftg: ftg !== "" ? parseInt(ftg, 10) : null,
      salvations: salvations !== "" ? parseInt(salvations, 10) : null,
      baptisms: baptisms !== "" ? parseInt(baptisms, 10) : null,
      notes: notes || null,
    });
  };

  const handleDelete = () => {
    deleteOverride.mutate({ eventName, year });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Edit Override — {eventName} {year}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Enter the actual numbers for this event. Leave a field blank to use the calculated value (PCO weekly or monthly estimate).
        </p>

        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="space-y-1">
            <Label className="text-xs">Attendance</Label>
            <Input
              type="number" min={0} placeholder="e.g. 5982"
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Giving ($)</Label>
            <Input
              type="number" min={0} placeholder="e.g. 48500"
              value={giving}
              onChange={(e) => setGiving(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">First-Time Guests</Label>
            <Input
              type="number" min={0} placeholder="e.g. 312"
              value={ftg}
              onChange={(e) => setFtg(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Salvations</Label>
            <Input
              type="number" min={0} placeholder="e.g. 47"
              value={salvations}
              onChange={(e) => setSalvations(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Baptisms</Label>
            <Input
              type="number" min={0} placeholder="e.g. 12"
              value={baptisms}
              onChange={(e) => setBaptisms(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1 mt-1">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea
            placeholder="e.g. Combined all-campus total from bulletin count"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs resize-none h-16"
          />
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 mt-2">
          {existing && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs h-7 px-2"
              onClick={handleDelete}
              disabled={deleteOverride.isPending}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove override
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={upsert.isPending}
            >
              <Check className="w-3 h-3 mr-1" />
              {upsert.isPending ? "Saving…" : "Save override"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main EventsTab ──────────────────────────────────────────────────────────

export default function EventsTab() {
  const { data, filters } = useData();
  // Modal state
  const [editModal, setEditModal] = useState<{
    open: boolean;
    eventId: string;
    eventName: string;
    year: number;
  } | null>(null);

  // Fetch overrides from DB (live — not cached in DataContext so edits are instant)
  const { data: overridesData, refetch: refetchOverrides } = trpc.pco.getEventOverrides.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const overrides: EventOverride[] = overridesData ?? (data?.event_overrides ?? []);

  if (!data) return null;

  const { campus, yearStart, yearEnd } = filters;
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);

  // Weekly data arrays (may be empty if not yet synced)
  const weeklyAtt: AttendanceWeekly[] = data.attendance_weekly || [];
  const weeklyGiv: GivingWeekly[] = data.giving_weekly || [];
  const hasWeeklyData = weeklyAtt.length > 0;

  /**
   * Look up a manual override for a specific event+year.
   */
  const getOverride = (eventName: string, year: number): EventOverride | undefined => {
    return overrides.find((o) => o.eventName === eventName && o.year === year);
  };

  /**
   * Try to get attendance for a specific Sunday from weekly data.
   */
  const getWeeklyAttendance = (sundayKey: string): number | null => {
    const rows = weeklyAtt.filter(
      (r) =>
        r.weekStartDate === sundayKey &&
        (campus === "All Campuses" || r.campus === campus)
    );
    if (rows.length === 0) return null;
    return rows.reduce((s, r) => s + r.headcount, 0);
  };

  /**
   * Try to get giving for a specific week from weekly data.
   */
  const getWeeklyGiving = (sundayKey: string): number | null => {
    const rows = weeklyGiv.filter(
      (r) =>
        r.weekStartDate === sundayKey &&
        (campus === "All Campuses" || r.campus === campus)
    );
    if (rows.length === 0) return null;
    return rows.reduce((s, r) => s + r.total, 0);
  };

  /**
   * Get per-event metrics for a specific event in a given year.
   * Priority: manual override > PCO weekly > monthly estimate.
   */
  const getEventMetrics = (event: ChurchEvent, year: number, isChristmas = false) => {
    const eventDate = event.getDate(year);
    if (!eventDate) return null;

    // Skip future events
    if (eventDate > TODAY) return null;

    const month = eventDate.getMonth() + 1;
    const sunday = getSundayOf(eventDate);
    const sundayKey = formatDateKey(sunday);

    // --- Priority 1: Manual override ---
    const overrideName = EVENT_OVERRIDE_KEYS[event.id] ?? event.id;
    const override = getOverride(overrideName, year);
    if (override) {
      // If override exists, use its values; fall back to calculated for any null fields
      const sundaysInMonth = countSundaysInMonth(year, month);
      const stepsDivisor = isChristmas ? 2 : sundaysInMonth;

      // For fields not overridden, compute from weekly/monthly as usual
      let computedFtg = 0;
      let computedSalvations = 0;
      if (override.ftg === null || override.salvations === null) {
        const ftgMonthly = data.next_steps_monthly
          .filter((r) => r.year === year && r.month === month && r.metric === "FTG" && (campus === "All Campuses" || r.campus === campus))
          .reduce((s, r) => s + r.count, 0);
        computedFtg = stepsDivisor > 0 ? Math.round(ftgMonthly / stepsDivisor) : 0;

        const salvMonthly = data.next_steps_monthly
          .filter((r) => r.year === year && r.month === month && r.metric === "Salvations" && (campus === "All Campuses" || r.campus === campus))
          .reduce((s, r) => s + r.count, 0);
        computedSalvations = stepsDivisor > 0 ? Math.round(salvMonthly / stepsDivisor) : 0;
      }

      // Compute attendance fallback if override.attendance is null
      let computedAtt = 0;
      if (override.attendance === null) {
        const attRows = data.attendance_monthly
          .filter((r) => r.year === year && r.month === month && (campus === "All Campuses" || r.campus === campus) && SPREADSHEET_ATTENDANCE_SUBGROUPS.has(r.subgroup))
          .reduce((s, r) => s + r.avg_weekly, 0);
        computedAtt = attRows;
      }

      return {
        attendance: override.attendance ?? computedAtt,
        giving: override.giving ?? 0,
        ftg: override.ftg ?? computedFtg,
        salvations: override.salvations ?? computedSalvations,
        month,
        source: "override" as const,
        notes: override.notes,
      };
    }

    // --- Priority 2: PCO weekly data ---
    if (hasWeeklyData) {
      let weeklyAttVal: number | null = null;
      let weeklyGivVal: number | null = null;

      if (isChristmas) {
        const eveEvent = CHURCH_EVENTS.find((e) => e.id === "christmas_eve");
        const sunEvent = CHURCH_EVENTS.find((e) => e.id === "christmas");
        const eveDate = eveEvent?.getDate(year);
        const sunDate = sunEvent?.getDate(year);

        if (eveDate && sunDate) {
          const eveKey = formatDateKey(getSundayOf(eveDate));
          const sunKey = formatDateKey(getSundayOf(sunDate));

          const eveAtt = getWeeklyAttendance(eveKey);
          const sunAtt = getWeeklyAttendance(sunKey);
          if (eveKey === sunKey) {
            weeklyAttVal = eveAtt;
            weeklyGivVal = getWeeklyGiving(eveKey);
          } else {
            if (eveAtt !== null || sunAtt !== null) {
              weeklyAttVal = (eveAtt || 0) + (sunAtt || 0);
            }
            const eveGiv = getWeeklyGiving(eveKey);
            const sunGiv = getWeeklyGiving(sunKey);
            if (eveGiv !== null || sunGiv !== null) {
              weeklyGivVal = (eveGiv || 0) + (sunGiv || 0);
            }
          }
        }
      } else {
        weeklyAttVal = getWeeklyAttendance(sundayKey);
        weeklyGivVal = getWeeklyGiving(sundayKey);
      }

      if (weeklyAttVal !== null) {
        const sundaysInMonth = countSundaysInMonth(year, month);
        const stepsDivisor = isChristmas ? 2 : sundaysInMonth;

        const ftgMonthly = data.next_steps_monthly
          .filter((r) => r.year === year && r.month === month && r.metric === "FTG" && (campus === "All Campuses" || r.campus === campus))
          .reduce((s, r) => s + r.count, 0);
        const ftg = stepsDivisor > 0 ? Math.round(ftgMonthly / stepsDivisor) : 0;

        const salvMonthly = data.next_steps_monthly
          .filter((r) => r.year === year && r.month === month && r.metric === "Salvations" && (campus === "All Campuses" || r.campus === campus))
          .reduce((s, r) => s + r.count, 0);
        const salvations = stepsDivisor > 0 ? Math.round(salvMonthly / stepsDivisor) : 0;

        return {
          attendance: weeklyAttVal,
          giving: weeklyGivVal ?? 0,
          ftg,
          salvations,
          month,
          source: "weekly" as const,
          notes: null,
        };
      }
    }

    // --- Priority 3: Monthly estimate ---
    const sundaysInMonth = countSundaysInMonth(year, month);
    const givingDivisor = isChristmas ? 2 : sundaysInMonth;
    const stepsDivisor = isChristmas ? 2 : sundaysInMonth;

    const att = data.attendance_monthly
      .filter(
        (r) =>
          r.year === year &&
          r.month === month &&
          (campus === "All Campuses" || r.campus === campus) &&
          SPREADSHEET_ATTENDANCE_SUBGROUPS.has(r.subgroup)
      )
      .reduce((s, r) => s + r.avg_weekly, 0);

    const givingMonthly = data.giving_monthly
      .filter((r) => r.year === year && r.month === month && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.total, 0);
    const giving = givingDivisor > 0 ? Math.round(givingMonthly / givingDivisor) : 0;

    const ftgMonthly = data.next_steps_monthly
      .filter((r) => r.year === year && r.month === month && r.metric === "FTG" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.count, 0);
    const ftg = stepsDivisor > 0 ? Math.round(ftgMonthly / stepsDivisor) : 0;

    const salvMonthly = data.next_steps_monthly
      .filter((r) => r.year === year && r.month === month && r.metric === "Salvations" && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.count, 0);
    const salvations = stepsDivisor > 0 ? Math.round(salvMonthly / stepsDivisor) : 0;

    return { attendance: att, giving, ftg, salvations, month, source: "monthly" as const, notes: null };
  };

  // Event list
  const EVENT_DISPLAY_LIST: Array<{ name: string; eventId: string; isChristmas?: boolean }> = [
    { name: "Easter Sunday", eventId: "easter" },
    { name: "Christmas Season", eventId: "christmas_eve", isChristmas: true },
    { name: "Mother's Day", eventId: "mothers_day" },
    { name: "Back to School", eventId: "back_to_school" },
  ];

  const eventData = EVENT_DISPLAY_LIST.map(({ name, eventId, isChristmas }) => {
    const event = CHURCH_EVENTS.find((e) => e.id === eventId);
    if (!event) return null;

    const yearMetrics = years
      .map((y) => {
        const metrics = getEventMetrics(event, y, isChristmas);
        if (!metrics) return null;
        return { year: y, ...metrics };
      })
      .filter(Boolean) as {
        year: number;
        attendance: number;
        giving: number;
        ftg: number;
        salvations: number;
        month: number;
        source: "override" | "weekly" | "monthly";
        notes: string | null;
      }[];

    if (yearMetrics.length === 0) return null;
    return { name, eventId, event, yearMetrics };
  }).filter(Boolean) as {
    name: string;
    eventId: string;
    event: ChurchEvent;
    yearMetrics: {
      year: number;
      attendance: number;
      giving: number;
      ftg: number;
      salvations: number;
      month: number;
      source: "override" | "weekly" | "monthly";
      notes: string | null;
    }[];
  }[];

  // Easter comparison chart data
  const easterEvent = CHURCH_EVENTS.find((e) => e.id === "easter");
  const easterChartData = easterEvent
    ? years
        .map((y) => {
          const m = getEventMetrics(easterEvent, y);
          if (!m || m.attendance === 0) return null;
          return { year: y, Attendance: m.attendance, Giving: Math.round(m.giving / 1000), FTG: m.ftg };
        })
        .filter(Boolean)
    : [];

  // Determine data source badges
  const hasAnyOverrideSource = eventData.some(({ yearMetrics }) => yearMetrics.some((m) => m.source === "override"));
  const hasAnyWeeklySource = eventData.some(({ yearMetrics }) => yearMetrics.some((m) => m.source === "weekly"));
  const hasAnyMonthlySource = eventData.some(({ yearMetrics }) => yearMetrics.some((m) => m.source === "monthly"));

  // Find existing override for modal
  const editingOverride = editModal
    ? getOverride(editModal.eventName, editModal.year)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Data source legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {hasAnyOverrideSource && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <Pencil className="w-3 h-3" /> Manual Override
          </span>
        )}
        {hasAnyWeeklySource && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Database className="w-3 h-3" /> PCO Weekly Data
          </span>
        )}
        {hasAnyMonthlySource && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <BarChart3 className="w-3 h-3" /> Monthly Estimate
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          Click the pencil icon on any row to enter exact numbers
        </span>
      </div>

      {/* Event Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {eventData.map(({ name, yearMetrics }) => {
          const latest = yearMetrics[yearMetrics.length - 1];
          const prior = yearMetrics.length > 1 ? yearMetrics[yearMetrics.length - 2] : null;
          if (!latest) return null;

          const attChange = prior && prior.attendance > 0 ? ((latest.attendance - prior.attendance) / prior.attendance * 100) : null;
          const givChange = prior && prior.giving > 0 ? ((latest.giving - prior.giving) / prior.giving * 100) : null;

          return (
            <div key={name} className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4" style={{ color: "#E8913A" }} />
                <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>{name}</h3>
                <span className="ml-auto text-[10px] text-muted-foreground">{MONTH_NAMES[latest.month - 1]} {latest.year}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Attendance</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(latest.attendance)}</p>
                  {attChange !== null && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {attChange >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                      <span className={`text-[10px] font-medium ${attChange >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {attChange >= 0 ? "+" : ""}{attChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Giving</p>
                  <p className="text-lg font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatCurrency(latest.giving)}</p>
                  {givChange !== null && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {givChange >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                      <span className={`text-[10px] font-medium ${givChange >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {givChange >= 0 ? "+" : ""}{givChange.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/30">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">FTG</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(latest.ftg)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Salvations</p>
                  <p className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(latest.salvations)}</p>
                </div>
              </div>

              {/* Source badge on card */}
              <div className="mt-3 pt-2 border-t border-border/20">
                {latest.source === "override" && (
                  <span className="text-[10px] text-violet-400 flex items-center gap-1">
                    <Pencil className="w-2.5 h-2.5" /> Manual override
                    {latest.notes && <span className="text-muted-foreground ml-1">— {latest.notes}</span>}
                  </span>
                )}
                {latest.source === "weekly" && (
                  <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" /> PCO weekly data
                  </span>
                )}
                {latest.source === "monthly" && (
                  <span className="text-[10px] text-amber-500 flex items-center gap-1">
                    <BarChart3 className="w-2.5 h-2.5" /> Monthly estimate
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Easter Multi-Year Chart */}
      {easterChartData.length > 0 && (
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Easter Sunday — Multi-Year Comparison</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={easterChartData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickFormatter={(v) => `$${v}K`} />
              <Tooltip
                contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  if (name === "Giving") return [`$${value}K`, name];
                  return [formatNumber(value), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="Attendance" fill="#E8913A" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left" dataKey="FTG" fill="#4A7FB5" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="Giving" fill="#4A7C59" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Event History Table */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Event Performance History</h3>
          <span className="text-[10px] text-muted-foreground/60">Click <Pencil className="w-2.5 h-2.5 inline" /> to enter exact numbers</span>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Data priority: <span className="text-violet-400">■ Override</span> &gt; <span className="text-emerald-500">■ PCO Weekly</span> &gt; <span className="text-amber-500">■ Estimate</span>.
          Use the edit button on any row to enter the real numbers for historical events.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2 text-muted-foreground font-medium">Event</th>
                <th className="text-left py-2 text-muted-foreground font-medium">Year</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Attendance</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Giving</th>
                <th className="text-right py-2 text-muted-foreground font-medium">FTG</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Salvations</th>
                <th className="text-center py-2 text-muted-foreground font-medium w-8">Src</th>
                <th className="text-center py-2 text-muted-foreground font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {eventData.flatMap(({ name, eventId, yearMetrics }) =>
                yearMetrics.slice(-6).map((m) => {
                  const overrideName = EVENT_OVERRIDE_KEYS[eventId] ?? name;
                  return (
                    <tr key={`${name}-${m.year}`} className="border-b border-border/20 group hover:bg-muted/20 transition-colors">
                      <td className="py-2 font-medium">{name}</td>
                      <td className="py-2 text-muted-foreground">{m.year}</td>
                      <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {formatNumber(m.attendance)}
                      </td>
                      <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>{formatCurrency(m.giving)}</td>
                      <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(m.ftg)}</td>
                      <td className="text-right py-2" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(m.salvations)}</td>
                      <td className="text-center py-2" title={
                        m.source === "override" ? "Manual override" :
                        m.source === "weekly" ? "PCO weekly data" : "Monthly estimate"
                      }>
                        {m.source === "override" ? (
                          <span className="text-violet-400">◆</span>
                        ) : m.source === "weekly" ? (
                          <span className="text-emerald-500">●</span>
                        ) : (
                          <span className="text-amber-500">○</span>
                        )}
                      </td>
                      <td className="text-center py-2">
                        <button
                          onClick={() => setEditModal({
                            open: true,
                            eventId,
                            eventName: overrideName,
                            year: m.year,
                          })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Edit override"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Override Edit Modal */}
      {editModal && (
        <OverrideModal
          open={editModal.open}
          onClose={() => setEditModal(null)}
          eventName={editModal.eventName}
          year={editModal.year}
          existing={editingOverride}
          onSaved={() => {
            refetchOverrides();
          }}
        />
      )}
    </div>
  );
}
