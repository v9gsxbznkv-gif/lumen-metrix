/**
 * Lumen Metrix — Groups Page
 * Active groups, total members, leaders, group attendance, participation rate
 * Trend charts and campus breakdown
 */
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, LineChart, Line,
} from "recharts";
import { CHART_COLORS, formatNumber, MONTH_NAMES } from "@/lib/data";
import { Users, UserCheck, Crown, Activity, Loader2 } from "lucide-react";

export default function GroupsTab() {
  const { filters } = useData();
  const { campus, yearEnd } = filters;
  const latestYear = yearEnd;

  const { data, isLoading } = trpc.groups.getData.useQuery({
    year: latestYear,
    campus,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || !data.current) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p className="text-lg font-medium">No groups data available</p>
        <p className="text-sm mt-1">Connect Planning Center to sync groups data.</p>
      </div>
    );
  }

  const { current, priorYear, monthly, campusBreakdown, yearlyTrend } = data;

  // ── KPI change helpers ──────────────────────────────────────
  function pctChange(now: number, prev: number) {
    if (prev === 0) return { label: "N/A", positive: true, value: 0 };
    const pct = ((now - prev) / prev) * 100;
    return {
      label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      positive: pct >= 0,
      value: pct,
    };
  }

  const groupsChange = priorYear ? pctChange(current.activeGroups, priorYear.activeGroups) : undefined;
  const membersChange = priorYear ? pctChange(current.totalMembers, priorYear.totalMembers) : undefined;
  const leadersChange = priorYear ? pctChange(current.totalLeaders, priorYear.totalLeaders) : undefined;
  const attendanceChange = priorYear ? pctChange(current.avgAttendance, priorYear.avgAttendance) : undefined;

  // ── Monthly chart data ──────────────────────────────────────
  const monthlyChartData = monthly.map((m) => ({
    name: MONTH_NAMES[m.month - 1]?.substring(0, 3) || `M${m.month}`,
    "Active Groups": m.activeGroups,
    "Total Members": m.totalMembers,
    "Leaders": m.totalLeaders,
    "Group Attendance": m.avgAttendance,
    "Prior Year Groups": m.priorActiveGroups,
    "Prior Year Members": m.priorMembers,
  }));

  // ── Yearly trend chart data ─────────────────────────────────
  const trendData = yearlyTrend.map((y) => ({
    name: String(y.year),
    "Active Groups": y.activeGroups,
    "Total Members": y.totalMembers,
    "Leaders": y.totalLeaders,
    "Group Attendance": y.avgAttendance,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard
          label="Active Groups"
          value={formatNumber(current.activeGroups)}
          change={groupsChange}
          borderColor="#E8913A"
          icon={<Users className="w-5 h-5" />}
        />
        <KpiCard
          label="Total Members"
          value={formatNumber(current.totalMembers)}
          change={membersChange}
          borderColor="#4A7FB5"
          icon={<UserCheck className="w-5 h-5" />}
        />
        <KpiCard
          label="Group Leaders"
          value={formatNumber(current.totalLeaders)}
          change={leadersChange}
          borderColor="#4A7C59"
          icon={<Crown className="w-5 h-5" />}
        />
        <KpiCard
          label="Avg Group Attendance"
          value={formatNumber(current.avgAttendance)}
          change={attendanceChange}
          borderColor="#8B6DAF"
          icon={<Activity className="w-5 h-5" />}
        />
        <KpiCard
          label="Participation Rate"
          value={`${current.participationRate}%`}
          subtitle="Group members as % of church attendance"
          borderColor="#C45B4A"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Monthly Trends */}
        {monthlyChartData.length > 0 && (
          <div className="bg-card rounded-lg p-4 sm:p-5 border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-card-foreground mb-4">
              Monthly Trends — {latestYear}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Active Groups" fill="#E8913A" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Total Members" fill="#4A7FB5" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Group Attendance" fill="#8B6DAF" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Members vs Prior Year */}
        {monthlyChartData.length > 0 && (
          <div className="bg-card rounded-lg p-4 sm:p-5 border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-semibold text-card-foreground mb-4">
              Members: {latestYear} vs {latestYear - 1}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="Total Members"
                  stroke="#4A7FB5"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={`${latestYear} Members`}
                />
                <Line
                  type="monotone"
                  dataKey="Prior Year Members"
                  stroke="#4A7FB5"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                  name={`${latestYear - 1} Members`}
                  opacity={0.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Multi-Year Trend */}
      {trendData.length > 2 && (
        <div className="bg-card rounded-lg p-4 sm:p-5 border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-card-foreground mb-4">
            Groups Growth Over Time
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="groupsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E8913A" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#E8913A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="membersGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4A7FB5" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4A7FB5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="Active Groups"
                stroke="#E8913A"
                fill="url(#groupsGrad)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="Total Members"
                stroke="#4A7FB5"
                fill="url(#membersGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Campus Breakdown Table */}
      {campusBreakdown.length > 0 && (
        <div className="bg-card rounded-lg p-4 sm:p-5 border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-card-foreground mb-4">
            Campus Breakdown — {latestYear}
          </h3>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    Campus
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    Active Groups
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    Members
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    Leaders
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    Avg Attendance
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    Participation
                  </th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                    YoY Groups
                  </th>
                </tr>
              </thead>
              <tbody>
                {campusBreakdown.map((row) => {
                  const groupsYoY = row.priorActiveGroups > 0
                    ? ((row.activeGroups - row.priorActiveGroups) / row.priorActiveGroups * 100).toFixed(1)
                    : "N/A";
                  return (
                    <tr key={row.campus} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-card-foreground">{row.campus}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-card-foreground">{formatNumber(row.activeGroups)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-card-foreground">{formatNumber(row.totalMembers)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-card-foreground">{formatNumber(row.totalLeaders)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-card-foreground">{formatNumber(row.avgAttendance)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-card-foreground">{row.participationRate}%</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {groupsYoY === "N/A" ? (
                          <span className="text-muted-foreground">N/A</span>
                        ) : (
                          <span style={{ color: parseFloat(groupsYoY) >= 0 ? "#4A7C59" : "#C45B4A" }}>
                            {parseFloat(groupsYoY) >= 0 ? "+" : ""}{groupsYoY}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* All Campuses total row */}
                {campusBreakdown.length > 1 && (
                  <tr className="border-t-2 border-border/60 font-semibold bg-muted/20">
                    <td className="py-2.5 px-3 text-card-foreground">All Campuses</td>
                    <td className="py-2.5 px-3 text-right font-mono text-card-foreground">
                      {formatNumber(campusBreakdown.reduce((s, r) => s + r.activeGroups, 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-card-foreground">
                      {formatNumber(campusBreakdown.reduce((s, r) => s + r.totalMembers, 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-card-foreground">
                      {formatNumber(campusBreakdown.reduce((s, r) => s + r.totalLeaders, 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-card-foreground">
                      {formatNumber(campusBreakdown.reduce((s, r) => s + r.avgAttendance, 0))}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-card-foreground">
                      {current.participationRate}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {(() => {
                        const totalPrior = campusBreakdown.reduce((s, r) => s + r.priorActiveGroups, 0);
                        const totalNow = campusBreakdown.reduce((s, r) => s + r.activeGroups, 0);
                        if (totalPrior === 0) return <span className="text-muted-foreground">N/A</span>;
                        const pct = ((totalNow - totalPrior) / totalPrior * 100).toFixed(1);
                        return (
                          <span style={{ color: parseFloat(pct) >= 0 ? "#4A7C59" : "#C45B4A" }}>
                            {parseFloat(pct) >= 0 ? "+" : ""}{pct}%
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leader-to-Member Ratio */}
      <div className="bg-card rounded-lg p-4 sm:p-5 border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-semibold text-card-foreground mb-4">
          Key Ratios
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Members per Group</p>
            <p className="text-2xl font-mono font-bold text-card-foreground">
              {current.activeGroups > 0 ? (current.totalMembers / current.activeGroups).toFixed(1) : "—"}
            </p>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Members per Leader</p>
            <p className="text-2xl font-mono font-bold text-card-foreground">
              {current.totalLeaders > 0 ? (current.totalMembers / current.totalLeaders).toFixed(1) : "—"}
            </p>
          </div>
          <div className="text-center p-4 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Leaders per Group</p>
            <p className="text-2xl font-mono font-bold text-card-foreground">
              {current.activeGroups > 0 ? (current.totalLeaders / current.activeGroups).toFixed(1) : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
