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
import { supabase } from "@/integrations/supabase/client";
import {
  DEMO_SESSION,
  DEMO_TELEGRAM_ID,
  isDemoMode,
  isDemoTelegramLinked,
} from "@/config/demo-mode";
import { logDemoEvent } from "@/config/demo-log";

const supabaseConfigured = true;

export type AppRole = "owner" | "admin" | "user";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  role: AppRole | null;
  telegramId: number | null;
  roleLoading: boolean;
  /** True when staff has blocked this account (enforced server-side too). */
  blocked: boolean;
  isStaff: boolean;
  isOwner: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [demoLinked, setDemoLinked] = useState(false);
  const currentUserId = useRef<string | null>(null);

  // Demo mode is client-only: resolved after hydration to avoid SSR mismatch.
  useEffect(() => {
    const on = isDemoMode();
    const linked = isDemoTelegramLinked();
    setDemo(on);
    setDemoLinked(linked);
    if (on) {
      logDemoEvent("auth", "Mock session adopted", `${DEMO_SESSION.user.email} · role owner`);
      logDemoEvent(
        "session",
        linked ? "Telegram link restored" : "Telegram not linked",
        linked ? `telegram_id ${DEMO_TELEGRAM_ID}` : "activation required",
      );
    }
  }, []);

  const loadRole = useCallback(async (userId: string | null) => {
    if (!userId) {
      setRole(null);
      setTelegramId(null);
      setBlocked(false);
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, telegram_id, blocked_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      setRole((data.role as AppRole) ?? "user");
      setTelegramId(data.telegram_id ? Number(data.telegram_id) : null);
      setBlocked(Boolean(data.blocked_at));
    } else {
      setRole("user");
      setTelegramId(null);
      setBlocked(false);
    }
    setRoleLoading(false);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      const newUid = newSession?.user.id ?? null;
      if (newUid !== currentUserId.current || event === "USER_UPDATED") {
        currentUserId.current = newUid;
        void loadRole(newUid);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      const uid = data.session?.user.id ?? null;
      currentUserId.current = uid;
      void loadRole(uid);
      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [loadRole]);

  const signOut = useCallback(async () => {
    if (demo) logDemoEvent("auth", "Mock sign-out", "session cleared in this browser");
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setTelegramId(null);
    setBlocked(false);
    currentUserId.current = null;
  }, [demo]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  }, []);

  const refreshRole = useCallback(async () => {
    const linked = isDemoTelegramLinked();
    setDemoLinked(linked);
    if (demo)
      logDemoEvent(
        "session",
        linked ? "Session refreshed — Telegram linked" : "Session refreshed — link cleared",
        linked ? `telegram_id ${DEMO_TELEGRAM_ID}` : undefined,
      );
    await loadRole(currentUserId.current);
  }, [demo, loadRole]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session: demo ? DEMO_SESSION : session,
      user: demo ? DEMO_SESSION.user : (session?.user ?? null),
      loading: demo ? false : loading,
      configured: supabaseConfigured,
      role: demo ? "owner" : role,
      telegramId: demo ? (demoLinked ? DEMO_TELEGRAM_ID : null) : telegramId,
      roleLoading: demo ? false : roleLoading,
      blocked: demo ? false : blocked,
      isStaff: demo || role === "owner" || role === "admin",
      isOwner: demo || role === "owner",
      signOut,
      refresh,
      refreshRole,
    }),
    [
      demo,
      demoLinked,
      session,
      loading,
      role,
      telegramId,
      roleLoading,
      blocked,
      signOut,
      refresh,
      refreshRole,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
