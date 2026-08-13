import { getSiteUrl } from "@/config/site-url";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ArrowUpRight, Crown, Loader2, LogOut, Shield, Sparkles, Waypoints } from "lucide-react";
import { motion } from "motion/react";
import { TelegramIdentityCard } from "@/components/telegram/telegram-identity-card";
import { DEMO_TELEGRAM_PROFILE, isDemoMode } from "@/config/demo-mode";
import { useBrand } from "@/config/brand-context";
import { listMyGates } from "@/lib/gate.functions";

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
      { property: "og:url", content: `${getSiteUrl()}/dashboard` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/dashboard` }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session, loading, roleLoading, telegramId, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  const brand = useBrand();
  const fetchGates = useServerFn(listMyGates);
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
      // Only first-time operators should see the builder. Returning operators
      // go to their existing gates; forcing them into /gate creates duplicate
      // setup work and hides the thing they already own.
      let active = true;
      if (isDemoMode()) {
        window.location.replace("/gate?onboarding=1");
        return () => { active = false; };
      }
      void fetchGates({ data: { brand_id: brand.id } })
        .then((gates) => {
          if (!active) return;
          window.location.replace(gates.length > 0 ? "/gates" : "/gate?onboarding=1");
        })
        .catch(() => {
          // Do not funnel a returning user into a new gate if the gate lookup
          // is temporarily unavailable. Leave the dashboard visible instead.
        });
      return () => { active = false; };
    }
  }, [loading, roleLoading, session, telegramId, navigate, fetchGates, brand.id]);

  if (loading || roleLoading || !session || !telegramId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_5%,hsl(var(--primary)/0.2),transparent_26%),radial-gradient(circle_at_91%_28%,#7c3aed1e,transparent_30%)]" />
      <header className="border-b border-border/60 bg-card/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="group flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary transition-transform duration-300 group-hover:rotate-6"><Waypoints className="h-4 w-4" /></span><span className="text-sm font-semibold tracking-[0.08em] text-foreground">FENRIR <span className="font-normal text-primary">COMMUNITY BRIDGE</span></span></Link>
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

      <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48 }} className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card/55 p-8 backdrop-blur sm:p-10">
          <motion.div aria-hidden="true" className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-primary/25" animate={{ rotate: 360 }} transition={{ duration: 34, repeat: Infinity, ease: "linear" }} />
          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Sparkles className="h-3.5 w-3.5" /> Identity linked</div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Your community is ready to move.</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">Manage the Gates you already own, connect Telegram, and grow the community layer around them.</p>
          </div>

          <TelegramIdentityCard
            className="relative mx-auto mt-8 max-w-md text-left"
            identity={
              demo
                ? { ...DEMO_TELEGRAM_PROFILE, id: telegramId }
                : { id: telegramId }
            }
            note={demo ? "Simulated Telegram identity (demo mode)." : undefined}
          />
          <div className="relative mx-auto mt-7 flex flex-wrap justify-center gap-3"><Button asChild variant="fenrir"><Link to="/gates">Open your Gates <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild variant="outline"><Link to="/upgrade"><Crown className="mr-2 h-4 w-4" /> Explore Pack</Link></Button></div>
        </motion.section>
      </main>
    </div>
  );
}
