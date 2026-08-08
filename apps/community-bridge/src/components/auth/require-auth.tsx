import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function BlockedScreen() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-2xl border border-destructive/40 bg-card/40 p-8 text-center backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account blocked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account has been blocked by the community staff. If you think this is a mistake,
          contact them through the community.
        </p>
        <button
          onClick={() => void signOut()}
          className="mt-6 inline-flex items-center justify-center rounded-md border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring/40"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, roleLoading, blocked } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", search: { next: undefined } });
  }, [loading, session, navigate]);

  if (loading || !session) return <FullPageSpinner />;
  if (!roleLoading && blocked) return <BlockedScreen />;
  return <>{children}</>;
}

interface RequireRoleProps {
  children: ReactNode;
  roles: AppRole[];
}

export function RequireRole({ children, roles }: RequireRoleProps) {
  const { session, loading, role, roleLoading, blocked } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", search: { next: undefined } });
  }, [loading, session, navigate]);

  if (loading || roleLoading || !session) return <FullPageSpinner />;

  if (blocked) return <BlockedScreen />;

  if (!role || !roles.includes(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border/60 bg-card/40 p-8 text-center backdrop-blur">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">403 — Forbidden</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You don't have permission to view this page.
          </p>
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
