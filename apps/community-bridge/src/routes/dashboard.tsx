import { getSiteUrl } from "@/config/site-url";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Crown,
  Fingerprint,
  Eye,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Waypoints,
} from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { TelegramIdentityCard } from "@/components/telegram/telegram-identity-card";
import { DEMO_TELEGRAM_PROFILE, isDemoMode } from "@/config/demo-mode";
import { useBrand } from "@/config/brand-context";
import {
  listMyGates,
  listVerifiedTelegramDestinations,
  type GateRecord,
  type VerifiedTelegramDestination,
} from "@/lib/gate.functions";
import { getPreset } from "@/lib/gate-presets";
import { getMyGateViewStats, type GateViewStats } from "@/lib/gate-analytics.functions";
import { listModerationReviews, type ModerationReview } from "@/lib/moderation.functions";
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
      { property: "og:url", content: `${getSiteUrl()}/dashboard` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/dashboard` }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session, loading, roleLoading, telegramId, isStaff, isOwner, signOut } = useAuth();
  const navigate = useNavigate();
  const brand = useBrand();
  const fetchGates = useServerFn(listMyGates);
  const fetchVerifiedDestinations = useServerFn(listVerifiedTelegramDestinations);
  const fetchGateStats = useServerFn(getMyGateViewStats);
  const fetchPendingReviews = useServerFn(listModerationReviews);
  const [demo, setDemo] = useState(false);
  const [gateCount, setGateCount] = useState<number | null>(null);
  const [gateRecords, setGateRecords] = useState<GateRecord[]>([]);
  const [verifiedDestinations, setVerifiedDestinations] = useState<VerifiedTelegramDestination[]>(
    [],
  );
  const [gateStats, setGateStats] = useState<GateViewStats[]>([]);
  const [gatesLoading, setGatesLoading] = useState(true);
  const [gateLoadError, setGateLoadError] = useState(false);
  const [statsLoadError, setStatsLoadError] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<ModerationReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoadError, setReviewsLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothScrollProgress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    mass: 0.35,
  });

  useEffect(() => {
    setDemo(isDemoMode());
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { next: undefined } });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    if (loading || !session) return;
    if (isDemoMode()) {
      setGateCount(1);
      setGatesLoading(false);
      setGateLoadError(false);
      setStatsLoadError(false);
      return;
    }
    let active = true;
    setGatesLoading(true);
    setGateLoadError(false);
    setStatsLoadError(false);
    void Promise.allSettled([fetchGates(), fetchGateStats(), fetchVerifiedDestinations()])
      .then(([gatesResult, statsResult, destinationsResult]) => {
        if (!active) return;
        if (gatesResult.status === "fulfilled") {
          setGateCount(gatesResult.value.length);
          setGateRecords(gatesResult.value);
          setGateLoadError(false);
        } else {
          setGateCount(null);
          setGateLoadError(true);
        }
        if (statsResult.status === "fulfilled") {
          setGateStats(statsResult.value);
          setStatsLoadError(false);
        } else {
          setStatsLoadError(true);
        }
        if (destinationsResult.status === "fulfilled") {
          setVerifiedDestinations(destinationsResult.value);
        } else {
          // A failed lookup is never evidence that a community is live.
          setVerifiedDestinations([]);
        }
      })
      .finally(() => active && setGatesLoading(false));
    return () => {
      active = false;
    };
  }, [loading, session, fetchGates, fetchGateStats, fetchVerifiedDestinations, loadAttempt]);

  useEffect(() => {
    if (loading || !session) return;
    if (!isStaff) {
      setPendingReviews([]);
      setReviewsLoading(false);
      setReviewsLoadError(false);
      return;
    }

    let active = true;
    setReviewsLoading(true);
    setReviewsLoadError(false);
    void fetchPendingReviews({ data: { status: "pending", limit: 5 } })
      .then((rows) => {
        if (active) setPendingReviews(rows);
      })
      .catch(() => {
        if (active) setReviewsLoadError(true);
      })
      .finally(() => {
        if (active) setReviewsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loading, session, isStaff, fetchPendingReviews]);

  const totalViews = gateStats.reduce((sum, item) => sum + item.total, 0);
  const recentViews = gateStats.reduce((sum, item) => sum + item.last7, 0);

  // A Gate draft and an account-level Telegram identity do not protect a
  // community. Completion requires a Gate mapped to one of this owner's
  // bot-verified Telegram destinations.
  const hasGates = (gateCount ?? 0) > 0;
  const verifiedCommunityIds = new Set(
    verifiedDestinations.map((destination) => destination.communityId),
  );
  const hasVerifiedDestination = gateRecords.some(
    (gate) => Boolean(gate.community_id) && verifiedCommunityIds.has(gate.community_id!),
  );
  const isComplete =
    Boolean(telegramId) && hasGates && hasVerifiedDestination && !gatesLoading && !gateLoadError;

  if (loading || roleLoading || !session) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#12171c]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:38px_38px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]"
        />
        <motion.div
          aria-hidden="true"
          className="absolute h-64 w-64 rounded-full border border-primary/20"
          animate={reduceMotion ? undefined : { rotate: 360, scale: [1, 1.08, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_22px_hsl(var(--primary))]" />
          <span className="absolute inset-9 rounded-full border border-dashed border-emerald-400/15" />
        </motion.div>

        <div className="relative flex w-64 flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_50px_hsl(var(--primary)/0.18)]">
            <Waypoints className="h-6 w-6" />
          </span>
          <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/80">
            Fenrir Community Bridge
          </p>
          <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.2em] text-white/30">
            Synchronizing operator signal
          </p>
          <div className="mt-7 h-px w-full overflow-hidden bg-white/10">
            <motion.div
              aria-hidden="true"
              className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#c2a469] to-[#7fae9d]"
              animate={reduceMotion ? { x: "50%" } : { x: ["-100%", "200%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <span className="sr-only">Loading your MyFenrir dashboard</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <a
        href="#dashboard-main"
        className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xl transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-white/70"
      >
        Skip to dashboard content
      </a>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_5%,rgba(194,164,105,0.18),transparent_28%),radial-gradient(circle_at_91%_28%,rgba(127,174,157,0.1),transparent_32%)]"
      />
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/72 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/58">
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-[-1px] h-px origin-left bg-gradient-to-r from-[#c2a469] via-[#7fae9d] to-[#c2a469] shadow-[0_0_14px_rgba(194,164,105,0.55)]"
          style={{ scaleX: reduceMotion ? scrollYProgress : smoothScrollProgress }}
        />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary transition-transform duration-300 group-hover:rotate-6">
              <Waypoints className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold tracking-[0.08em] text-foreground sm:text-sm">
              FENRIR{" "}
              <span className="hidden font-normal text-primary sm:inline">COMMUNITY BRIDGE</span>
            </span>
          </Link>
          <nav aria-label="Dashboard navigation" className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/gates">
                <span className="hidden sm:inline">My </span>Gates
              </Link>
            </Button>

            {isOwner && (
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link to="/access">Access</Link>
              </Button>
            )}

            {isStaff && (
              <>
                <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                  <Link to="/brands">Brands</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
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
              aria-label="Sign out"
              onClick={() =>
                signOut().then(() => navigate({ to: "/login", search: { next: undefined } }))
              }
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </nav>
        </div>
      </header>

      <main
        id="dashboard-main"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-12"
      >
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="relative overflow-hidden rounded-[2rem] border border-[#c2a469]/28 bg-[#12171c]/92 shadow-[0_42px_130px_-70px_rgba(194,164,105,0.55)]"
        >
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -left-40 top-12 h-[34rem] w-[34rem] rounded-full bg-primary/12 blur-[110px]"
            animate={
              reduceMotion
                ? undefined
                : { x: [0, 180, 48, 0], y: [0, 52, 180, 0], scale: [1, 1.16, 0.92, 1] }
            }
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -right-44 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[#7fae9d]/10 blur-[120px]"
            animate={reduceMotion ? undefined : { x: [0, -120, -36, 0], y: [0, -90, 24, 0] }}
            transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:38px_38px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
          />
          <div className="relative grid min-h-[530px] lg:grid-cols-[1.1fr_.9fr] xl:grid-cols-[1.25fr_.75fr]">
            <div className="flex flex-col justify-between border-b border-border/60 p-7 sm:p-10 lg:border-b-0 lg:border-r lg:p-14">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#c2a469]/30 bg-[#c2a469]/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c2a469]">
                  {telegramId ? (
                    <Radio className="h-3.5 w-3.5" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5" />
                  )}
                  {telegramId ? "Operator signal online" : "Operator setup in progress"}
                </div>
                <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.28em] text-primary">
                  Community control / 01
                </p>
                <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[.94] tracking-[-0.055em] text-white sm:text-6xl xl:text-7xl">
                  Guard the entrance.
                  <br />
                  <span className="text-white/38">Grow the room.</span>
                </h1>
                <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/52 sm:text-base">
                  {telegramId
                    ? "Your identity, public Gates and protected Telegram destination now move as one MyFenrir system."
                    : "Your Gates are preserved. Link Telegram when you are ready to activate the private destination and member handoff."}
                </p>
              </div>
              <div className="mt-10 flex flex-wrap gap-3">
                <Button asChild variant="fenrir">
                  <Link to="/gates">
                    Open Gate command <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="border-white/15 bg-white/[.03]">
                  <Link to={telegramId ? "/upgrade" : "/activate"}>
                    {telegramId ? (
                      <Crown className="mr-2 h-4 w-4" />
                    ) : (
                      <Bot className="mr-2 h-4 w-4" />
                    )}
                    {telegramId ? "Explore Pack" : "Link Telegram"}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="relative flex min-h-[400px] flex-col justify-between overflow-hidden p-7 sm:min-h-[460px] sm:p-10">
              <motion.div
                aria-hidden="true"
                className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-primary/25"
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
              >
                <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_22px_hsl(var(--primary))]" />
                <span className="absolute inset-12 rounded-full border border-dashed border-emerald-400/20" />
              </motion.div>
              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/38">
                    Fenrir node
                  </p>
                  <p className="mt-1 font-mono text-xs text-emerald-300">
                    {telegramId
                      ? `CB–${String(telegramId).slice(-4).padStart(4, "0")}`
                      : "AWAITING LINK"}
                  </p>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-xl">
                  🐺
                </span>
              </div>
              {telegramId ? (
                <TelegramIdentityCard
                  className="relative my-8 border-white/10 bg-black/25 text-left"
                  identity={
                    demo ? { ...DEMO_TELEGRAM_PROFILE, id: telegramId } : { id: telegramId }
                  }
                  note={demo ? "Simulated Telegram identity (demo mode)." : undefined}
                />
              ) : (
                <div className="relative my-8 rounded-2xl border border-dashed border-white/15 bg-black/20 p-5">
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#61a8de]/25 bg-[#61a8de]/10 text-[#61a8de]">
                      <Bot className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">Telegram link pending</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/45">
                        No identity is linked yet. Existing Gates remain intact and editable.
                      </p>
                      <Link
                        to="/activate"
                        className="mt-2 inline-flex min-h-8 items-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[#61a8de] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#61a8de]/70"
                      >
                        Connect securely <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              )}
              <div className="relative grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                <div className="bg-[#09100f] p-4">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  <strong className="mt-5 block text-xl text-white">
                    {telegramId ? "Linked" : "Pending"}
                  </strong>
                  <small className="mt-1 block text-[9px] uppercase tracking-[.16em] text-white/38">
                    Identity
                  </small>
                </div>
                <div className="bg-[#09100f] p-4">
                  <Waypoints className="h-4 w-4 text-primary" />
                  <strong className="mt-5 block text-xl text-white">{gateCount ?? "—"}</strong>
                  <small className="mt-1 block text-[9px] uppercase tracking-[.16em] text-white/38">
                    Gates
                  </small>
                </div>
                <div className="bg-[#09100f] p-4">
                  <Bot className="h-4 w-4 text-[#61a8de]" />
                  <strong className="mt-5 block text-xl text-white">{telegramId ? 1 : 0}</strong>
                  <small className="mt-1 block text-[9px] uppercase tracking-[.16em] text-white/38">
                    Telegram
                  </small>
                </div>
              </div>
            </div>
          </div>

          <div className="relative border-t border-white/10 bg-black/35 px-7 py-4 backdrop-blur-2xl sm:px-10 sm:py-5 lg:px-14">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-[1.15fr_1fr_1fr_1.15fr] lg:gap-0">
              {[
                {
                  label: "Gate network",
                  value: `${gateCount ?? "—"} entrances`,
                  detail: gateLoadError
                    ? "Gate network unavailable"
                    : `${gateStats.filter((item) => item.last7 > 0).length} active this week`,
                },
                {
                  label: "Seven-day signal",
                  value: statsLoadError ? "Signal unavailable" : `${recentViews} visits`,
                  detail: statsLoadError ? "Analytics temporarily offline" : "Live Gate traffic",
                },
                {
                  label: "All-time reach",
                  value: statsLoadError ? "Signal unavailable" : `${totalViews} views`,
                  detail: statsLoadError ? "Analytics temporarily offline" : "Recorded entrances",
                },
                {
                  label: "Private handoff",
                  value: telegramId ? "Telegram armed" : "Awaiting link",
                  detail: telegramId ? "Identity synchronized" : "Gates remain preserved",
                },
              ].map((signal, index) => (
                <div key={signal.label} className="relative lg:px-6 lg:first:pl-0 lg:last:pr-0">
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -left-px top-1 hidden h-10 w-px bg-white/10 lg:block"
                    />
                  )}
                  <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/30">
                    {String(index + 1).padStart(2, "0")} · {signal.label}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <strong className="text-sm font-semibold tracking-[-0.02em] text-white/85">
                      {signal.value}
                    </strong>
                    <span className="hidden text-[9px] text-white/35 xl:inline">
                      {signal.detail}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {isComplete ? (
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-6 overflow-hidden rounded-[2rem] border border-emerald-400/30 bg-emerald-400/[0.06] p-6 sm:p-8"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  You&apos;re all set
                </p>
                <h2 className="text-xl font-semibold tracking-[-0.03em]">
                  Your community is live and running.
                </h2>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Pack is active, your Gates are published, and your Fenrir address is ready — no setup
              left. Here is what you can do next.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  to: "/gate" as const,
                  icon: Plus,
                  title: "Create another Gate",
                  body: "Add a new entrance to your community.",
                },
                {
                  to: "/brands" as const,
                  icon: UsersRound,
                  title: "Link another group",
                  body: "Bring a second community into your Pack.",
                },
                {
                  to: "/gates" as const,
                  icon: BarChart3,
                  title: "View reports",
                  body: "Views, 7-day trends and unique visitors.",
                },
                {
                  to: "/gates" as const,
                  icon: Send,
                  title: "Invite members",
                  body: "Share a Gate link or QR to bring people in.",
                },
                ...(isOwner
                  ? [
                      {
                        to: "/access" as const,
                        icon: Shield,
                        title: "Accept access requests",
                        body: "Approve people before Fenrir issues their private invite.",
                      },
                    ]
                  : []),
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.title}
                    to={action.to}
                    className="group rounded-2xl border border-border/70 bg-card/50 p-4 transition hover:border-emerald-400/50 hover:bg-emerald-400/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-emerald-400/15 group-hover:text-emerald-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="mt-3 flex items-center text-sm font-semibold">
                      {action.title}
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {action.body}
                    </p>
                  </Link>
                );
              })}
            </div>
          </motion.section>
        ) : null}

        {isStaff ? (
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5 }}
            className="mt-6 overflow-hidden rounded-[2rem] border border-border/70 bg-card/45"
          >
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 p-6 sm:p-8">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-300">
                  Trust desk / live decisions
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                  Acceptance needs a human when signal is unclear.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  This is the real review queue: only items the classifier could not safely decide.
                  Each decision is attributable and preserved in the audit trail.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/moderation">
                  Open decision desk <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {reviewsLoading ? (
              <div className="grid gap-px bg-border/60 sm:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="min-h-28 animate-pulse bg-card p-6">
                    <div className="h-3 w-20 rounded-full bg-muted" />
                    <div className="mt-5 h-4 w-3/4 rounded-full bg-muted/70" />
                    <div className="mt-3 h-2 w-1/2 rounded-full bg-muted/50" />
                  </div>
                ))}
              </div>
            ) : reviewsLoadError ? (
              <div className="p-6 sm:p-8">
                <p className="text-sm font-medium">The decision desk is temporarily unavailable.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No review was changed. Open the desk to retry the secure queue connection.
                </p>
              </div>
            ) : pendingReviews.length === 0 ? (
              <div className="flex flex-wrap items-center gap-4 p-6 sm:p-8">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Nothing waiting for acceptance.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automated checks resolved every current item without escalating it to your team.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left">
                  <thead className="border-b border-border/60 bg-muted/20 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th className="px-6 py-4 font-medium sm:px-8">Decision signal</th>
                      <th className="px-6 py-4 font-medium">Subject</th>
                      <th className="px-6 py-4 font-medium">Safety read</th>
                      <th className="px-6 py-4 font-medium sm:px-8">Waiting</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {pendingReviews.map((review) => (
                      <tr key={review.id} className="transition hover:bg-muted/25">
                        <td className="px-6 py-4 sm:px-8">
                          <span className="inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">
                            {review.reason.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td className="max-w-72 px-6 py-4">
                          <p
                            className="truncate font-mono text-xs text-foreground"
                            title={review.subject_ref}
                          >
                            {review.subject_ref}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {review.subject_kind}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          <span>Apparent age: {review.apparent_age ?? "—"}</span>
                          <span className="mx-2 text-border">·</span>
                          <span>
                            Explicit:{" "}
                            {review.explicit === null ? "—" : review.explicit ? "yes" : "no"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground sm:px-8">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5" />
                            {new Date(review.created_at).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.section>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr] xl:grid-cols-[1.35fr_.65fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
            className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/45"
          >
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 p-6 sm:p-8">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">
                  Live constellation / {String(gateCount ?? 0).padStart(2, "0")} ·{" "}
                  {statsLoadError ? "signal unavailable" : `${recentViews} recent`}
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                  Every entrance has a pulse.
                </h2>
              </div>
              <Link
                to="/gates"
                className="group inline-flex min-h-8 items-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                Inspect all Gates
                <ArrowRight className="ml-2 h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </Link>
            </div>

            {gatesLoading ? (
              <div
                role="status"
                aria-label="Loading Gate constellation"
                className={`grid gap-px bg-border/60 sm:grid-cols-2 ${reduceMotion ? "" : "animate-pulse"}`}
              >
                <span className="sr-only">Loading Gate constellation</span>
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    aria-hidden="true"
                    className={`relative min-h-52 overflow-hidden bg-card p-6 ${item === 0 ? "sm:row-span-2 sm:min-h-[421px]" : ""}`}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.12),transparent_45%)]" />
                    <div className="relative flex h-full min-h-40 flex-col justify-between">
                      <div className="h-5 w-24 rounded-full bg-white/[.055]" />
                      <div className="space-y-3">
                        <div className="h-2 w-20 rounded-full bg-white/[.045]" />
                        <div className="h-6 w-2/3 rounded-full bg-white/[.07]" />
                        <div className="h-2 w-4/5 rounded-full bg-white/[.04]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : gateLoadError && gateRecords.length === 0 ? (
              <div className="p-8 sm:p-10">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-300">
                  Gate network interrupted
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                  Your Gates could not be reached.
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Nothing was removed or changed. Reconnect to load the current Gate constellation.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry connection
                </Button>
              </div>
            ) : gateRecords.length > 0 ? (
              <div className="grid gap-px bg-border/60 sm:grid-cols-2">
                {gateRecords.slice(0, 3).map((gate, index) => {
                  const preset = getPreset(gate.preset);
                  const signal = gateStats.find((item) => item.gate_id === gate.id);
                  const hasSignal = !statsLoadError && (signal?.last7 ?? 0) > 0;
                  return (
                    <Link
                      key={gate.id}
                      to="/gates/$id"
                      params={{ id: gate.id }}
                      className={`group relative min-h-52 overflow-hidden bg-card p-6 transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:z-10 hover:shadow-[0_24px_80px_-35px_hsl(var(--primary))] ${index === 0 ? "sm:row-span-2 sm:min-h-[421px]" : ""}`}
                    >
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 opacity-35 transition duration-700 group-hover:scale-105 group-hover:opacity-55"
                        style={{ background: preset.atmosphere }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/90" />
                      <div className="relative flex h-full min-h-40 flex-col justify-between">
                        <div className="flex items-start justify-between gap-4">
                          <span className="rounded-full border border-white/15 bg-black/30 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-white/70 backdrop-blur-xl">
                            {index === 0 ? "Primary signal" : `Node 0${index + 1}`}
                          </span>
                          <span
                            className={`inline-flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] ${hasSignal ? "text-emerald-300" : "text-white/35"}`}
                          >
                            <Activity className="h-4 w-4" />
                            {statsLoadError ? "— / 7d" : `${signal?.last7 ?? 0} / 7d`}
                          </span>
                        </div>
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
                            /g/{gate.slug}
                          </p>
                          <h3
                            className={`mt-2 font-semibold tracking-[-0.03em] text-white ${index === 0 ? "text-3xl" : "text-xl"}`}
                          >
                            {gate.headline}
                          </h3>
                          <p className="mt-2 line-clamp-2 max-w-md text-xs leading-relaxed text-white/50">
                            {gate.subheadline}
                          </p>
                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                            <span className="inline-flex items-center text-[9px] font-semibold uppercase tracking-[0.16em] text-white/75">
                              Tune Gate <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                            </span>
                            <span className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-white/38">
                              <Eye className="h-3 w-3" />{" "}
                              {statsLoadError
                                ? "views unavailable"
                                : `${signal?.total ?? 0} total views`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 sm:p-10">
                <p className="text-sm text-muted-foreground">No Gate signal detected yet.</p>
                <Button asChild variant="fenrir" className="mt-5">
                  <Link to="/gate">Create the first Gate</Link>
                </Button>
              </div>
            )}
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="flex flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-[#080b0b]"
          >
            <div className="border-b border-border/60 p-6 sm:p-8">
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-300">
                Operator sequence
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                From identity to access.
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-white/42">
                The shortest route from public signal to a protected room.
              </p>
            </div>
            <div className="flex-1 divide-y divide-white/8">
              {[
                {
                  icon: Fingerprint,
                  label: "Identity",
                  value: telegramId ? "Linked" : "Awaiting link",
                  active: Boolean(telegramId),
                },
                {
                  icon: Waypoints,
                  label: "Public Gates",
                  value: gateCount
                    ? `${gateCount} nodes · ${statsLoadError ? "views unavailable" : `${totalViews} views`}`
                    : "Create Gate 01",
                  active: Boolean(gateCount),
                },
                {
                  icon: Bot,
                  label: "Private destination",
                  value: telegramId ? "Telegram armed" : "Telegram pending",
                  active: Boolean(telegramId),
                },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 p-6 transition hover:bg-white/[.025] sm:p-7"
                  >
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-2xl border ${item.active ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[.03] text-white/35"}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/30">
                        0{index + 1} / {item.label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white/82">{item.value}</p>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${item.active ? "bg-emerald-400 shadow-[0_0_16px_#34d399]" : "border border-white/25"}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="border-t border-white/8 p-6 sm:p-8">
              <Button asChild className="w-full" variant={telegramId ? "outline" : "fenrir"}>
                <Link to={telegramId ? "/gates" : "/activate"}>
                  {telegramId ? "Review system" : "Complete the sequence"}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.aside>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: reduceMotion ? 0 : 0.75 }}
          className="relative mt-24 overflow-hidden border-t border-border/70 pb-12 pt-14 sm:mt-32 sm:pb-20 sm:pt-20"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-36 top-0 h-72 w-72 rounded-full border border-primary/15 sm:right-4 sm:h-96 sm:w-96"
          >
            <span className="absolute inset-10 rounded-full border border-dashed border-emerald-400/10" />
            <span className="absolute inset-24 rounded-full border border-white/[.04]" />
          </div>

          <div className="relative grid gap-12 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-primary">
                The threshold is yours / 03
              </p>
              <h2 className="mt-6 max-w-5xl text-4xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
                The room stays private.
                <br />
                <span className="text-muted-foreground/45">The invitation stays yours.</span>
              </h2>
              <p className="mt-7 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {telegramId
                  ? `${gateCount ?? 0} public thresholds now lead into one protected MyFenrir identity.`
                  : "Your public Gates are already here. Complete the private handoff when your Telegram destination is ready."}
              </p>
            </div>

            <div className="flex flex-col items-start gap-4 lg:items-end">
              <Button asChild variant="fenrir" size="lg" className="group min-w-52">
                <Link to={telegramId ? "/gates" : "/activate"}>
                  {telegramId ? "Shape the next Gate" : "Complete the handoff"}
                  <ArrowUpRight className="ml-2 h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground/55">
                MyFenrir · private by design
              </span>
            </div>
          </div>
        </motion.section>
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
