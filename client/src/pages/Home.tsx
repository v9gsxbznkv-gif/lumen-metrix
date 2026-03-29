/*
 * Design: Warm Pastoral Command Center
 * Typography: Outfit (headings) + Instrument Sans (body)
 * Colors: Stone bg, sage green primary, campus-coded accents
 */
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import DashboardHeader from "@/components/DashboardHeader";
import OverviewTab from "@/components/tabs/OverviewTab";
import AttendanceTab from "@/components/tabs/AttendanceTab";
import GivingTab from "@/components/tabs/GivingTab";
import NextStepsTab from "@/components/tabs/NextStepsTab";
import HealthTab from "@/components/tabs/HealthTab";
import { Loader2, LayoutDashboard, Users, DollarSign, Heart, Activity } from "lucide-react";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "attendance", label: "Attendance", icon: Users },
  { id: "giving", label: "Giving", icon: DollarSign },
  { id: "nextsteps", label: "Next Steps", icon: Heart },
  { id: "health", label: "Health", icon: Activity },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const { loading, error } = useData();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            Loading dashboard data...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <p className="text-destructive font-semibold mb-2">
            Failed to load data
          </p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      {/* Tab Navigation */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="container">
          <nav className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <main className="container py-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "attendance" && <AttendanceTab />}
        {activeTab === "giving" && <GivingTab />}
        {activeTab === "nextsteps" && <NextStepsTab />}
        {activeTab === "health" && <HealthTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-4 mt-8">
        <div className="container">
          <p className="text-[10px] text-muted-foreground/60 text-center">
            Revolution Church Executive Dashboard — Data from 2013 to 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
