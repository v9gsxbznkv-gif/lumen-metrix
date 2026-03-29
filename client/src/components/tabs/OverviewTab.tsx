import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import KpiCard from "@/components/KpiCard";
import {
  formatCurrency,
  formatNumber,
  getYoYChange,
  CAMPUS_COLORS,
  CAMPUS_COLORS_LIGHT,
} from "@/lib/data";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Users, DollarSign, Heart, HandHelping } from "lucide-react";

export default function OverviewTab() {
  const { data, filters } = useData();

  const filteredYears = useMemo(() => {
    if (!data) return [];
    return data.meta.years.filter(
      (y) => y >= filters.yearStart && y <= filters.yearEnd
    );
  }, [data, filters]);

  // Attendance trend
  const attendanceTrend = useMemo(() => {
    if (!data) return [];
    const totals = data.attendance.total_annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        const all = totals.find(
          (t) => t.year === year && t.campus === "All Campuses"
        );
        row["All Campuses"] = all?.avg_weekly ?? 0;
      } else {
        const c = totals.find(
          (t) => t.year === year && t.campus === filters.campus
        );
        row[filters.campus] = c?.avg_weekly ?? 0;
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // Campus comparison attendance
  const campusComparison = useMemo(() => {
    if (!data) return [];
    const totals = data.attendance.total_annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      ["Canton", "Jasper", "Online"].forEach((c) => {
        const match = totals.find((t) => t.year === year && t.campus === c);
        row[c] = Math.round(match?.avg_weekly ?? 0);
      });
      return row;
    });
  }, [data, filteredYears]);

  // Giving trend
  const givingTrend = useMemo(() => {
    if (!data) return [];
    const tithes = data.giving.tithes_annual;
    return filteredYears.map((year) => {
      const row: Record<string, number | string> = { year };
      if (filters.campus === "All Campuses") {
        const all = tithes.find(
          (t) => t.year === year && t.campus === "All Campuses"
        );
        row.total = all?.total ?? 0;
      } else {
        const c = tithes.find(
          (t) => t.year === year && t.campus === filters.campus
        );
        row.total = c?.total ?? 0;
      }
      return row;
    });
  }, [data, filters, filteredYears]);

  // Latest year KPIs
  const kpis = useMemo(() => {
    if (!data) return null;
    // Use the last full year (not partial)
    const fullYears = filteredYears.filter((y) => y <= 2024);
    const latestYear = fullYears[fullYears.length - 1] ?? 2024;
    const priorYear = latestYear - 1;

    const totals = data.attendance.total_annual;
    const tithes = data.giving.tithes_annual;
    const gpc = data.computed.giving_per_capita;

    const getAtt = (y: number) => {
      if (filters.campus === "All Campuses") {
        return totals.find((t) => t.year === y && t.campus === "All Campuses")
          ?.avg_weekly ?? 0;
      }
      return totals.find((t) => t.year === y && t.campus === filters.campus)
        ?.avg_weekly ?? 0;
    };

    const getGiving = (y: number) => {
      if (filters.campus === "All Campuses") {
        return tithes.find((t) => t.year === y && t.campus === "All Campuses")
          ?.total ?? 0;
      }
      return tithes.find((t) => t.year === y && t.campus === filters.campus)
        ?.total ?? 0;
    };

    const getGpc = (y: number) => {
      if (filters.campus === "All Campuses") {
        return gpc.find((t) => t.year === y && t.campus === "All Campuses")
          ?.giving_per_capita ?? 0;
      }
      return gpc.find((t) => t.year === y && t.campus === filters.campus)
        ?.giving_per_capita ?? 0;
    };

    // Next steps
    const ns = data.next_steps.annual;
    const getNs = (y: number, metric: string) => {
      if (filters.campus === "All Campuses") {
        return ns
          .filter((n) => n.year === y && n.metric === metric)
          .reduce((sum, n) => sum + n.total, 0);
      }
      return ns.find(
        (n) => n.year === y && n.campus === filters.campus && n.metric === metric
      )?.total ?? 0;
    };

    return {
      year: latestYear,
      attendance: getAtt(latestYear),
      attendanceChange: getYoYChange(getAtt(latestYear), getAtt(priorYear)),
      giving: getGiving(latestYear),
      givingChange: getYoYChange(getGiving(latestYear), getGiving(priorYear)),
      gpc: getGpc(latestYear),
      gpcChange: getYoYChange(getGpc(latestYear), getGpc(priorYear)),
      ftg: getNs(latestYear, "FTG"),
      ftgChange: getYoYChange(getNs(latestYear, "FTG"), getNs(priorYear, "FTG")),
      salvations: getNs(latestYear, "Salvation"),
      salvationsChange: getYoYChange(
        getNs(latestYear, "Salvation"),
        getNs(priorYear, "Salvation")
      ),
      baptisms: getNs(latestYear, "Baptism"),
      baptismsChange: getYoYChange(
        getNs(latestYear, "Baptism"),
        getNs(priorYear, "Baptism")
      ),
    };
  }, [data, filters, filteredYears]);

  if (!data || !kpis) return null;

  const campusKeys =
    filters.campus === "All Campuses"
      ? ["All Campuses"]
      : [filters.campus];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="Avg Weekly Attendance"
          value={formatNumber(kpis.attendance)}
          change={kpis.attendanceChange}
          subtitle={`${kpis.year} full year`}
          icon={<Users className="w-5 h-5" />}
          borderColor={CAMPUS_COLORS[filters.campus]}
        />
        <KpiCard
          label="Annual Tithes"
          value={formatCurrency(kpis.giving)}
          change={kpis.givingChange}
          subtitle={`${kpis.year} total`}
          icon={<DollarSign className="w-5 h-5" />}
          borderColor={CAMPUS_COLORS[filters.campus]}
        />
        <KpiCard
          label="Giving Per Capita"
          value={formatCurrency(kpis.gpc)}
          change={kpis.gpcChange}
          subtitle="Annual per attendee"
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          label="First Time Guests"
          value={formatNumber(kpis.ftg)}
          change={kpis.ftgChange}
          subtitle={`${kpis.year} total`}
          icon={<Heart className="w-5 h-5" />}
        />
        <KpiCard
          label="Salvations"
          value={formatNumber(kpis.salvations)}
          change={kpis.salvationsChange}
          subtitle={`${kpis.year} total`}
          icon={<Heart className="w-5 h-5" />}
        />
        <KpiCard
          label="Baptisms"
          value={formatNumber(kpis.baptisms)}
          change={kpis.baptismsChange}
          subtitle={`${kpis.year} total`}
          icon={<HandHelping className="w-5 h-5" />}
        />
      </div>

      {/* Charts Row 1: Attendance + Giving */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance Trend */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4 text-card-foreground">
            Average Weekly Attendance
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={attendanceTrend}>
              <defs>
                {campusKeys.map((key) => (
                  <linearGradient
                    key={key}
                    id={`grad-${key.replace(/\s/g, "")}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={CAMPUS_COLORS[key]}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={CAMPUS_COLORS[key]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e5e0",
                }}
                formatter={(v: number) => [formatNumber(v), "Avg Weekly"]}
              />
              {campusKeys.map((key) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CAMPUS_COLORS[key]}
                  fill={`url(#grad-${key.replace(/\s/g, "")})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Giving Trend */}
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4 text-card-foreground">
            Annual Tithes & Offerings
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={givingTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e5e0",
                }}
                formatter={(v: number) => [
                  `$${v.toLocaleString()}`,
                  "Tithes & Offerings",
                ]}
              />
              <Bar
                dataKey="total"
                fill={CAMPUS_COLORS[filters.campus]}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campus Comparison */}
      {filters.campus === "All Campuses" && (
        <div className="bg-card rounded-lg border border-border/60 p-5 shadow-sm">
          <h3 className="text-sm font-semibold font-[Outfit] mb-4 text-card-foreground">
            Campus Attendance Comparison — Avg Weekly
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={campusComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e5e0",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="Canton"
                fill={CAMPUS_COLORS.Canton}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="Jasper"
                fill={CAMPUS_COLORS.Jasper}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="Online"
                fill={CAMPUS_COLORS.Online}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
