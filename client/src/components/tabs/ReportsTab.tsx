/*
 * Lumen Metrix — Reports Tab
 * Custom report builder with scheduling, saved reports, and PDF export
 */
import { useMemo, useState, useRef, useCallback } from "react";
import { useData } from "@/contexts/DataContext";
import {
  formatCurrency, formatNumber, getYoYChange, CAMPUS_COLORS, CHART_COLORS, MONTH_NAMES,
} from "@/lib/data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import {
  Plus, FileText, Clock, Trash2, Edit3, Download, Eye, Calendar, Send, X,
  ChevronRight, CheckCircle, AlertCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportSection {
  id: string;
  type: "attendance" | "giving" | "nextsteps" | "health" | "comparison";
  label: string;
  enabled: boolean;
}

interface ReportConfig {
  id: string;
  name: string;
  campus: string;
  yearStart: number;
  yearEnd: number;
  sections: ReportSection[];
  createdAt: string;
  schedule: ScheduleConfig | null;
}

interface ScheduleConfig {
  frequency: "weekly" | "monthly" | "quarterly";
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-28 for monthly
  email: string;
  enabled: boolean;
  lastSent?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_SECTIONS: ReportSection[] = [
  { id: "att_overview", type: "attendance", label: "Attendance Overview", enabled: true },
  { id: "att_trend", type: "attendance", label: "Attendance Trend", enabled: true },
  { id: "giving_overview", type: "giving", label: "Giving Summary", enabled: true },
  { id: "giving_gpc", type: "giving", label: "Giving Per Capita", enabled: true },
  { id: "ns_funnel", type: "nextsteps", label: "Assimilation Funnel", enabled: true },
  { id: "ns_trend", type: "nextsteps", label: "Next Steps Trend", enabled: false },
  { id: "health_scores", type: "health", label: "Health Scorecard", enabled: true },
  { id: "health_volunteer", type: "health", label: "Volunteer Ratio", enabled: false },
];

const SECTION_COLORS: Record<string, string> = {
  attendance: "#E8913A",
  giving: "#4A7C59",
  nextsteps: "#4A7FB5",
  health: "#8B6DAF",
  comparison: "#C2703E",
};

const FREQ_LABELS: Record<string, string> = {
  weekly: "Every Week",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── LocalStorage helpers ────────────────────────────────────────────────────

function loadSavedReports(): ReportConfig[] {
  try {
    const raw = localStorage.getItem("lumen_reports");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReports(reports: ReportConfig[]) {
  localStorage.setItem("lumen_reports", JSON.stringify(reports));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReportsTab() {
  const { data, filters } = useData();
  const [savedReports, setSavedReports] = useState<ReportConfig[]>(loadSavedReports);
  const [editingReport, setEditingReport] = useState<ReportConfig | null>(null);
  const [previewReport, setPreviewReport] = useState<ReportConfig | null>(null);
  const [showScheduleFor, setShowScheduleFor] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const availableYears = useMemo(() => data?.meta.years ?? [], [data]);

  // ─── Create new report ─────────────────────────────────────────────────────

  const createNewReport = () => {
    const newReport: ReportConfig = {
      id: `report_${Date.now()}`,
      name: `Report — ${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
      campus: filters.campus,
      yearStart: filters.yearStart,
      yearEnd: filters.yearEnd,
      sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
      createdAt: new Date().toISOString(),
      schedule: null,
    };
    setEditingReport(newReport);
  };

  // ─── Save report ──────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!editingReport) return;
    const existing = savedReports.findIndex((r) => r.id === editingReport.id);
    let updated: ReportConfig[];
    if (existing >= 0) {
      updated = [...savedReports];
      updated[existing] = editingReport;
    } else {
      updated = [...savedReports, editingReport];
    }
    setSavedReports(updated);
    saveReports(updated);
    setEditingReport(null);
  };

  // ─── Delete report ─────────────────────────────────────────────────────────

  const handleDelete = (id: string) => {
    const updated = savedReports.filter((r) => r.id !== id);
    setSavedReports(updated);
    saveReports(updated);
  };

  // ─── Schedule management ───────────────────────────────────────────────────

  const handleScheduleSave = (reportId: string, schedule: ScheduleConfig) => {
    const updated = savedReports.map((r) =>
      r.id === reportId ? { ...r, schedule } : r
    );
    setSavedReports(updated);
    saveReports(updated);
    setShowScheduleFor(null);
  };

  // ─── Print / Export ────────────────────────────────────────────────────────

  const handleExport = (report: ReportConfig) => {
    setPreviewReport(report);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  if (!data) return null;

  // ─── Report Editor ─────────────────────────────────────────────────────────

  if (editingReport) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="section-title">
              {savedReports.some((r) => r.id === editingReport.id) ? "Edit Report" : "New Report"}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Configure which metrics to include</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingReport(null)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors"
              style={{ backgroundColor: "#E8913A" }}
            >
              Save Report
            </button>
          </div>
        </div>

        {/* Report name */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <label className="micro-label text-muted-foreground block mb-1.5">Report Name</label>
          <input
            type="text"
            value={editingReport.name}
            onChange={(e) => setEditingReport({ ...editingReport, name: e.target.value })}
            className="w-full h-9 px-3 text-sm rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
            placeholder="e.g., Q1 2025 Executive Summary"
          />
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h4 className="text-xs font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>Data Scope</h4>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="micro-label text-muted-foreground block mb-1.5">Campus</label>
              <select
                value={editingReport.campus}
                onChange={(e) => setEditingReport({ ...editingReport, campus: e.target.value })}
                className="h-8 px-3 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                <option>All Campuses</option>
                <option>Canton</option>
                <option>Jasper</option>
                <option>Online</option>
              </select>
            </div>
            <div>
              <label className="micro-label text-muted-foreground block mb-1.5">From</label>
              <select
                value={editingReport.yearStart}
                onChange={(e) => setEditingReport({ ...editingReport, yearStart: Number(e.target.value) })}
                className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="micro-label text-muted-foreground block mb-1.5">To</label>
              <select
                value={editingReport.yearEnd}
                onChange={(e) => setEditingReport({ ...editingReport, yearEnd: Number(e.target.value) })}
                className="h-8 px-2 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
              >
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section toggles */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h4 className="text-xs font-semibold mb-3" style={{ fontFamily: "'DM Sans'" }}>Report Sections</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {editingReport.sections.map((section) => (
              <label
                key={section.id}
                className={`flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer ${
                  section.enabled
                    ? "border-[#E8913A]/30 bg-[#E8913A]/5"
                    : "border-border/40 hover:border-border/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={section.enabled}
                  onChange={(e) => {
                    const updated = editingReport.sections.map((s) =>
                      s.id === section.id ? { ...s, enabled: e.target.checked } : s
                    );
                    setEditingReport({ ...editingReport, sections: updated });
                  }}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    section.enabled ? "border-[#E8913A] bg-[#E8913A]" : "border-border"
                  }`}
                >
                  {section.enabled && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium">{section.label}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{section.type}</p>
                </div>
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: SECTION_COLORS[section.type] }}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Preview button */}
        <div className="flex justify-end">
          <button
            onClick={() => setPreviewReport(editingReport)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-[#E8913A]/40 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview Report
          </button>
        </div>
      </div>
    );
  }

  // ─── Report Preview ────────────────────────────────────────────────────────

  if (previewReport) {
    return <ReportPreview report={previewReport} onClose={() => setPreviewReport(null)} />;
  }

  // ─── Schedule Editor ───────────────────────────────────────────────────────

  if (showScheduleFor) {
    const report = savedReports.find((r) => r.id === showScheduleFor);
    if (!report) return null;
    return (
      <ScheduleEditor
        report={report}
        onSave={(schedule) => handleScheduleSave(report.id, schedule)}
        onCancel={() => setShowScheduleFor(null)}
      />
    );
  }

  // ─── Main: Saved Reports List ──────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">
            {savedReports.length} saved report{savedReports.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={createNewReport}
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md text-white transition-colors"
          style={{ backgroundColor: "#E8913A" }}
        >
          <Plus className="w-3.5 h-3.5" />
          New Report
        </button>
      </div>

      {/* Empty state */}
      {savedReports.length === 0 && (
        <div className="bg-card rounded-lg border border-border/60 p-12 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm font-medium mb-1">No reports yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create a custom report to track the metrics that matter most to your leadership team.
          </p>
          <button
            onClick={createNewReport}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md text-white transition-colors"
            style={{ backgroundColor: "#E8913A" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Create Your First Report
          </button>
        </div>
      )}

      {/* Report cards */}
      {savedReports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {savedReports.map((report) => {
            const enabledCount = report.sections.filter((s) => s.enabled).length;
            const sectionTypes = Array.from(new Set(report.sections.filter((s) => s.enabled).map((s) => s.type)));
            return (
              <div key={report.id} className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#E8913A]/20 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans'" }}>{report.name}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {report.campus} &middot; {report.yearStart}–{report.yearEnd} &middot; {enabledCount} sections
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {sectionTypes.map((type) => (
                      <div
                        key={type}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: SECTION_COLORS[type] }}
                      />
                    ))}
                  </div>
                </div>

                {/* Schedule badge */}
                {report.schedule?.enabled && (
                  <div className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded bg-[#4A7C59]/8 w-fit">
                    <Clock className="w-3 h-3 text-[#4A7C59]" />
                    <span className="text-[10px] font-medium text-[#4A7C59]">
                      {FREQ_LABELS[report.schedule.frequency]} &middot; {report.schedule.email}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                  <button
                    onClick={() => setPreviewReport(report)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Eye className="w-3 h-3" /> View
                  </button>
                  <button
                    onClick={() => setEditingReport({ ...report, sections: report.sections.map((s) => ({ ...s })) })}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => setShowScheduleFor(report.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Clock className="w-3 h-3" /> Schedule
                  </button>
                  <button
                    onClick={() => handleExport(report)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => handleDelete(report.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded text-[#C45B4A]/60 hover:text-[#C45B4A] hover:bg-[#C45B4A]/5 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Templates */}
      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="section-title mb-3">Report Templates</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              name: "Executive Summary",
              desc: "High-level KPIs across all metrics",
              sections: ["att_overview", "giving_overview", "ns_funnel", "health_scores"],
            },
            {
              name: "Financial Report",
              desc: "Detailed giving analysis and trends",
              sections: ["giving_overview", "giving_gpc"],
            },
            {
              name: "Growth Report",
              desc: "Attendance trends and next steps",
              sections: ["att_overview", "att_trend", "ns_funnel", "ns_trend"],
            },
          ].map((template) => (
            <button
              key={template.name}
              onClick={() => {
                const newReport: ReportConfig = {
                  id: `report_${Date.now()}`,
                  name: template.name,
                  campus: filters.campus,
                  yearStart: filters.yearStart,
                  yearEnd: filters.yearEnd,
                  sections: DEFAULT_SECTIONS.map((s) => ({
                    ...s,
                    enabled: template.sections.includes(s.id),
                  })),
                  createdAt: new Date().toISOString(),
                  schedule: null,
                };
                setEditingReport(newReport);
              }}
              className="text-left p-4 rounded-lg border border-border/40 hover:border-[#E8913A]/30 hover:bg-[#E8913A]/3 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold" style={{ fontFamily: "'DM Sans'" }}>{template.name}</p>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-[#E8913A] transition-colors" />
              </div>
              <p className="text-[10px] text-muted-foreground">{template.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Editor Sub-component ───────────────────────────────────────────

function ScheduleEditor({
  report,
  onSave,
  onCancel,
}: {
  report: ReportConfig;
  onSave: (schedule: ScheduleConfig) => void;
  onCancel: () => void;
}) {
  const [schedule, setSchedule] = useState<ScheduleConfig>(
    report.schedule ?? {
      frequency: "weekly",
      dayOfWeek: 1,
      dayOfMonth: 1,
      email: "",
      enabled: true,
    }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="section-title">Schedule: {report.name}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Set up automatic delivery</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button onClick={() => onSave(schedule)} className="px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors" style={{ backgroundColor: "#E8913A" }}>
            Save Schedule
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="space-y-4">
          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`w-10 h-5 rounded-full relative transition-colors ${schedule.enabled ? "bg-[#E8913A]" : "bg-border"}`}
              onClick={() => setSchedule({ ...schedule, enabled: !schedule.enabled })}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${schedule.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-xs font-medium">Enable scheduled delivery</span>
          </label>

          {schedule.enabled && (
            <>
              {/* Frequency */}
              <div>
                <label className="micro-label text-muted-foreground block mb-1.5">Frequency</label>
                <div className="flex rounded-md overflow-hidden border border-border/60 w-fit">
                  {(["weekly", "monthly", "quarterly"] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => setSchedule({ ...schedule, frequency: freq })}
                      className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        schedule.frequency === freq ? "text-white" : "text-muted-foreground hover:bg-muted/40"
                      }`}
                      style={schedule.frequency === freq ? { backgroundColor: "#E8913A" } : {}}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selection */}
              {schedule.frequency === "weekly" && (
                <div>
                  <label className="micro-label text-muted-foreground block mb-1.5">Day of Week</label>
                  <select
                    value={schedule.dayOfWeek ?? 1}
                    onChange={(e) => setSchedule({ ...schedule, dayOfWeek: Number(e.target.value) })}
                    className="h-8 px-3 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
                  >
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}

              {schedule.frequency === "monthly" && (
                <div>
                  <label className="micro-label text-muted-foreground block mb-1.5">Day of Month</label>
                  <select
                    value={schedule.dayOfMonth ?? 1}
                    onChange={(e) => setSchedule({ ...schedule, dayOfMonth: Number(e.target.value) })}
                    className="h-8 px-3 text-xs rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
                  >
                    {Array.from({ length: 28 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="micro-label text-muted-foreground block mb-1.5">Delivery Email</label>
                <input
                  type="email"
                  value={schedule.email}
                  onChange={(e) => setSchedule({ ...schedule, email: e.target.value })}
                  className="w-full max-w-sm h-9 px-3 text-sm rounded-md border border-border/60 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-[#E8913A]/40"
                  placeholder="pastor@revolutionchurch.com"
                />
              </div>

              {/* Summary */}
              <div className="p-3 rounded-md bg-muted/30 border border-border/30">
                <div className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-[#E8913A]" />
                  <p className="text-xs">
                    This report will be delivered <strong>{FREQ_LABELS[schedule.frequency].toLowerCase()}</strong>
                    {schedule.frequency === "weekly" && schedule.dayOfWeek !== undefined && (
                      <> on <strong>{DAY_NAMES[schedule.dayOfWeek]}s</strong></>
                    )}
                    {schedule.frequency === "monthly" && schedule.dayOfMonth !== undefined && (
                      <> on the <strong>{schedule.dayOfMonth}{getOrdinal(schedule.dayOfMonth)}</strong></>
                    )}
                    {schedule.email && <> to <strong>{schedule.email}</strong></>}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ─── Report Preview Sub-component ────────────────────────────────────────────

function ReportPreview({ report, onClose }: { report: ReportConfig; onClose: () => void }) {
  const { data } = useData();
  if (!data) return null;

  const filteredYears = data.meta.years.filter(
    (y) => y >= report.yearStart && y <= report.yearEnd
  );
  const latestYear = filteredYears[filteredYears.length - 1] ?? 2026;
  const campus = report.campus;
  const enabledSections = report.sections.filter((s) => s.enabled);

  const TT = { fontSize: 12, borderRadius: 8, border: "1px solid #E8E5DE", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontFamily: "'Inter'" };

  // Compute metrics
  const getAtt = (y: number) => {
    const t = data.attendance.total_annual;
    const match = campus === "All Campuses" ? t.find((r) => r.year === y && r.campus === "All Campuses") : t.find((r) => r.year === y && r.campus === campus);
    return match?.avg_weekly ?? 0;
  };

  const getGiving = (y: number) => {
    const t = data.giving.tithes_annual;
    const match = campus === "All Campuses" ? t.find((r) => r.year === y && r.campus === "All Campuses") : t.find((r) => r.year === y && r.campus === campus);
    return match?.total ?? 0;
  };

  const getGpc = (y: number) => {
    const g = data.computed.giving_per_capita;
    const match = campus === "All Campuses" ? g.find((r) => r.year === y && r.campus === "All Campuses") : g.find((r) => r.year === y && r.campus === campus);
    return match?.giving_per_capita ?? 0;
  };

  const getNS = (y: number, metric: string) => {
    const ns = data.next_steps.annual;
    if (campus === "All Campuses") return ns.filter((n) => n.year === y && n.metric === metric).reduce((s, n) => s + n.total, 0);
    return ns.find((n) => n.year === y && n.campus === campus && n.metric === metric)?.total ?? 0;
  };

  // Trend data
  const trendData = filteredYears.map((y) => ({
    year: y,
    attendance: getAtt(y),
    giving: getGiving(y),
    gpc: Math.round(getGpc(y)),
    ftg: getNS(y, "FTG"),
    salvations: getNS(y, "Salvation"),
    baptisms: getNS(y, "Baptism"),
  }));

  return (
    <div className="space-y-5 print:space-y-4" id="report-preview">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h3 className="section-title">{report.name}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {campus} &middot; {report.yearStart}–{report.yearEnd} &middot; Generated {new Date().toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5 inline mr-1" /> Close
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors"
            style={{ backgroundColor: "#E8913A" }}
          >
            <Download className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold" style={{ fontFamily: "'DM Sans'" }}>{report.name}</h1>
        <p className="text-sm text-muted-foreground">{campus} &middot; {report.yearStart}–{report.yearEnd} &middot; {new Date().toLocaleDateString()}</p>
        <p className="text-[10px] text-muted-foreground mt-1">Powered by Lumen Metrix</p>
      </div>

      {/* Attendance Overview */}
      {enabledSections.some((s) => s.id === "att_overview") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3">Attendance Overview</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="micro-label text-muted-foreground mb-1">Avg Weekly ({latestYear})</p>
              <p className="stat-value text-2xl">{formatNumber(getAtt(latestYear))}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {getYoYChange(getAtt(latestYear), getAtt(latestYear - 1)).label} vs prior year
              </p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="micro-label text-muted-foreground mb-1">Peak Year</p>
              <p className="stat-value text-2xl">
                {formatNumber(Math.max(...trendData.map((t) => t.attendance)))}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {trendData.reduce((best, t) => t.attendance > best.attendance ? t : best, trendData[0])?.year}
              </p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="micro-label text-muted-foreground mb-1">Growth ({report.yearStart}–{latestYear})</p>
              <p className="stat-value text-2xl">
                {getYoYChange(getAtt(latestYear), getAtt(report.yearStart)).label}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Trend */}
      {enabledSections.some((s) => s.id === "att_trend") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Attendance Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} />
              <Line type="monotone" dataKey="attendance" stroke="#E8913A" strokeWidth={2} dot={{ r: 3 }} name="Avg Weekly" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Giving Summary */}
      {enabledSections.some((s) => s.id === "giving_overview") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3">Giving Summary</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="micro-label text-muted-foreground mb-1">Annual Tithes ({latestYear})</p>
              <p className="stat-value text-2xl">{formatCurrency(getGiving(latestYear))}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {getYoYChange(getGiving(latestYear), getGiving(latestYear - 1)).label} vs prior year
              </p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="micro-label text-muted-foreground mb-1">Weekly Average</p>
              <p className="stat-value text-2xl">{formatCurrency(getGiving(latestYear) / 52)}</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="micro-label text-muted-foreground mb-1">Total ({report.yearStart}–{latestYear})</p>
              <p className="stat-value text-2xl">{formatCurrency(trendData.reduce((s, t) => s + t.giving, 0))}</p>
            </div>
          </div>
        </div>
      )}

      {/* GPC */}
      {enabledSections.some((s) => s.id === "giving_gpc") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Giving Per Capita Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={TT} formatter={(v: number) => [`$${v.toLocaleString()}`, "Per Capita"]} />
              <Bar dataKey="gpc" fill="#4A7C59" radius={[3, 3, 0, 0]} maxBarSize={28} name="Per Capita" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Assimilation Funnel */}
      {enabledSections.some((s) => s.id === "ns_funnel") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Assimilation Funnel — {latestYear}</h3>
          {(() => {
            const funnel = [
              { label: "First Time Guests", value: getNS(latestYear, "FTG"), color: "#4A7C59" },
              { label: "Salvations", value: getNS(latestYear, "Salvation"), color: "#E8913A" },
              { label: "Baptisms", value: getNS(latestYear, "Baptism"), color: "#4A7FB5" },
            ];
            const max = Math.max(...funnel.map((f) => f.value), 1);
            return (
              <div className="space-y-3">
                {funnel.map((step, i) => {
                  const convRate = i > 0 && funnel[i - 1].value > 0 ? ((step.value / funnel[i - 1].value) * 100).toFixed(1) : null;
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{step.label}</span>
                        <div className="flex items-center gap-3">
                          {convRate && <span className="text-muted-foreground">{convRate}% conversion</span>}
                          <span className="stat-value">{formatNumber(step.value)}</span>
                        </div>
                      </div>
                      <div className="h-6 bg-muted/30 rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${Math.max((step.value / max) * 100, 3)}%`, backgroundColor: step.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Next Steps Trend */}
      {enabledSections.some((s) => s.id === "ns_trend") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Next Steps Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "'Inter'" }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="ftg" name="FTG" stroke="#4A7C59" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="salvations" name="Salvations" stroke="#E8913A" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="baptisms" name="Baptisms" stroke="#4A7FB5" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Health Scorecard */}
      {enabledSections.some((s) => s.id === "health_scores") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-3">Health Scorecard — {latestYear}</h3>
          {(() => {
            const currAtt = getAtt(latestYear);
            const prevAtt = getAtt(latestYear - 1);
            const attGrowth = prevAtt > 0 ? ((currAtt - prevAtt) / prevAtt) * 100 : 0;
            const gpcVal = getGpc(latestYear);
            const ftg = getNS(latestYear, "FTG");
            const ftgPct = currAtt > 0 ? ((ftg / 52) / currAtt) * 100 : 0;

            const scores = [
              { metric: "Attendance Growth", value: `${attGrowth >= 0 ? "+" : ""}${attGrowth.toFixed(1)}%`, status: attGrowth > 5 ? "Excellent" : attGrowth > 0 ? "Good" : "Watch" },
              { metric: "Giving Per Capita", value: formatCurrency(gpcVal), status: gpcVal > 3000 ? "Excellent" : gpcVal > 2000 ? "Good" : "Watch" },
              { metric: "FTG Rate", value: `${ftgPct.toFixed(1)}%`, status: ftgPct > 5 ? "Excellent" : ftgPct > 3 ? "Good" : "Watch" },
            ];

            return (
              <div className="grid grid-cols-3 gap-4">
                {scores.map((s) => (
                  <div key={s.metric} className="text-center p-3 bg-muted/30 rounded-lg">
                    <p className="micro-label text-muted-foreground mb-1">{s.metric}</p>
                    <p className="stat-value text-xl">{s.value}</p>
                    <p className={`text-[10px] font-semibold mt-1 ${s.status === "Excellent" ? "text-[#4A7C59]" : s.status === "Good" ? "text-[#4A7FB5]" : "text-[#D4A843]"}`}>
                      {s.status}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Volunteer Ratio */}
      {enabledSections.some((s) => s.id === "health_volunteer") && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="section-title mb-4">Volunteer Ratio Trend</h3>
          {(() => {
            const vr = data.computed.volunteer_ratio;
            const vrData = filteredYears.map((y) => {
              const match = campus === "All Campuses"
                ? vr.filter((v) => v.year === y)
                : vr.filter((v) => v.year === y && v.campus === campus);
              const totalVol = match.reduce((s, v) => s + v.avg_volunteers, 0);
              const totalAtt = match.reduce((s, v) => s + v.avg_attendance, 0);
              return { year: y, ratio: totalAtt > 0 ? Math.round((totalVol / totalAtt) * 1000) / 10 : 0 };
            });
            return (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={vrData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E5DE" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "'Inter'" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fontFamily: "'DM Mono'" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => [`${v}%`, "Ratio"]} />
                  <Line type="monotone" dataKey="ratio" stroke="#8B6DAF" strokeWidth={2} dot={{ r: 3 }} name="Volunteer %" />
                </LineChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      )}
    </div>
  );
}
