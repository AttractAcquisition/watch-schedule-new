import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import PaymentRequired from "@/pages/PaymentRequired";
import PaymentSuccess from "@/pages/PaymentSuccess";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Crew from "@/pages/Crew";
import Leave from "@/pages/Leave";
import Charter from "@/pages/Charter";
import Fairness from "@/pages/Fairness";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/payment-required" element={<PaymentRequired />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />

            {/* Onboarding (paid but not onboarded) */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

            {/* Protected app */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/crew"
              element={
                <ProtectedRoute>
                  <Crew />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leave"
              element={
                <ProtectedRoute>
                  <Leave />
                </ProtectedRoute>
              }
            />
            <Route
              path="/charter"
              element={
                <ProtectedRoute>
                  <Charter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/fairness"
              element={
                <ProtectedRoute>
                  <Fairness />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-foreground)" },
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
