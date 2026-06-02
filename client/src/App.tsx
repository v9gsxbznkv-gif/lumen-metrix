import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DataProvider } from "./contexts/DataContext";
import Home from "./pages/Home";
import InvitePage from "./pages/InvitePage";

function InviteRoute() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  return <InvitePage token={token} onRegistered={() => navigate("/")} />;
}

function Router() {
  return (
    <Switch>
      {/* Main dashboard routes — each tab gets its own URL */}
      <Route path="/">{() => <Home initialTab="dashboard" />}</Route>
      <Route path="/dashboard">{() => <Home initialTab="dashboard" />}</Route>
      <Route path="/attendance">{() => <Home initialTab="attendance" />}</Route>
      <Route path="/giving">{() => <Home initialTab="giving" />}</Route>
      <Route path="/team-members">{() => <Home initialTab="teamMembers" />}</Route>
      <Route path="/groups">{() => <Home initialTab="groups" />}</Route>
      <Route path="/assimilation">{() => <Home initialTab="assimilation" />}</Route>
      <Route path="/campuses">{() => <Home initialTab="campuses" />}</Route>
      <Route path="/compare">{() => <Home initialTab="compare" />}</Route>
      <Route path="/health">{() => <Home initialTab="health" />}</Route>
      <Route path="/weekly-report">{() => <Home initialTab="weeklyReport" />}</Route>
      <Route path="/annual-report">{() => <Home initialTab="annualReport" />}</Route>
      <Route path="/reports">{() => <Home initialTab="reports" />}</Route>
      <Route path="/ai">{() => <Home initialTab="ai" />}</Route>
      <Route path="/settings">{() => <Home initialTab="settings" />}</Route>
      <Route path="/data-audit">{() => <Home initialTab="dataAudit" />}</Route>

      {/* Other routes */}
      <Route path="/invite" component={InviteRoute} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <DataProvider>
            <Toaster />
            <Router />
          </DataProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
