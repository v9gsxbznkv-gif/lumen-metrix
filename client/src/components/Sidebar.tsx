/*
 * Lumen Metrix — Sidebar Navigation
 * Desktop: fixed sidebar (collapsible)
 * Mobile (<768px): hamburger overlay drawer
 *
 * Tab order: Dashboard, Attendance, Giving, Team Members, Groups,
 *            Assimilation, Events, Campuses, Compare, Health,
 *            Weekly Report, Annual Report, Reports, AI, Settings
 */
import { useEffect } from "react";
import LumenLogo from "./LumenLogo";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  UserCheck,
  CalendarDays,
  Building2,
  FileText,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  Church,
  ArrowLeftRight,
  Activity,
  CalendarClock,
  LogOut,
  Menu,
  X,
  UsersRound,
  Footprints,
  HeartHandshake,
} from "lucide-react";

export type TabId =
  | "dashboard"
  | "attendance"
  | "giving"
  | "teamMembers"
  | "groups"
  | "assimilation"
  | "events"
  | "campuses"
  | "compare"
  | "health"
  | "weeklyReport"
  | "annualReport"
  | "reports"
  | "ai"
  | "settings";

const NAV_ITEMS: { id: TabId; label: string; icon: React.ElementType; section?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Overview" },
  { id: "attendance", label: "Attendance", icon: UserCheck },
  { id: "giving", label: "Giving", icon: DollarSign },
  { id: "teamMembers", label: "Team Members", icon: HeartHandshake },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "assimilation", label: "Assimilation", icon: Footprints },
  { id: "events", label: "Events", icon: CalendarDays, section: "Insights" },
  { id: "campuses", label: "Campuses", icon: Building2 },
  { id: "compare", label: "Compare", icon: ArrowLeftRight },
  { id: "health", label: "Health", icon: Activity },
  { id: "weeklyReport", label: "Weekly Report", icon: CalendarClock, section: "Tools" },
  { id: "annualReport", label: "Annual Report", icon: FileText },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "ai", label: "AI Analyst", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  collapsed: boolean;
  onToggle: () => void;
  onLogout?: () => void;
  mobileOpen: boolean;
  onMobileToggle: () => void;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  collapsed,
  onToggle,
  onLogout,
  mobileOpen,
  onMobileToggle,
}: SidebarProps) {
  let lastSection = "";

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function handleTabChange(tab: TabId) {
    onTabChange(tab);
    // Close mobile drawer on tab selection
    if (mobileOpen) onMobileToggle();
  }

  const navContent = (
    <>
      {/* Logo area */}
      <div className="px-3 pt-5 pb-4 flex items-center gap-2">
        {collapsed && !mobileOpen ? (
          <div className="w-full flex justify-center">
            <LumenLogo variant="icon" size={26} />
          </div>
        ) : (
          <LumenLogo variant="full" size={24} light />
        )}
        {/* Mobile close button */}
        <button
          onClick={onMobileToggle}
          className="md:hidden ml-auto p-1 rounded"
          style={{ color: "#9CA3AF" }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Church name badge */}
      {(!collapsed || mobileOpen) && (
        <div className="mx-3 mb-4 px-3 py-2 rounded-md" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-2">
            <Church className="w-3.5 h-3.5" style={{ color: "#E8913A" }} />
            <div>
              <p className="text-[11px] font-medium" style={{ color: "#E8E5DE" }}>Revolution Church</p>
              <p className="text-[9px]" style={{ color: "#6B7280" }}>Canton, GA</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const showSection = item.section && item.section !== lastSection;
          if (item.section) lastSection = item.section;
          const showLabel = !collapsed || mobileOpen;

          return (
            <div key={item.id}>
              {showSection && showLabel && (
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.12em] px-3 pt-4 pb-1.5"
                  style={{ color: "#6B7280" }}
                >
                  {item.section}
                </p>
              )}
              {showSection && !showLabel && <div className="h-3" />}
              <button
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-md text-[13px] font-medium transition-all duration-150 ${
                  !showLabel ? "justify-center" : ""
                }`}
                style={{
                  background: isActive ? "rgba(232,145,58,0.12)" : "transparent",
                  color: isActive ? "#F5C882" : "#9CA3AF",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.color = "#E8E5DE";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#9CA3AF";
                  }
                }}
                title={!showLabel ? item.label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {showLabel && <span>{item.label}</span>}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Bottom area */}
      <div className="px-2 pb-4">
        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggle}
          className="hidden md:flex w-full items-center justify-center py-2 rounded-md transition-colors"
          style={{ color: "#6B7280" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "#E8E5DE";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#6B7280";
          }}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Logout button */}
        {onLogout && (
          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-3 py-2.5 md:py-2 mt-1 rounded-md text-[13px] font-medium transition-all duration-150 ${
              !collapsed || mobileOpen ? "" : "justify-center"
            }`}
            style={{ color: "#6B7280" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
              e.currentTarget.style.color = "#FCA5A5";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#6B7280";
            }}
            title={collapsed && !mobileOpen ? "Log out" : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {(!collapsed || mobileOpen) && <span>Log out</span>}
          </button>
        )}

        {/* Powered by branding */}
        {(!collapsed || mobileOpen) && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <p className="text-[9px] text-center" style={{ color: "#6B7280" }}>
              Powered by
            </p>
            <p className="text-[10px] text-center font-medium" style={{ color: "#9CA3AF", letterSpacing: "0.06em" }}>
              lumenmetrix.com
            </p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 py-3"
        style={{ background: "#1C1917" }}
      >
        <button onClick={onMobileToggle} className="p-1" style={{ color: "#E8E5DE" }}>
          <Menu className="w-5 h-5" />
        </button>
        <LumenLogo variant="full" size={20} light />
      </div>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={onMobileToggle}
        />
      )}

      {/* Mobile slide-out drawer */}
      <aside
        className={`md:hidden fixed left-0 top-0 h-screen z-50 w-[260px] flex flex-col transition-transform duration-250 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "#1C1917" }}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex fixed left-0 top-0 h-screen z-30 transition-all duration-200 ease-in-out flex-col ${
          collapsed ? "w-[60px]" : "w-[220px]"
        }`}
        style={{ background: "#1C1917" }}
      >
        {(() => { lastSection = ""; return null; })()}
        {navContent}
      </aside>
    </>
  );
}
