import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { CalendarView, CalendarEventRow, MONTH_NAMES } from "@/lib/calendarUtils";
import { AnnualView } from "@/components/calendar/AnnualView";
import { MonthlyView } from "@/components/calendar/MonthlyView";
import { WeeklyView } from "@/components/calendar/WeeklyView";
import { AllCampusesView } from "@/components/calendar/AllCampusesView";
import { EventDetailDrawer } from "@/components/calendar/EventDetailDrawer";
import { EventFormDialog } from "@/components/calendar/EventFormDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, LayoutGrid, Calendar, Columns3, Building2, Printer, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { addWeeks, subWeeks, startOfWeek } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

const YEAR_TABS = [2025, 2026, 2027];

export default function CalendarPage() {
  const now = new Date();
  const [view, setView] = useState<CalendarView>("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [weekStart, setWeekStart] = useState(startOfWeek(now, { weekStartsOn: 0 }));
  const [campusFilter, setCampusFilter] = useState<number | undefined>();
  const [ministryFilter, setMinistryFilter] = useState<number | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDefaultDate, setFormDefaultDate] = useState<Date | undefined>();

  // When switching year tabs, reset month/week to Jan 1 of that year (or today if current year)
  const handleYearTab = (y: number) => {
    setYear(y);
    if (y === now.getFullYear()) {
      setMonth(now.getMonth());
      setWeekStart(startOfWeek(now, { weekStartsOn: 0 }));
    } else {
      setMonth(0);
      setWeekStart(startOfWeek(new Date(y, 0, 1), { weekStartsOn: 0 }));
    }
  };

  const campusesQuery = trpc.calendar.getCampuses.useQuery();
  const ministriesQuery = trpc.calendar.getMinistries.useQuery();
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  const handleEventClick = (event: CalendarEventRow) => setSelectedEvent(event);
  const handleCellClick = (date: Date) => {
    setFormDefaultDate(date);
    setShowForm(true);
  };

  // Navigation
  const goBack = () => {
    if (view === "annual") setYear((y) => y - 1);
    else if (view === "monthly") {
      if (month === 0) { setMonth(11); setYear((y) => y - 1); }
      else setMonth((m) => m - 1);
    } else {
      setWeekStart((w) => subWeeks(w, 1));
    }
  };
  const goForward = () => {
    if (view === "annual") setYear((y) => y + 1);
    else if (view === "monthly") {
      if (month === 11) { setMonth(0); setYear((y) => y + 1); }
      else setMonth((m) => m + 1);
    } else {
      setWeekStart((w) => addWeeks(w, 1));
    }
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setWeekStart(startOfWeek(now, { weekStartsOn: 0 }));
  };

  const periodLabel = () => {
    if (view === "annual") return String(year);
    if (view === "monthly") return `${MONTH_NAMES[month]} ${year}`;
    const end = addWeeks(weekStart, 1);
    return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const icalQuery = trpc.calendar.exportIcal.useQuery(
    { year, campusId: undefined, ministryId: undefined },
    { enabled: false }
  );

  const handleIcalExport = async (opts: { campusId?: number; ministryId?: number }) => {
    try {
      toast.loading("Generating .ics file…", { id: "ical" });
      const result = await icalQuery.refetch();
      // We need a direct fetch since tRPC query doesn't support dynamic params on refetch
      const params = new URLSearchParams();
      params.set("year", String(year));
      if (opts.campusId) params.set("campusId", String(opts.campusId));
      if (opts.ministryId) params.set("ministryId", String(opts.ministryId));
      const res = await fetch(`/api/ical?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const text = await res.text();
      const blob = new Blob([text], { type: "text/calendar" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumenmetrix-${opts.campusId ? `campus-${opts.campusId}` : opts.ministryId ? `ministry-${opts.ministryId}` : "all"}-${year}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Calendar exported!", { id: "ical" });
    } catch {
      toast.error("Export failed — try again", { id: "ical" });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Year Tabs */}
      <div className="year-tabs flex items-center gap-0 px-4 pt-3 border-b border-border bg-card">
        {YEAR_TABS.map((y) => (
          <button
            key={y}
            onClick={() => handleYearTab(y)}
            className={`px-5 py-2 text-sm font-semibold border-b-2 transition-colors ${
              year === y
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="calendar-toolbar flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border bg-card flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={goBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs px-2 h-7" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={goForward}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <h2 className="text-sm font-semibold text-foreground min-w-[120px] sm:min-w-[160px]">{periodLabel()}</h2>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Campus filter */}
        <Select
          value={campusFilter?.toString() ?? "all"}
          onValueChange={(v) => setCampusFilter(v === "all" ? undefined : parseInt(v))}
        >
          <SelectTrigger className="h-7 text-xs bg-input border-border w-[100px] sm:w-[120px]">
            <SelectValue placeholder="All Campuses" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Campuses</SelectItem>
            {campusesQuery.data?.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Ministry filter */}
        <Select
          value={ministryFilter?.toString() ?? "all"}
          onValueChange={(v) => setMinistryFilter(v === "all" ? undefined : parseInt(v))}
        >
          <SelectTrigger className="h-7 text-xs bg-input border-border w-[120px] sm:w-[140px]">
            <SelectValue placeholder="All Ministries" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Ministries</SelectItem>
            {ministriesQuery.data?.map((m) => (
              <SelectItem key={m.id} value={m.id.toString()}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                  {m.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View switcher */}
        <div className="flex items-center bg-input rounded-md border border-border p-0.5">
          {([
            { v: "annual" as CalendarView, icon: Columns3, label: "Annual" },
            { v: "monthly" as CalendarView, icon: LayoutGrid, label: "Monthly" },
            { v: "weekly" as CalendarView, icon: Calendar, label: "Weekly" },
            { v: "campuses" as CalendarView, icon: Building2, label: "Campuses" },
          ] as const).map(({ v, icon: Icon, label }) => (
            <Button
              key={v}
              variant="ghost"
              size="sm"
              className={`h-6 px-2 text-xs gap-1 ${view === v ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
              onClick={() => setView(v)}
            >
              <Icon className="w-3 h-3" />
              {label}
            </Button>
          ))}
        </div>

        {/* Print */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground no-print"
          onClick={handlePrint}
          title="Print / Export PDF"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Print</span>
        </Button>

        {/* iCal Export */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground no-print"
              title="Export to Google Calendar / iCal"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs">Export as .ics</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs cursor-pointer"
              onClick={() => handleIcalExport({})}
            >
              All Campuses — {year}
            </DropdownMenuItem>
            {campusesQuery.data?.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className="text-xs cursor-pointer"
                onClick={() => handleIcalExport({ campusId: c.id })}
              >
                {c.name} Campus — {year}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {ministriesQuery.data?.map((m) => (
              <DropdownMenuItem
                key={m.id}
                className="text-xs cursor-pointer"
                onClick={() => handleIcalExport({ ministryId: m.id })}
              >
                <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: m.color }} />
                {m.name} — {year}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New Event */}
        <Button
          size="sm"
          className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1"
          onClick={() => { setFormDefaultDate(undefined); setShowForm(true); }}
        >
          <Plus className="w-3.5 h-3.5" /> New Event
        </Button>
      </div>

      {/* Ministry legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50 overflow-x-auto">
        {ministriesQuery.data?.map((m) => (
          <button
            key={m.id}
            className={`flex items-center gap-1.5 text-xs whitespace-nowrap transition-opacity ${ministryFilter && ministryFilter !== m.id ? "opacity-30" : "opacity-100"}`}
            onClick={() => setMinistryFilter(ministryFilter === m.id ? undefined : m.id)}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="text-muted-foreground">{m.name}</span>
          </button>
        ))}
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-auto bg-background">
        {view === "annual" && (
          <AnnualView
            year={year}
            campusId={campusFilter}
            onEventClick={handleEventClick}
            onCellClick={handleCellClick}
            onRefresh={refresh}
          />
        )}
        {view === "monthly" && (
          <MonthlyView
            year={year}
            month={month}
            campusId={campusFilter}
            ministryId={ministryFilter}
            onEventClick={handleEventClick}
            onCellClick={handleCellClick}
            onRefresh={refresh}
          />
        )}
        {view === "weekly" && (
          <WeeklyView
            weekStart={weekStart}
            campusId={campusFilter}
            ministryId={ministryFilter}
            onEventClick={handleEventClick}
            onCellClick={handleCellClick}
            onRefresh={refresh}
          />
        )}
        {view === "campuses" && (
          <AllCampusesView
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            onEventClick={handleEventClick}
            onCellClick={handleCellClick}
            ministryId={ministryFilter}
          />
        )}
      </div>

      {/* Event detail drawer */}
      <EventDetailDrawer
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onRefresh={refresh}
      />

      {/* Event form dialog */}
      <EventFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={refresh}
        defaultDate={formDefaultDate}
        defaultCampusId={campusFilter}
      />
    </div>
  );
}
