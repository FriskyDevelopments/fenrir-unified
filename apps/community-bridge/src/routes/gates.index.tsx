import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Crown, ExternalLink, Loader2, Plus, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GatePreview } from "@/components/gate/gate-preview";
import { GateAnalyticsPanel } from "@/components/gate/gate-analytics-panel";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { getSiteUrl } from "@/config/site-url";
import {
  assignVerifiedTelegramDestination,
  getMyGateQuota,
  listMyGates,
  listVerifiedTelegramDestinations,
  type GateRecord,
  type VerifiedTelegramDestination,
} from "@/lib/gate.functions";
import { FREE_GATE_LIMIT, gateQuota, type GateQuota } from "@/lib/gate-limits";
// Única fuente de la copy de precios y rieles. No duplicar cifras aquí: si esta
// pantalla vuelve a escribir su propio precio, vuelve a divergir de /upgrade.
import { PackRails } from "@/components/billing/pack-rails";
import { getMyGateViewStats, type GateViewStats } from "@/lib/gate-analytics.functions";
import { getPreset } from "@/lib/gate-presets";
import { isDemoMode } from "@/config/demo-mode";
import { CommunityBotWalkthrough } from "@/components/gate/community-bot-walkthrough";
import {
  getBotCommunitiesReadiness,
  type CommunityBotReadiness,
} from "@/lib/bot-readiness.functions";

export const Route = createFileRoute("/gates/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My Gates — MyFenrir" },
      {
        name: "description",
        content: "Manage every public MyFenrir sign-in gate you own: edit presets, art and copy.",
      },
      { property: "og:title", content: "My Gates — MyFenrir" },
      { property: "og:description", content: "Manage your public MyFenrir sign-in gates." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${getSiteUrl()}/gates` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/gates` }],
  }),
  component: MyGatesPage,
});

function MyGatesPage() {
  const { session, loading, isOwner, telegramId, telegramUsername, telegramFirstName } = useAuth();
  const navigate = useNavigate();
  const fetchGates = useServerFn(listMyGates);
  const fetchVerifiedTelegramDestinations = useServerFn(listVerifiedTelegramDestinations);
  const assignTelegramDestination = useServerFn(assignVerifiedTelegramDestination);
  const fetchQuota = useServerFn(getMyGateQuota);
  const fetchBotReadiness = useServerFn(getBotCommunitiesReadiness);
  const fetchStats = useServerFn(getMyGateViewStats);
  const brand = useBrand();
  const [gates, setGates] = useState<GateRecord[] | null>(null);
  const [stats, setStats] = useState<GateViewStats[] | null>(null);
  const [quota, setQuota] = useState<GateQuota | null>(null);
  const [botReadiness, setBotReadiness] = useState<CommunityBotReadiness[]>([]);
  const [verifiedDestinations, setVerifiedDestinations] = useState<VerifiedTelegramDestination[]>(
    [],
  );
  const [assigningGateId, setAssigningGateId] = useState<string | null>(null);

  // Readiness is intentionally public operational metadata. Query the Bot OS
  // directly as a browser fallback so an auth/server-function problem can
  // never make a verified Telegram destination look disconnected.
  useEffect(() => {
    const id = brand.community.id;
    let active = true;
    void fetch(`https://gate.myfenrir.com/api/readiness?community=${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          bot?: { reachable?: boolean };
          communities?: {
            mainGroupAdmin?: boolean;
            waitingRoomAdmin?: boolean;
            waitingRoomMode?: "telegram_group" | "bot_dm";
          };
        };
        if (!active) return;
        const mainGroupAdmin = payload.communities?.mainGroupAdmin === true;
        const waitingRoomAdmin =
          payload.communities?.waitingRoomMode === "bot_dm" ||
          payload.communities?.waitingRoomAdmin === true;
        const item: CommunityBotReadiness = {
          communityId: id,
          verified: response.ok && payload.ok === true,
          botAdmin: payload.bot?.reachable === true && mainGroupAdmin && waitingRoomAdmin,
          mainGroupAdmin,
          waitingRoomAdmin,
        };
        setBotReadiness((current) => [
          ...current.filter((entry) => entry.communityId !== id),
          item,
        ]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [brand.community.id]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { next: "/gates" } });
      return;
    }
    // Demo mode has a mock session with no bearer token — protected server
    // functions would 401, so show the empty state instead of calling them.
    if (isDemoMode()) {
      setGates([]);
      setStats([]);
      setQuota(gateQuota(0));
      return;
    }
    let active = true;
    fetchGates()
      .then((rows) => {
        if (!active) return;
        setGates(rows);
        const communityIds = [
          brand.community.id,
          ...rows.map((gate) => gate.community_id).filter((id): id is string => Boolean(id)),
        ];
        void fetchBotReadiness({ data: { communityIds } })
          .then((readiness) => active && setBotReadiness(readiness))
          .catch(() => active && setBotReadiness([]));
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Could not load your gates");
        setGates([]);
      });
    fetchVerifiedTelegramDestinations()
      .then((rows) => active && setVerifiedDestinations(rows))
      .catch(() => active && setVerifiedDestinations([]));
    fetchStats()
      .then((rows) => active && setStats(rows))
      .catch(() => active && setStats([]));
    fetchQuota()
      .then((value) => active && setQuota(value))
      .catch(() => active && setQuota(null));
    return () => {
      active = false;
    };
  }, [
    loading,
    session,
    fetchGates,
    fetchVerifiedTelegramDestinations,
    fetchStats,
    fetchQuota,
    fetchBotReadiness,
    navigate,
    brand.community.id,
  ]);

  const selectTelegramDestination = async (gate: GateRecord, communityId: string) => {
    if (communityId === gate.community_id) return;
    setAssigningGateId(gate.id);
    try {
      const saved = await assignTelegramDestination({
        data: { id: gate.id, brand_id: gate.brand_id, community_id: communityId },
      });
      setGates(
        (current) => current?.map((item) => (item.id === saved.id ? saved : item)) ?? current,
      );
      const destination = verifiedDestinations.find((item) => item.communityId === communityId);
      toast.success(`${destination?.displayName ?? "Telegram group"} connected to this Gate`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect that Telegram group");
    } finally {
      setAssigningGateId(null);
    }
  };

  if (loading || !gates) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="mb-7 grid gap-6 border-b border-border/60 pb-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Public gates
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              Your entrances,
              <span className="block text-muted-foreground">under one command.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Shape every public entrance, inspect its signal, and keep the protected destination in
              sync.
            </p>
            {quota && (
              <p className="mt-3 text-xs font-medium text-muted-foreground">
                {quota.used} of {quota.limit} Gate drafts used
                {` · ${verifiedDestinations.length} verified Telegram ${verifiedDestinations.length === 1 ? "group" : "groups"}`}
                {` · ${quota.profileType === "free" ? "Free workspace" : "The Pack workspace"}`}
                {!quota.canCreate && " · Draft limit reached"}
              </p>
            )}
          </div>
          {quota?.canCreate === false ? (
            <Button
              asChild
              variant="outline"
              title={`Limit: ${quota.limit} Gate drafts per profile`}
            >
              <Link to="/gates">Review your Gates</Link>
            </Button>
          ) : (
            <Button asChild variant="fenrir">
              <Link to="/gate">
                <Plus className="mr-2 h-4 w-4" />
                New gate
              </Link>
            </Button>
          )}
        </div>

        {quota && (
          <CommunityBotWalkthrough
            communityId={brand.community.id}
            communityLabel={brand.community.label}
            owner={isOwner}
            used={quota.used}
            limit={quota.limit}
            mappingVerified={
              botReadiness.find((item) => item.communityId === brand.community.id)?.verified ===
              true
            }
            linkedTelegram={{
              id: telegramId,
              username: telegramUsername,
              firstName: telegramFirstName,
            }}
            mappings={[
              ...new Map([
                [brand.community.id, brand.community.label],
                ...gates
                  .filter((gate): gate is GateRecord & { community_id: string } =>
                    Boolean(gate.community_id),
                  )
                  .map(
                    (gate) => [gate.community_id, gate.community_label || gate.headline] as const,
                  ),
              ]).entries(),
            ].map(([id, label]) => ({
              communityId: id,
              communityLabel: label,
              verified: botReadiness.find((item) => item.communityId === id)?.verified === true,
            }))}
          />
        )}

        {quota?.profileType === "free" ? (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-8 overflow-hidden rounded-3xl border border-cyan-400/25 bg-[#030a10] p-6 shadow-[0_30px_90px_-45px_rgba(34,211,238,0.8)] sm:p-8"
          >
            <motion.div
              aria-hidden="true"
              className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl"
              animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.35, 0.8, 0.35] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <div className="relative grid gap-6">
              <div>
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                  <Crown className="h-4 w-4" /> Pack Ascension available
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Your Gate is awake. Give it a whole pack.
                </h2>
                {/* Lo que The Pack compra de verdad: enlazar un Gate a una
                    comunidad viva. NO más Gates — PACK_GATE_LIMIT es igual a
                    FREE_GATE_LIMIT. Prometer un cupo sin techo con precio por
                    comunidad era una promesa que el producto no cumple. */}
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
                  Free gives you {FREE_GATE_LIMIT} Gates to build and test with. The Pack does not
                  add more Gates — it lets you link a Gate to a live community, billed per linked
                  community, and unlocks multi-admin workflows and Bot OS control.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
                  {["The Pack · linked communities", "Gate Reports · PostHog-ready"].map(
                    (feature) => (
                      <span
                        key={feature}
                        className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-3 py-1.5 text-cyan-100/80"
                      >
                        ✓ {feature}
                      </span>
                    ),
                  )}
                </div>
              </div>
              {/* Los tres rieles vienen de pack-rails.tsx, la misma pieza que
                  monta /upgrade: tarjeta primero, Stars segundo, cripto tercero,
                  y un solo precio. Montarla —en vez de reescribir la copy aquí—
                  es lo que impide que /gates y /upgrade vuelvan a divergir. */}
              <PackRails />
            </div>
          </motion.section>
        ) : null}

        {gates.length === 0 ? (
          <Card variant="muted" className="p-10 text-center">
            <h2 className="text-sm font-semibold tracking-tight">No gates yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Create your first gate — one click on a preset and it&apos;s ready to share.
            </p>
            <Button asChild variant="fenrir" className="mt-5">
              <Link to="/gate">Create a gate</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gates.map((gate, index) => {
              const readiness = gate.community_id
                ? botReadiness.find((item) => item.communityId === gate.community_id)
                : undefined;
              const connected = readiness?.verified === true;
              return (
                <Card
                  key={gate.id}
                  className={`group relative overflow-hidden p-0 transition duration-500 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_28px_80px_-45px_hsl(var(--primary))] ${index === 0 ? "sm:col-span-2 lg:col-span-2" : ""}`}
                >
                  {index === 0 ? (
                    <div className="absolute left-4 top-4 z-20 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-xl">
                      Primary Gate
                    </div>
                  ) : null}
                  <GatePreview
                    config={gate}
                    compact
                    className={index === 0 ? "h-64 sm:h-72" : "h-40"}
                  />
                  <div className="space-y-3 p-4">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
                      <div className="min-w-0">
                        <p
                          className={`truncate font-semibold tracking-tight ${index === 0 ? "text-lg" : "text-sm"}`}
                        >
                          {gate.headline}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">/g/{gate.slug}</p>
                      </div>
                      <span
                        className={`w-fit rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${connected ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}
                      >
                        {connected ? "Live" : "Setup pending"}
                      </span>
                      <div className="sm:col-span-2">
                        <p className="mt-1 truncate text-[11px] font-medium text-primary">
                          {connected
                            ? `Connected community: ${
                                gate.community_id === "myfenrir-core" ||
                                !gate.community_label ||
                                gate.community_label === gate.community_id
                                  ? brand.community.label
                                  : gate.community_label
                              }`
                            : gate.community_id
                              ? "Community connection needs attention"
                              : "No verified group selected"}
                        </p>
                        <p
                          className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${connected ? "text-emerald-400" : "text-amber-400"}`}
                        >
                          {connected
                            ? "Bot admin verified"
                            : gate.community_id
                              ? "Bot admin needs attention"
                              : "Select this Gate in Fenrir to choose a verified group"}
                        </p>
                        <div className="mt-3 max-w-sm">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Verified Telegram group
                          </p>
                          <Select
                            value={gate.community_id ?? undefined}
                            onValueChange={(communityId) =>
                              void selectTelegramDestination(gate, communityId)
                            }
                            disabled={
                              assigningGateId === gate.id || verifiedDestinations.length === 0
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue
                                placeholder={
                                  verifiedDestinations.length > 0
                                    ? "Choose a verified group"
                                    : "No verified groups yet"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {verifiedDestinations.map((destination) => (
                                <SelectItem
                                  key={destination.communityId}
                                  value={destination.communityId}
                                >
                                  {destination.displayName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {verifiedDestinations.length === 0 ? (
                            <div className="mt-2 rounded-md border border-dashed border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                              No verified group yet. Open the Telegram launch walkthrough above, add
                              @Myfenrir_bot as an admin, then run{" "}
                              <span className="font-mono text-foreground">
                                /connect@Myfenrir_bot
                              </span>{" "}
                              in the protected group. This selector will unlock only after Fenrir
                              verifies that mapping.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <GateAnalyticsPanel
                      stats={stats?.find((s) => s.gate_id === gate.id)}
                      accent={getPreset(gate.preset).accent}
                      loading={stats === null}
                    />

                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <Link to="/gates/$id" params={{ id: gate.id }}>
                          Edit
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/g/${gate.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="sr-only">Open {gate.slug}</span>
                        </a>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
