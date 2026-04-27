import { Switch, Route, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { apiRequest } from "@/lib/queryClient";
import Dashboard from "@/pages/Dashboard";
import DemoDashboard from "@/pages/DemoDashboard";
import AuthPage from "@/pages/AuthPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import NotFound from "@/pages/not-found";

function AppRoutes() {
  const { session, loading } = useAuth();
  const seededRef = useRef(false);

  // If Supabase redirected here for password reset, show that page regardless of auth state
  const isResetFlow =
    window.location.pathname === "/reset-password" ||
    window.location.hash.includes("type=recovery");

  // Seed default data once after first sign-in
  useEffect(() => {
    if (session && !seededRef.current && !isResetFlow) {
      seededRef.current = true;
      apiRequest("POST", "/api/auth/seed").catch(() => {});
    }
  }, [session, isResetFlow]);

  if (isResetFlow) {
    return <ResetPasswordPage />;
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "hsl(var(--background))" }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "hsl(var(--primary))", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!session) {
    return (
      <Switch hook={useHashLocation}>
        <Route path="/auth" component={AuthPage} />
        <Route component={DemoDashboard} />
      </Switch>
    );
  }

  return (
    <Switch hook={useHashLocation}>
      <Route path="/" component={Dashboard} />
      {/* Catch post-auth redirects (e.g. /auth/callback) and send to dashboard */}
      <Route component={() => { window.location.replace("/#/"); return null; }} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
