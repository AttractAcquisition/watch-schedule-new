import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { ProfileRow, SubscriptionRow, VesselRow } from "./database.types";
import type { PlanType } from "./types";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: ProfileRow | null;
  subscription: SubscriptionRow | null;
  vessel: VesselRow | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPaid: boolean;
  hasCompletedOnboarding: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    opts?: { fullName?: string; plan?: PlanType },
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshAppState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PAID_STATUSES = new Set<SubscriptionRow["status"]>(["active", "trialing"]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [vessel, setVessel] = useState<VesselRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeUserId = useRef<string | null>(null);

  const loadAppState = useCallback(async (userId: string | null) => {
    if (!userId) {
      setProfile(null);
      setSubscription(null);
      setVessel(null);
      return;
    }
    const [profileRes, subRes, vesselRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("vessels")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (activeUserId.current !== userId) return;
    if (profileRes.error) console.warn("[auth] profile:", profileRes.error.message);
    if (subRes.error) console.warn("[auth] subscription:", subRes.error.message);
    if (vesselRes.error) console.warn("[auth] vessel:", vesselRes.error.message);
    setProfile(profileRes.data ?? null);
    setSubscription(subRes.data ?? null);
    setVessel(vesselRes.data ?? null);
  }, []);

  const refreshAppState = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    activeUserId.current = data.session?.user.id ?? null;
    await loadAppState(data.session?.user.id ?? null);
  }, [loadAppState]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      activeUserId.current = data.session?.user.id ?? null;
      await loadAppState(data.session?.user.id ?? null);
      if (mounted) setIsLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      const uid = nextSession?.user.id ?? null;
      activeUserId.current = uid;
      await loadAppState(uid);
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadAppState]);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    const channel = supabase
      .channel(`sub-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${uid}` },
        () => {
          if (activeUserId.current === uid) loadAppState(uid);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id, loadAppState]);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async (email, password, opts) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: opts?.fullName ?? "",
          intended_plan: opts?.plan ?? null,
        },
      },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    return { error: null, needsConfirmation: !!data.user && !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSubscription(null);
    setVessel(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isPaid = !!subscription && PAID_STATUSES.has(subscription.status);
    return {
      user: session?.user ?? null,
      session,
      profile,
      subscription,
      vessel,
      isLoading,
      isAuthenticated: !!session,
      isPaid,
      hasCompletedOnboarding: !!vessel?.onboarding_completed,
      signIn,
      signUp,
      signOut,
      refreshAppState,
    };
  }, [session, profile, subscription, vessel, isLoading, signIn, signUp, signOut, refreshAppState]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function initialsFromName(name?: string | null, email?: string | null): string {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "—";
}
