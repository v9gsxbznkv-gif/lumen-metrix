/*
 * Lumen Metrix — Settings Page
 * Church configuration, data source info, and dashboard preferences
 */
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { Building2, Database, Calendar, Info, ExternalLink } from "lucide-react";

export default function SettingsTab() {
  const { data } = useData();
  const [churchName] = useState("Revolution Church");
  const [location] = useState("Canton, GA");

  const years = data?.meta.years ?? [];
  const campuses = data?.meta.campuses.filter((c) => c !== "All Campuses") ?? [];

  const dataStats = {
    years: `${Math.min(...years)}–${Math.max(...years)}`,
    campuses: campuses.length,
    attendanceRecords: data?.attendance.length ?? 0,
    givingRecords: data?.giving.length ?? 0,
    nextStepsRecords: data?.next_steps.length ?? 0,
    servingRecords: data?.serving.length ?? 0,
    monthlyRecords: (data?.attendance_monthly.length ?? 0) + (data?.giving_monthly.length ?? 0) + (data?.next_steps_monthly.length ?? 0) + (data?.serving_monthly.length ?? 0),
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Church Profile */}
      <div className="bg-card rounded-lg border border-border/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Church Profile</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Church Name</label>
            <div className="bg-muted/30 rounded-md px-3 py-2 text-sm">{churchName}</div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Location</label>
            <div className="bg-muted/30 rounded-md px-3 py-2 text-sm">{location}</div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Campuses</label>
            <div className="flex gap-2">
              {campuses.map((c) => (
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

      {/* Data Source */}
      <div className="bg-card rounded-lg border border-border/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Data Source</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Source Type</span>
            <span className="text-xs font-medium">Google Sheets (12 workbooks)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Extraction Method</span>
            <span className="text-xs font-medium">Raw campus tab sheets (verified)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Attendance Records</span>
            <span className="text-xs font-medium" style={{ fontFamily: "'DM Mono', monospace" }}>{dataStats.attendanceRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Giving Records</span>
            <span className="text-xs font-medium" style={{ fontFamily: "'DM Mono', monospace" }}>{dataStats.givingRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Next Steps Records</span>
            <span className="text-xs font-medium" style={{ fontFamily: "'DM Mono', monospace" }}>{dataStats.nextStepsRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/20">
            <span className="text-xs text-muted-foreground">Serving Records</span>
            <span className="text-xs font-medium" style={{ fontFamily: "'DM Mono', monospace" }}>{dataStats.servingRecords.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">Monthly Detail Records</span>
            <span className="text-xs font-medium" style={{ fontFamily: "'DM Mono', monospace" }}>{dataStats.monthlyRecords.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Data Integrity Notes */}
      <div className="bg-card rounded-lg border border-border/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Data Integrity Notes</h3>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>All data extracted directly from raw campus tab sheets (not History/Summary sheets) for maximum accuracy.</p>
          <p>2013 and 2015 data is not available (missing spreadsheets).</p>
          <p>2020–2021 serving data may be incomplete due to COVID-19 volunteer tracking changes.</p>
          <p>2026 data is YTD (January–March) and uses partial-year-aware comparisons.</p>
          <p>Online campus attendance tracking began in 2020.</p>
          <p>Jasper campus launched in 2017.</p>
        </div>
      </div>

      {/* About */}
      <div className="bg-card rounded-lg border border-border/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4" style={{ color: "#E8913A" }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>About Lumen Metrix</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Lumen Metrix is a church analytics platform that transforms raw data into actionable insights for church leaders.
          "Lumen" means light — we illuminate the path forward through measurement and clarity.
        </p>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Version 1.0.0</span>
          <a href="https://lumenmetrix.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline" style={{ color: "#E8913A" }}>
            lumenmetrix.com <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
