import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, LogOut, Shield, Sparkles } from "lucide-react";
import { TelegramIdentityCard } from "@/components/telegram/telegram-identity-card";
import { DEMO_TELEGRAM_PROFILE, isDemoMode } from "@/config/demo-mode";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Dashboard — MyFenrir" },
      {
        name: "description",
        content:
          "Your MyFenrir dashboard: check your linked Telegram account, open the gate builder and manage your portal access.",
      },
      { property: "og:title", content: "Your Dashboard — MyFenrir" },
      {
        property: "og:description",
        content: "Manage your linked MyFenrir account, gates and portal access.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://clipsflow-auth-hub.lovable.app/dashboard" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://clipsflow-auth-hub.lovable.app/dashboard" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session, loading, roleLoading, telegramId, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setDemo(isDemoMode());
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { next: undefined } });
      return;
    }
  }, [loading, session, navigate]);

  if (loading || roleLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="text-lg font-semibold tracking-tight">
            <span className="text-foreground">Clips</span>
            <span className="text-primary">Flow</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/gates">My gates</Link>
            </Button>

            {isStaff && (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/brands">Brands</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin">
                    <Shield className="mr-2 h-4 w-4" />
                    Admin
                  </Link>
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut().then(() => navigate({ to: "/login", search: { next: undefined } }))}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center backdrop-blur">
          <div className="mx-auto mb-4 inline-flex rounded-full bg-primary/10 p-3">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Gate Overview</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Manage your Gates first. Telegram can be connected when you are ready to activate one.
          </p>

          {telegramId ? (
            <TelegramIdentityCard
              className="mx-auto mt-6 max-w-sm text-left"
              identity={
                demo
                  ? { ...DEMO_TELEGRAM_PROFILE, id: telegramId }
                  : { id: telegramId }
              }
              note={demo ? "Simulated Telegram identity (demo mode)." : undefined}
            />
          ) : (
            <div className="mx-auto mt-6 max-w-sm rounded-xl border border-border/60 bg-background/50 p-4 text-left">
              <p className="text-sm font-medium">Telegram is not connected yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You can create and manage Gates now. Connect Telegram only when you are ready to activate a Gate.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/activate">Connect Telegram</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
