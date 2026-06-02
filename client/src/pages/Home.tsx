/*
 * Lumen Metrix — Main Dashboard Layout
 * Desktop: fixed sidebar + content area
 * Mobile: hamburger overlay + full-width content
 *
 * URL-based routing: each tab has its own path (e.g., /attendance, /giving).
 * Sidebar clicks update the URL; direct URL access loads the correct tab.
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useData } from "@/contexts/DataContext";
import { trpc } from "@/lib/trpc";
import Sidebar, { type TabId } from "@/components/Sidebar";
import DashboardHeader from "@/components/DashboardHeader";
import OverviewTab from "@/components/tabs/OverviewTab";
import AttendanceTab2 from "@/components/tabs/AttendanceTab2";
import GivingTab2 from "@/components/tabs/GivingTab2";
import TeamMembersTab from "@/components/tabs/TeamMembersTab";
import GroupsTab from "@/components/tabs/GroupsTab";
import NextStepsTab from "@/components/tabs/NextStepsTab";
import CampusesTab from "@/components/tabs/CampusesTab";
import CompareTab from "@/components/tabs/CompareTab";
import HealthTab from "@/components/tabs/HealthTab";
import WeeklyReportTab from "@/components/tabs/WeeklyReportTab";
import AnnualReportTab from "@/components/tabs/AnnualReportTab";
import ReportsTab from "@/components/tabs/ReportsTab";
import AIAnalystTab from "@/components/tabs/AIAnalystTab";
import SettingsTab from "@/components/tabs/SettingsTab";
import DataAudit from "@/pages/DataAudit";
import LumenLogo from "@/components/LumenLogo";
import LoginPage from "@/pages/LoginPage";
import { Loader2 } from "lucide-react";

/** Map TabId → URL path slug */
const TAB_TO_PATH: Record<TabId, string> = {
  dashboard: "/dashboard",
  attendance: "/attendance",
  giving: "/giving",
  teamMembers: "/team-members",
  groups: "/groups",
  assimilation: "/assimilation",
  campuses: "/campuses",
  compare: "/compare",
  health: "/health",
  weeklyReport: "/weekly-report",
  annualReport: "/annual-report",
  reports: "/reports",
  ai: "/ai",
  settings: "/settings",
  dataAudit: "/data-audit",
};

/** Reverse map: URL path slug → TabId */
const PATH_TO_TAB: Record<string, TabId> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab as TabId])
) as Record<string, TabId>;

const TAB_META: Record<TabId, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Key metrics at a glance across all campuses" },
  attendance: { title: "Attendance", subtitle: "Weekly, monthly, and annual attendance by campus and demographic" },
  giving: { title: "Giving", subtitle: "Tithes, offerings, and giving analysis — weekly, monthly, and yearly" },
  teamMembers: { title: "Team Members", subtitle: "Volunteer and serving counts by campus — weekly, monthly, and yearly" },
  groups: { title: "Groups", subtitle: "Active groups, members, leaders, attendance, and participation rate" },
  assimilation: { title: "Assimilation", subtitle: "First-time guests, salvations, baptisms, and stewardship" },
  campuses: { title: "Campuses", subtitle: "Side-by-side campus comparison and performance scorecards" },
  compare: { title: "Compare", subtitle: "Week-over-week comparison across years" },
  health: { title: "Health Metrics", subtitle: "Volunteer ratios, growth rates, and organizational health" },
  weeklyReport: { title: "Weekly Report", subtitle: "Snapshot of the most recent week with campus breakdown and comparisons" },
  annualReport: { title: "Annual Report", subtitle: "Comprehensive annual metrics with YoY comparison and CSV export" },
  reports: { title: "Reports", subtitle: "Build, schedule, and export custom executive reports" },
  ai: { title: "AI Analyst", subtitle: "Ask questions about your data in natural language" },
  settings: { title: "Settings", subtitle: "Church profile, data sources, and dashboard configuration" },
  dataAudit: { title: "Data Audit", subtitle: "Verify dashboard numbers against raw PCO records — admin only" },
};

interface HomeProps {
  initialTab?: TabId;
}

export default function Home({ initialTab = "dashboard" }: HomeProps) {
  const { data, loading, error } = useData();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const utils = trpc.useUtils();

  // Sync activeTab when initialTab prop changes (URL navigation)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // When sidebar tab is clicked, update the URL
  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const path = TAB_TO_PATH[tab] || "/dashboard";
    // Use "/" for dashboard to keep root URL clean
    navigate(tab === "dashboard" ? "/" : path);
  }, [navigate]);

  // Staff auth — check session cookie via server
  const authCheck = trpc.staffAuth.check.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.staffAuth.logout.useMutation({
    onSuccess: () => {
      utils.staffAuth.check.setData(undefined, { isAuthenticated: false, user: null });
    },
  });

  // Show a minimal loading screen while the session check is in-flight
  if (authCheck.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F9F7F4" }}>
        <div className="text-center">
          <LumenLogo variant="icon" size={40} className="mx-auto mb-4" />
          <Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: "#E8913A" }} />
        </div>
      </div>
    );
  }

  // Not authenticated — show login page
  if (!authCheck.data?.isAuthenticated) {
    return (
      <LoginPage
        onAuthenticated={() => utils.staffAuth.check.invalidate()}
      />
    );
  }

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
        <div className="text-center max-w-md px-4">
          <LumenLogo variant="full" size={32} className="mx-auto mb-6" />
          <p className="text-destructive font-semibold mb-2">Unable to load data</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const meta = TAB_META[activeTab];
  const currentUser = authCheck.data?.user;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={() => logoutMutation.mutate()}
        mobileOpen={mobileOpen}
        onMobileToggle={() => setMobileOpen(!mobileOpen)}
        userRole={currentUser?.role as "admin" | "user" | undefined}
      />

      {/* Main content area — offset by sidebar on desktop, full-width on mobile */}
      <main
        className="transition-all duration-200 ease-in-out min-h-screen pt-14 md:pt-0"
        style={{ marginLeft: "var(--sidebar-offset, 0px)" }}
      >
        <style>{`
          @media (min-width: 768px) {
            main { --sidebar-offset: ${sidebarCollapsed ? 60 : 220}px; }
          }
        `}</style>
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1400px]">
          <DashboardHeader title={meta.title} subtitle={meta.subtitle} />

          {activeTab === "dashboard" && <OverviewTab />}
          {activeTab === "attendance" && <AttendanceTab2 />}
          {activeTab === "giving" && <GivingTab2 />}
          {activeTab === "teamMembers" && <TeamMembersTab />}
          {activeTab === "groups" && <GroupsTab />}
          {activeTab === "assimilation" && <NextStepsTab />}
          {activeTab === "campuses" && <CampusesTab />}
          {activeTab === "compare" && <CompareTab />}
          {activeTab === "health" && <HealthTab />}
          {activeTab === "weeklyReport" && <WeeklyReportTab />}
          {activeTab === "annualReport" && <AnnualReportTab />}
          {activeTab === "reports" && <ReportsTab />}
          {activeTab === "ai" && <AIAnalystTab />}
          {activeTab === "settings" && <SettingsTab currentUser={currentUser} />}
          {activeTab === "dataAudit" && <DataAudit />}
        </div>

        {/* Footer */}
        <footer className="px-4 sm:px-6 lg:px-8 pb-6">
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
