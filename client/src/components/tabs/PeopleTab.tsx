/*
 * Lumen Metrix — People & Growth Page
 * Assimilation funnel: FTG → Salvation → Baptism → Steward
 * People-centric view of next steps data
 */
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  CAMPUS_COLORS, CHART_COLORS, formatNumber, getMaxMonth, isPartialYear,
  getNextStepsForMonths, getPartialYoYChange, MONTH_NAMES,
} from "@/lib/data";
import { Users, Heart, Droplets, HandHeart, UserPlus } from "lucide-react";

export default function PeopleTab() {
  const { data, filters } = useData();
  if (!data) return null;

  const { campus, yearStart, yearEnd } = filters;
  const latestYear = yearEnd;
  const priorYear = latestYear - 1;
  const partial = isPartialYear(data, latestYear);
  const maxMonth = getMaxMonth(data, latestYear);
  const months = Array.from({ length: maxMonth }, (_, i) => i + 1);
  const monthLabel = partial ? `Jan–${MONTH_NAMES[maxMonth - 1]}` : "Full Year";

  // Helper to get metric total for a year
  const getMetric = (year: number, metric: string) => {
    if (partial && year === latestYear) {
      return getNextStepsForMonths(data, year, campus, metric, months);
    }
    return data.next_steps
      .filter((r) => r.year === year && r.metric === metric && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.total, 0);
  };

  const ftgNow = getMetric(latestYear, "FTG");
  const salvNow = getMetric(latestYear, "Salvations");
  const baptNow = getMetric(latestYear, "Baptisms");
  const stewNow = getMetric(latestYear, "Stewardship");

  const ftgChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "FTG", m));
  const salvChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "Salvations", m));
  const baptChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "Baptisms", m));
  const stewChange = getPartialYoYChange(data, latestYear, priorYear, (y, m) => getNextStepsForMonths(data, y, campus, "Stewardship", m));

  // Assimilation funnel
  const funnelData = [
    { stage: "First-Time Guests", value: ftgNow, color: "#E8913A", icon: "👋" },
    { stage: "Salvations", value: salvNow, color: "#4A7C59", icon: "✝️" },
    { stage: "Baptisms", value: baptNow, color: "#4A7FB5", icon: "💧" },
    { stage: "New Stewards", value: stewNow, color: "#8B6DAF", icon: "🤝" },
  ];

  const conversionRates = [
    { label: "FTG → Salvation", rate: ftgNow > 0 ? (salvNow / ftgNow * 100) : 0 },
    { label: "Salvation → Baptism", rate: salvNow > 0 ? (baptNow / salvNow * 100) : 0 },
    { label: "Baptism → Steward", rate: baptNow > 0 ? (stewNow / baptNow * 100) : 0 },
    { label: "FTG → Steward", rate: ftgNow > 0 ? (stewNow / ftgNow * 100) : 0 },
  ];

  // Multi-year trend
  const years = data.meta.years.filter((y) => y >= yearStart && y <= yearEnd);
  const trendData = years.map((y) => ({
    year: y,
    FTG: getMetric(y, "FTG"),
    Salvations: getMetric(y, "Salvations"),
    Baptisms: getMetric(y, "Baptisms"),
    Stewardship: getMetric(y, "Stewardship"),
  }));

  // Monthly breakdown for latest year
  const monthlyData = Array.from({ length: maxMonth }, (_, i) => {
    const m = i + 1;
    return {
      month: MONTH_NAMES[i],
      FTG: getNextStepsForMonths(data, latestYear, campus, "FTG", [m]),
      Salvations: getNextStepsForMonths(data, latestYear, campus, "Salvations", [m]),
      Baptisms: getNextStepsForMonths(data, latestYear, campus, "Baptisms", [m]),
    };
  });

  // Campus breakdown for latest year
  const campusBreakdown = ["Canton", "Jasper", "Online"].map((c) => ({
    campus: c,
    FTG: getMetric(latestYear, "FTG") > 0 ? data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "FTG").reduce((s, r) => s + r.total, 0) : 0,
    Salvations: data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Salvations").reduce((s, r) => s + r.total, 0),
    Baptisms: data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Baptisms").reduce((s, r) => s + r.total, 0),
    Stewardship: data.next_steps.filter((r) => r.year === latestYear && r.campus === c && r.metric === "Stewardship").reduce((s, r) => s + r.total, 0),
  }));

  // ── Weekly FTG breakdown from attendance_weekly ──────────────────────────
  const weeklyRows = data.attendance_weekly || [];
  const ftgRows = weeklyRows.filter(
    (r) => r.subgroup === "FTG Adults" || r.subgroup === "FTG Kids" || r.subgroup === "RevStudents FTG"
  );

  // Find the most recent week that has FTG data
  const latestFtgWeek = ftgRows.length > 0 ? Math.max(...ftgRows.map((r) => r.weekNumber)) : 0;
  const latestFtgYear = ftgRows.length > 0
    ? Math.max(...ftgRows.filter((r) => r.weekNumber === latestFtgWeek).map((r) => r.year))
    : latestYear;
  const latestFtgRows = ftgRows.filter((r) => r.weekNumber === latestFtgWeek && r.year === latestFtgYear);

  // Totals for the most recent week (respects campus filter)
  const ftgSum = (rows: typeof ftgRows, subgroup: string) =>
    rows
      .filter((r) => r.subgroup === subgroup && (campus === "All Campuses" || r.campus === campus))
      .reduce((s, r) => s + r.headcount, 0);

  const weekFtgAdults = ftgSum(latestFtgRows, "FTG Adults");
  const weekFtgKids = ftgSum(latestFtgRows, "FTG Kids");
  const weekFtgStudents = ftgSum(latestFtgRows, "RevStudents FTG");
  const weekFtgTotal = weekFtgAdults + weekFtgKids + weekFtgStudents;

  // Per-campus split for the most recent week
  const ftgCampusSplit = ["Canton", "Jasper"].map((c) => ({
    campus: c,
    adults: latestFtgRows.filter((r) => r.campus === c && r.subgroup === "FTG Adults").reduce((s, r) => s + r.headcount, 0),
    kids: latestFtgRows.filter((r) => r.campus === c && r.subgroup === "FTG Kids").reduce((s, r) => s + r.headcount, 0),
    students: latestFtgRows.filter((r) => r.campus === c && r.subgroup === "RevStudents FTG").reduce((s, r) => s + r.headcount, 0),
    get total() { return this.adults + this.kids + this.students; },
  }));
  ftgCampusSplit.push({
    campus: "All Campuses",
    adults: weekFtgAdults,
    kids: weekFtgKids,
    students: weekFtgStudents,
    get total() { return this.adults + this.kids + this.students; },
  });

  // Weekly trend for current year (all unique weeks with FTG data)
  const ftgWeeks = Array.from(
    new Set(ftgRows.filter((r) => r.year === latestYear).map((r) => r.weekNumber))
  ).sort((a, b) => a - b);

  const ftgTrendData = ftgWeeks.map((wk) => {
    const wkRows = ftgRows.filter(
      (r) => r.weekNumber === wk && r.year === latestYear && (campus === "All Campuses" || r.campus === campus)
    );
    const adults = wkRows.filter((r) => r.subgroup === "FTG Adults").reduce((s, r) => s + r.headcount, 0);
    const kids = wkRows.filter((r) => r.subgroup === "FTG Kids").reduce((s, r) => s + r.headcount, 0);
    const students = wkRows.filter((r) => r.subgroup === "RevStudents FTG").reduce((s, r) => s + r.headcount, 0);
    return { week: `Wk ${wk}`, Adults: adults, Kids: kids, Students: students, Total: adults + kids + students };
  });

  // Week label for the FTG section header
  const ftgWeekLabel = latestFtgWeek > 0
    ? `Week ${latestFtgWeek}, ${latestFtgYear}`
    : "No data yet";

  return (
    <div className="space-y-6">
      {partial && (
        <div className="px-3 py-2 rounded-md text-xs font-medium" style={{ background: "rgba(232,145,58,0.08)", color: "#E8913A" }}>
          {latestYear} YTD ({monthLabel}) — comparisons use same period from {priorYear}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="First-Time Guests" value={formatNumber(ftgNow)} change={ftgChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#E8913A" icon={<Users className="w-4 h-4" />} />
        <KpiCard label="Salvations" value={formatNumber(salvNow)} change={salvChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#4A7C59" icon={<Heart className="w-4 h-4" />} />
        <KpiCard label="Baptisms" value={formatNumber(baptNow)} change={baptChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#4A7FB5" icon={<Droplets className="w-4 h-4" />} />
        <KpiCard label="New Stewards" value={formatNumber(stewNow)} change={stewChange} subtitle={`${latestYear} ${partial ? "YTD" : ""}`} borderColor="#8B6DAF" icon={<HandHeart className="w-4 h-4" />} />
      </div>

      {/* ── Weekly FTG Breakdown (from PCO check-in headcounts) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Weekly First-Time Guests Breakdown
          </h3>
          <span className="text-xs text-muted-foreground">{ftgWeekLabel}</span>
        </div>

        {/* FTG KPI cards for the most recent week */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="FTG Total"
            value={formatNumber(weekFtgTotal)}
            subtitle="Most recent week"
            borderColor="#E8913A"
            icon={<UserPlus className="w-4 h-4" />}
          />
          <KpiCard
            label="Adults FTG"
            value={formatNumber(weekFtgAdults)}
            subtitle="Sunday service"
            borderColor="#4A7FB5"
            icon={<Users className="w-4 h-4" />}
          />
          <KpiCard
            label="Kids FTG"
            value={formatNumber(weekFtgKids)}
            subtitle="RevKids"
            borderColor="#E8913A"
            icon={<Users className="w-4 h-4" />}
          />
          <KpiCard
            label="Students FTG"
            value={formatNumber(weekFtgStudents)}
            subtitle="RevStudents (Wed)"
            borderColor="#8B6DAF"
            icon={<Users className="w-4 h-4" />}
          />
        </div>

        {/* Per-campus split table + weekly trend chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
          {/* Campus split table */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
            <h4 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Campus Split — {ftgWeekLabel}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 text-muted-foreground font-medium">Campus</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Adults</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Kids</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Students</th>
                    <th className="text-right py-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ftgCampusSplit.map((row, i) => (
                    <tr
                      key={row.campus}
                      className={`border-b border-border/20 ${i === ftgCampusSplit.length - 1 ? "font-semibold bg-muted/20" : ""}`}
                    >
                      <td className="py-2.5 font-medium flex items-center gap-2">
                        {i < ftgCampusSplit.length - 1 && (
                          <span className="w-2 h-2 rounded-full" style={{ background: CAMPUS_COLORS[row.campus] }} />
                        )}
                        {row.campus}
                      </td>
                      <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {row.adults > 0 ? row.adults : "—"}
                      </td>
                      <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {row.kids > 0 ? row.kids : "—"}
                      </td>
                      <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {row.students > 0 ? row.students : "—"}
                      </td>
                      <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace", color: "#E8913A" }}>
                        {row.total > 0 ? row.total : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {weekFtgTotal === 0 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                No FTG data for the most recent week. Run a sync to populate.
              </p>
            )}
          </div>

          {/* Weekly FTG trend chart */}
          <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
            <h4 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              {latestYear} Weekly FTG Trend
            </h4>
            {ftgTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ftgTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <Tooltip
                    contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Total" stroke="#E8913A" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Adults" stroke="#4A7FB5" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="Kids" stroke="#E8913A" strokeWidth={1.5} dot={false} strokeDasharray="4 2" opacity={0.6} />
                  <Line type="monotone" dataKey="Students" stroke="#8B6DAF" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-xs text-muted-foreground">
                No weekly FTG trend data yet for {latestYear}. Run a sync to populate.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assimilation Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Assimilation Funnel</h3>
          <div className="space-y-3">
            {funnelData.map((item, i) => {
              const maxVal = Math.max(...funnelData.map((d) => d.value), 1);
              const width = Math.max((item.value / maxVal) * 100, 4);
              return (
                <div key={item.stage} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-muted-foreground shrink-0">{item.stage}</div>
                  <div className="flex-1 h-8 rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div
                      className="h-full rounded-md flex items-center px-3 transition-all duration-500"
                      style={{ width: `${width}%`, background: item.color }}
                    >
                      <span className="text-xs font-bold text-white" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {formatNumber(item.value)}
                      </span>
                    </div>
                  </div>
                  {i > 0 && (
                    <div className="w-12 text-right text-[10px] text-muted-foreground">
                      {funnelData[i - 1].value > 0
                        ? `${((item.value / funnelData[i - 1].value) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversion Rates */}
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Conversion Rates</h3>
          <div className="space-y-4">
            {conversionRates.map((cr) => (
              <div key={cr.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">{cr.label}</span>
                  <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#E8913A" }}>
                    {cr.rate.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(cr.rate, 100)}%`, background: "linear-gradient(90deg, #E8913A, #F5C882)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-year Trend */}
      <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
        <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Multi-Year Trends</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
            <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="FTG" stroke="#E8913A" fill="rgba(232,145,58,0.15)" strokeWidth={2} />
            <Area type="monotone" dataKey="Salvations" stroke="#4A7C59" fill="rgba(74,124,89,0.15)" strokeWidth={2} />
            <Area type="monotone" dataKey="Baptisms" stroke="#4A7FB5" fill="rgba(74,127,181,0.15)" strokeWidth={2} />
            <Area type="monotone" dataKey="Stewardship" stroke="#8B6DAF" fill="rgba(139,109,175,0.15)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Breakdown + Campus Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>{latestYear} Monthly Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1C1917", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FTG" fill="#E8913A" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Salvations" fill="#4A7C59" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Baptisms" fill="#4A7FB5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3 sm:mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>{latestYear} Campus Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 text-muted-foreground font-medium">Campus</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">FTG</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Salvations</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Baptisms</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Stewards</th>
                </tr>
              </thead>
              <tbody>
                {campusBreakdown.map((row) => (
                  <tr key={row.campus} className="border-b border-border/20">
                    <td className="py-2.5 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: CAMPUS_COLORS[row.campus] }} />
                      {row.campus}
                    </td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.FTG)}</td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.Salvations)}</td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.Baptisms)}</td>
                    <td className="text-right py-2.5" style={{ fontFamily: "'DM Mono', monospace" }}>{formatNumber(row.Stewardship)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
