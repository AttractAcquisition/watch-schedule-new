import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

interface Props {
  children: ReactNode;
  requireOnboarding?: boolean;
}

export function ProtectedRoute({ children, requireOnboarding = true }: Props) {
  const { isLoading, isAuthenticated, isPaid, hasCompletedOnboarding } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Watch Schedule
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isPaid) return <Navigate to="/payment-required" replace />;
  if (requireOnboarding && !hasCompletedOnboarding) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}
