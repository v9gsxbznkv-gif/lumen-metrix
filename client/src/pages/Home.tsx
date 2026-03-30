/*
 * Lumen Metrix — Main Dashboard Layout
 * Sidebar + content area SaaS pattern
 * Full proposal navigation: Dashboard, People, Giving, Attendance, Volunteers, Events, Visitors, Campuses, Compare, Health, Reports, AI, Settings
 */
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import Sidebar, { type TabId } from "@/components/Sidebar";
import DashboardHeader from "@/components/DashboardHeader";
import OverviewTab from "@/components/tabs/OverviewTab";
import PeopleTab from "@/components/tabs/PeopleTab";
import GivingTab from "@/components/tabs/GivingTab";
import AttendanceTab from "@/components/tabs/AttendanceTab";
import VolunteersTab from "@/components/tabs/VolunteersTab";
import EventsTab from "@/components/tabs/EventsTab";
import VisitorsTab from "@/components/tabs/VisitorsTab";
import CampusesTab from "@/components/tabs/CampusesTab";
import CompareTab from "@/components/tabs/CompareTab";
import HealthTab from "@/components/tabs/HealthTab";
import ReportsTab from "@/components/tabs/ReportsTab";
import WeeklyReportTab from "@/components/tabs/WeeklyReportTab";
import AIAnalystTab from "@/components/tabs/AIAnalystTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import LumenLogo from "@/components/LumenLogo";
import { Loader2 } from "lucide-react";

const TAB_META: Record<TabId, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Key metrics at a glance across all campuses" },
  people: { title: "People & Growth", subtitle: "Assimilation funnel, salvations, baptisms, and stewardship" },
  giving: { title: "Giving", subtitle: "Tithes, offerings, and giving per capita analysis" },
  attendance: { title: "Attendance", subtitle: "Weekly, monthly, and annual attendance by demographic" },
  volunteers: { title: "Volunteers", subtitle: "Volunteer counts, ratios, and serving trends" },
  events: { title: "Events", subtitle: "Key church event performance and year-over-year comparisons" },
  visitors: { title: "Visitors", subtitle: "First-time guest tracking, conversion rates, and trends" },
  campuses: { title: "Campuses", subtitle: "Side-by-side campus comparison and performance scorecards" },
  compare: { title: "Compare", subtitle: "Side-by-side event and date comparisons across years" },
  health: { title: "Health Metrics", subtitle: "Volunteer ratios, growth rates, and organizational health" },
  weeklyReport: { title: "Weekly Report", subtitle: "Snapshot of the most recent week with campus breakdown and comparisons" },
  reports: { title: "Reports", subtitle: "Build, schedule, and export custom executive reports" },
  ai: { title: "AI Analyst", subtitle: "Ask questions about your data in natural language" },
  settings: { title: "Settings", subtitle: "Church profile, data sources, and dashboard configuration" },
};

export default function Home() {
  const { data, loading, error } = useData();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LumenLogo variant="icon" size={40} className="mx-auto mb-4" />
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" style={{ color: "#E8913A" }} />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <LumenLogo variant="full" size={32} className="mx-auto mb-6" />
          <p className="text-destructive font-semibold mb-2">Unable to load data</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const meta = TAB_META[activeTab];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content area */}
      <main
        className="transition-all duration-200 ease-in-out min-h-screen"
        style={{ marginLeft: sidebarCollapsed ? 60 : 220 }}
      >
        <div className="px-6 lg:px-8 py-6 max-w-[1400px]">
          <DashboardHeader title={meta.title} subtitle={meta.subtitle} />

          {activeTab === "dashboard" && <OverviewTab />}
          {activeTab === "people" && <PeopleTab />}
          {activeTab === "giving" && <GivingTab />}
          {activeTab === "attendance" && <AttendanceTab />}
          {activeTab === "volunteers" && <VolunteersTab />}
          {activeTab === "events" && <EventsTab />}
          {activeTab === "visitors" && <VisitorsTab />}
          {activeTab === "campuses" && <CampusesTab />}
          {activeTab === "compare" && <CompareTab />}
          {activeTab === "health" && <HealthTab />}
          {activeTab === "weeklyReport" && <WeeklyReportTab />}
          {activeTab === "reports" && <ReportsTab />}
          {activeTab === "ai" && <AIAnalystTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>

        {/* Footer */}
        <footer className="px-6 lg:px-8 pb-6">
          <div className="border-t border-border/40 pt-4 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground/50">
              Data from 2014 — 2026 &middot; Updated {new Date().toLocaleDateString()}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground/40">Powered by</span>
              <LumenLogo variant="wordmark" size={14} />
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
