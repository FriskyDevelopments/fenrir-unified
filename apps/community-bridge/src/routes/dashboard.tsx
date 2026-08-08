import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, LogOut, Shield, ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";
import { TelegramIdentityCard } from "@/components/telegram/telegram-identity-card";
import { DEMO_TELEGRAM_PROFILE, isDemoMode } from "@/config/demo-mode";
import { useBrand } from "@/config/brand-context";
import { checkMyCommunityAccess, type CommunityAccessStatus } from "@/lib/access.functions";

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
      { property: "og:url", content: "https://communities.myfenrir.com/dashboard" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://communities.myfenrir.com/dashboard" }],
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
    if (!roleLoading && !telegramId) {
      navigate({ to: "/activate" });
    }
  }, [loading, roleLoading, session, telegramId, navigate]);

  if (loading || roleLoading || !session || !telegramId) {
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
            <span className="text-foreground">My</span>
            <span className="text-primary">Fenrir</span>
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
              onClick={() =>
                signOut().then(() => navigate({ to: "/login", search: { next: undefined } }))
              }
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
          <h1 className="text-2xl font-semibold tracking-tight">Your MyFenrir Dashboard</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Your account is linked. Manage your gates and community access from here.
          </p>

          <TelegramIdentityCard
            className="mx-auto mt-6 max-w-sm text-left"
            identity={demo ? { ...DEMO_TELEGRAM_PROFILE, id: telegramId } : { id: telegramId }}
            note={demo ? "Simulated Telegram identity (demo mode)." : undefined}
          />

          {!demo && <CommunityAccessCard />}
        </div>
      </main>
    </div>
  );
}

/**
 * Membership status per the Neon-based gatekeeper — the same allowlist the
 * Telegram bot consults. Purely informative here; enforcement happens at the
 * gate and in the bot.
 */
function CommunityAccessCard() {
  const brand = useBrand();
  const [status, setStatus] = useState<CommunityAccessStatus | null>(null);
  const checkAccess = useServerFn(checkMyCommunityAccess);

  useEffect(() => {
    let cancelled = false;
    checkAccess({ data: { communitySlug: brand.community.id } })
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ source: "neon", configured: true, allowed: null });
      });
    return () => {
      cancelled = true;
    };
  }, [brand.community.id, checkAccess]);

  if (!status || !status.configured) return null;

  return (
    <div className="mx-auto mt-4 max-w-sm rounded-xl border border-border/60 bg-card/60 p-4 text-left">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Community access
      </p>
      {status.allowed === true && (
        <p className="mt-2 flex items-center gap-2 text-sm text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          Active member of {brand.community.label} — access granted by the Fenrir gatekeeper.
        </p>
      )}
      {status.allowed === false && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden />
          <span>
            No active membership found for {brand.community.label}. If you think this is wrong,
            contact an admin.
          </span>
        </p>
      )}
      {status.allowed === null && (
        <p className="mt-2 text-sm text-muted-foreground">Access status unavailable right now.</p>
      )}
    </div>
  );
}
