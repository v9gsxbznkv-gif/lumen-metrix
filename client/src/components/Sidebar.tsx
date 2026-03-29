/*
 * Lumen Metrix — Sidebar Navigation
 * Dark charcoal sidebar with amber active states
 * SaaS-grade persistent left nav
 */
import { useState } from "react";
import LumenLogo from "./LumenLogo";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Heart,
  Activity,
  ChevronLeft,
  ChevronRight,
  Church,
} from "lucide-react";

export type TabId = "overview" | "attendance" | "giving" | "nextsteps" | "health";

const NAV_ITEMS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "attendance", label: "Attendance", icon: Users },
  { id: "giving", label: "Giving", icon: DollarSign },
  { id: "nextsteps", label: "Next Steps", icon: Heart },
  { id: "health", label: "Health", icon: Activity },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ activeTab, onTabChange, collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-30 transition-all duration-200 ease-in-out flex flex-col ${
        collapsed ? "w-[60px]" : "w-[220px]"
      }`}
      style={{ background: "#1C1917" }}
    >
      {/* Logo area */}
      <div className="px-3 pt-5 pb-4 flex items-center gap-2">
        {collapsed ? (
          <div className="w-full flex justify-center">
            <LumenLogo variant="icon" size={26} />
          </div>
        ) : (
          <LumenLogo variant="full" size={24} light />
        )}
      </div>

      {/* Church name badge */}
      {!collapsed && (
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
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-150 ${
                collapsed ? "justify-center" : ""
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
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-4">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 rounded-md transition-colors"
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

        {/* Powered by branding */}
        {!collapsed && (
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
    </aside>
  );
}
