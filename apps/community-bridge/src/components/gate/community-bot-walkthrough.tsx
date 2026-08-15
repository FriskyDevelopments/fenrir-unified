import { motion } from "motion/react";
import { Bot, CheckCircle2, MapPinned, PlugZap, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  COMMUNITY_DESTINATION_ADAPTERS,
  destinationStateLabel,
} from "@/lib/community-destinations";

type Props = {
  communityId: string;
  communityLabel: string;
  owner: boolean;
  used: number;
  limit: number;
  mappingVerified: boolean;
  mappings?: Array<{ communityId: string; communityLabel?: string; verified: boolean }>;
  linkedTelegram?: { id: number | null; username: string | null; firstName: string | null };
};

const steps = [
  {
    icon: MapPinned,
    title: "Choose the community",
    body: "Every Gate displays exactly which community it serves.",
  },
  {
    icon: Sparkles,
    title: "Create its Gates",
    body: "Standard profiles get 5 Gates in one active community. Owners get 20 across several.",
  },
  {
    icon: ShieldCheck,
    title: "Connect Telegram",
    body: "Add Telegram as this community's first protected destination. Make @Myfenrir_bot an admin with Invite Users.",
  },
  {
    icon: CheckCircle2,
    title: "Prove the mapping",
    body: "Map the protected group from inside that chat, then confirm the Bot OS readiness check in the bot DM.",
  },
];

const telegramPreviewSteps = [
  {
    label: "Account",
    title: "Identity linked",
    message: "Welcome. Your MyFenrir account is linked with Frisky Dev.",
    detail: "This Telegram identity can now manage the community setup.",
  },
  {
    label: "Group",
    title: "Protected group",
    message: "Add @Myfenrir_bot to the group and grant Invite Users.",
    detail: "Fenrir keeps the real destination private behind the Gate.",
  },
  {
    label: "Mapping",
    title: "Map the destination",
    message: "Run /setmain@Myfenrir_bot in the protected group.",
    detail: "The public Gate remains pending until this mapping is verified.",
  },
  {
    label: "Access",
    title: "Access confirmed",
    message: "Your identity and community access have been confirmed.",
    detail:
      "A private one-person Telegram handoff is ready. You can now close the Mini App safely.",
  },
] as const;

export function CommunityBotWalkthrough({
  communityId,
  communityLabel,
  owner,
  used,
  limit,
  mappingVerified,
  mappings = [],
  linkedTelegram,
}: Props) {
  const [telegramPreviewOpen, setTelegramPreviewOpen] = useState(false);
  const [telegramPreviewStep, setTelegramPreviewStep] = useState(0);
  const [miniAppClosed, setMiniAppClosed] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState(communityId);
  const visibleMappings =
    owner && mappings.length > 0
      ? mappings
      : [{ communityId, communityLabel, verified: mappingVerified }];
  const selectedMapping =
    visibleMappings.find((mapping) => mapping.communityId === selectedCommunityId) ??
    visibleMappings[0];
  const activeCommunityId = selectedMapping.communityId;
  const activeCommunityLabel = selectedMapping.communityLabel ||
    (activeCommunityId === communityId ? communityLabel : activeCommunityId);
  const linkedTelegramLabel = linkedTelegram?.username
    ? `@${linkedTelegram.username}`
    : linkedTelegram?.firstName
      ? `${linkedTelegram.firstName} · ID ${linkedTelegram.id ?? "verified"}`
      : linkedTelegram?.id
        ? `Telegram ID ${linkedTelegram.id}`
        : null;

  function confirmMiniAppClose() {
    setMiniAppClosed(true);
    const webApp = (
      window as Window & {
        Telegram?: {
          WebApp?: {
            close?: () => void;
            HapticFeedback?: { notificationOccurred?: (type: "success") => void };
          };
        };
      }
    ).Telegram?.WebApp;
    webApp?.HapticFeedback?.notificationOccurred?.("success");
    if (webApp?.close) window.setTimeout(() => webApp.close?.(), 900);
  }
  return (
    <Card className="relative mb-8 overflow-hidden border-primary/30 bg-[radial-gradient(circle_at_15%_0%,hsl(var(--primary)/0.18),transparent_30%),linear-gradient(135deg,hsl(var(--card)/0.96),hsl(var(--background)/0.9))] p-0">
      <motion.div
        aria-hidden="true"
        className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-primary/25"
        animate={{ rotate: 360, scale: [1, 1.06, 1] }}
        transition={{
          rotate: { duration: 28, repeat: Infinity, ease: "linear" },
          scale: { duration: 5, repeat: Infinity },
        }}
      />
      <div className="relative border-b border-border/60 p-5 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Bot className="h-3.5 w-3.5" /> Community launch walkthrough
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(260px,340px)] lg:items-end">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.035em] sm:text-2xl">
                Activate your Community Gate.
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Connect Telegram as the protected destination for this Gate. Other platforms are not
                available yet.
              </p>
            </div>
            <div className="grid gap-2">
              {visibleMappings.map((mapping) => (
                <button
                  type="button"
                  key={mapping.communityId}
                  onClick={() => setSelectedCommunityId(mapping.communityId)}
                  aria-pressed={mapping.communityId === activeCommunityId}
                  className={`rounded-2xl border px-4 py-3 text-left backdrop-blur transition lg:text-right ${mapping.communityId === activeCommunityId ? "border-primary/60 bg-primary/15 shadow-[0_0_28px_hsl(var(--primary)/0.12)]" : "border-primary/20 bg-background/55 hover:border-primary/40"}`}
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {mapping.verified ? "Community online" : "Community namespace"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {mapping.communityLabel ||
                      (mapping.communityId === communityId ? communityLabel : mapping.communityId)}
                  </p>
                  <p className="font-mono text-[10px] text-primary">{mapping.communityId}</p>
                  <p
                    className={`mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${mapping.verified ? "text-emerald-400" : "text-amber-400"}`}
                  >
                    {mapping.verified
                      ? `Telegram destination verified${linkedTelegramLabel ? ` · ${linkedTelegramLabel}` : ""}`
                      : "Telegram destination pending"}
                  </p>
                  {mapping.communityId === activeCommunityId ? (
                    <span className="mt-2 inline-flex rounded-full bg-primary/15 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                      Selected
                    </span>
                  ) : null}
                </button>
              ))}
              {owner ? (
                <p className="px-2 text-right text-[10px] leading-relaxed text-muted-foreground">
                  Owner mode · each community keeps its own Telegram destination.
                </p>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="relative grid gap-px bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.article
              key={step.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.45 }}
              transition={{ delay: index * 0.1, duration: 0.45 }}
              className="group relative grid grid-cols-[auto_1fr] gap-x-3 bg-card/90 p-4"
            >
              <motion.span
                className="row-span-3 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"
                whileHover={{ rotate: 7, scale: 1.08 }}
              >
                <Icon className="h-4.5 w-4.5" />
              </motion.span>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">
                0{index + 1}
              </p>
              <h3 className="mt-0.5 text-xs font-semibold">{step.title}</h3>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </motion.article>
          );
        })}
      </div>

      <div className="relative border-t border-border/60 px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Community destinations
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Telegram is available now. Every other destination is a disabled roadmap preview.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
            <PlugZap className="h-3.5 w-3.5" /> Telegram · available now
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1.8fr_repeat(4,minmax(0,.7fr))]">
          {COMMUNITY_DESTINATION_ADAPTERS.map((adapter) => {
            const isLive = adapter.state === "live";
            const isReady = adapter.state === "adapter_ready";
            const isPlanned = !isLive;
            return (
              <button
                type="button"
                key={adapter.id}
                aria-disabled={isPlanned}
                disabled={isPlanned}
                aria-expanded={adapter.id === "telegram" ? telegramPreviewOpen : undefined}
                onClick={() => {
                  if (adapter.id === "telegram") {
                    setTelegramPreviewOpen((open) => !open);
                  }
                }}
                className={`rounded-2xl border text-left transition ${
                  isLive
                    ? "col-span-2 border-emerald-400/25 bg-[radial-gradient(circle_at_100%_0%,rgba(52,211,153,.12),transparent_42%),rgba(0,0,0,.18)] p-5 hover:border-emerald-400/50 hover:bg-emerald-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 sm:col-span-4 lg:col-span-1"
                    : isReady
                      ? "min-h-28 cursor-pointer border-primary/40 bg-primary/5 p-3 hover:border-primary/70 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      : "min-h-28 cursor-not-allowed border-border/30 bg-background/20 p-3 opacity-45 grayscale"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{adapter.label}</span>
                  <span
                    className={isLive ? "text-emerald-400" : isReady ? "text-primary" : "text-muted-foreground"}
                  >
                    ●
                  </span>
                </div>
                {isLive ? (
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                    {destinationStateLabel(adapter.state)}
                  </p>
                ) : (
                  <span
                    className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
                      isReady
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {destinationStateLabel(adapter.state)}
                  </span>
                )}
                <p
                  className={`mt-3 leading-relaxed text-muted-foreground ${isLive ? "text-[11px]" : "line-clamp-2 text-[9px]"}`}
                >
                  {adapter.description}
                </p>
                <p
                  className={`mt-3 border-t border-border/50 pt-3 leading-relaxed ${
                    isLive
                      ? "text-[10px] text-muted-foreground"
                      : isReady
                        ? "text-[9px] font-semibold text-primary"
                        : "text-[9px] text-muted-foreground"
                  }`}
                >
                  {isLive
                    ? telegramPreviewOpen
                      ? "Hide interactive preview"
                      : "Select to preview the Telegram flow"
                    : isReady
                      ? "Connect your Discord server →"
                      : "Coming soon."}
                </p>
              </button>
            );
          })}
        </div>
        {telegramPreviewOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 grid gap-6 rounded-3xl border border-emerald-400/20 bg-[#050908] p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Telegram owner journey
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">
                See what Fenrir will show.
              </h3>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
                This preview mirrors the private bot conversation. Select a stage to inspect the
                account, group and mapping details before opening Telegram.
              </p>
              <div
                className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
                role="tablist"
                aria-label="Telegram setup preview"
              >
                {telegramPreviewSteps.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    role="tab"
                    aria-selected={telegramPreviewStep === index}
                    onClick={() => {
                      setTelegramPreviewStep(index);
                      setMiniAppClosed(false);
                    }}
                    className={`rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${telegramPreviewStep === index ? "border-emerald-400/45 bg-emerald-400/10 text-foreground" : "border-border/60 bg-background/40 text-muted-foreground hover:border-border"}`}
                  >
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.16em]">
                      0{index + 1}
                    </span>
                    <span className="mt-1 block text-xs font-semibold">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className="mx-auto w-full max-w-[292px] rounded-[2.7rem] border-[7px] border-[#272b2a] bg-black p-1.5 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.95)]"
              aria-label="Interactive iPhone Telegram preview"
            >
              <div className="relative min-h-[500px] overflow-hidden rounded-[2.1rem] bg-[#0e171c]">
                <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
                <div className="flex items-center justify-between px-6 pb-2 pt-3 text-[9px] font-semibold text-white/85">
                  <span>9:41</span>
                  <span>5G&nbsp;&nbsp;●</span>
                </div>
                <div className="flex items-center gap-3 border-b border-white/10 bg-[#17242b] px-4 py-3">
                  <span className="text-lg text-[#61a8de]">‹</span>
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#ff334e] to-[#611827] text-base">
                    🐺
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">MyFenrir Bot</p>
                    <p className="text-[9px] text-[#73b6e6]">bot · secure connection</p>
                  </div>
                  <span className="text-lg text-white/55">•••</span>
                </div>
                <div className="space-y-3 px-3 py-5">
                  <p className="text-center text-[9px] text-white/38">Today</p>
                  <div
                    className={`max-w-[88%] rounded-2xl rounded-tl-md p-3 text-[11px] leading-relaxed text-white/88 shadow-sm ${telegramPreviewStep === 3 ? "border border-emerald-400/25 bg-gradient-to-br from-emerald-400/15 to-[#18282f]" : "bg-[#18282f]"}`}
                  >
                    <p className="font-semibold text-white">
                      🐺 MyFenrir · {telegramPreviewSteps[telegramPreviewStep].title}
                    </p>
                    <p className="mt-2">{telegramPreviewSteps[telegramPreviewStep].message}</p>
                    <p className="mt-2 text-[10px] text-white/55">
                      {telegramPreviewSteps[telegramPreviewStep].detail}
                    </p>
                    {telegramPreviewStep === 0 ? (
                      <p className="mt-2 font-mono text-[9px] text-emerald-300">
                        {linkedTelegramLabel ?? "Frisky Dev identity · verified"}
                      </p>
                    ) : null}
                    {telegramPreviewStep === 2 ? (
                      <p
                        className={`mt-2 font-semibold ${mappingVerified ? "text-emerald-300" : "text-amber-300"}`}
                      >
                        {mappingVerified ? "✓ Destination verified" : "○ Mapping pending"}
                      </p>
                    ) : null}
                    {telegramPreviewStep === 3 ? (
                      <div className="mt-3 rounded-xl border border-emerald-400/20 bg-black/20 p-3">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-400/15 text-base text-emerald-300">
                          ✓
                        </span>
                        <p className="mt-3 font-semibold text-emerald-200">ACCESS CONFIRMED</p>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[.12em] text-white/45">
                          Identity · rules · membership · destination
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {miniAppClosed ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-3 text-center"
                    >
                      <p className="text-[10px] font-semibold text-emerald-200">
                        Mini App closed safely
                      </p>
                      <p className="mt-1 text-[9px] text-white/48">
                        Return to Telegram to use your private access.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        telegramPreviewStep === 3
                          ? confirmMiniAppClose()
                          : setTelegramPreviewStep((step) =>
                              Math.min(step + 1, telegramPreviewSteps.length - 1),
                            )
                      }
                      className={`w-full rounded-xl px-3 py-2.5 text-[10px] font-semibold text-white transition ${telegramPreviewStep === 3 ? "bg-emerald-600 hover:bg-emerald-500" : "bg-[#246b94] hover:bg-[#2d7ca9]"}`}
                    >
                      {telegramPreviewStep === 0
                        ? "Continue to group setup"
                        : telegramPreviewStep === 1
                          ? "Show mapping command"
                          : telegramPreviewStep === 2
                            ? "Confirm access"
                            : "Close Mini App"}
                    </button>
                  )}
                </div>
                <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full border border-white/10 bg-[#17242b] px-4 py-2.5 text-[10px] text-white/38">
                  Message <span className="ml-auto text-[#61a8de]">➤</span>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </div>

      <div className="relative grid gap-4 border-t border-border/60 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div className="space-y-2 font-mono text-[11px]">
          <p>
            <span className="text-primary">protected group $</span> /setmain@Myfenrir_bot{" "}
            {activeCommunityId}
          </p>
          <p>
            <span className="text-primary">virtual waiting room $</span> private chat with
            @Myfenrir_bot
          </p>
          <p>
            <span className="text-primary">private chat $</span> /readiness
          </p>
          <div className="flex flex-col items-start gap-2 pt-1 sm:flex-row sm:flex-wrap">
            <a
                key={`waiting-room-${activeCommunityId}`}
                className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-primary transition hover:bg-primary/20"
                href={`https://t.me/Myfenrir_bot?start=${activeCommunityId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open {activeCommunityLabel}
              </a>
            {owner && visibleMappings.length > 1 ? (
              <a
                className="inline-flex rounded-full border border-primary/30 px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                href="https://t.me/Myfenrir_bot"
                target="_blank"
                rel="noreferrer"
              >
                Choose in bot
              </a>
            ) : null}
            <a
              className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300 transition hover:bg-emerald-400/20"
              href="https://t.me/Myfenrir_bot"
              target="_blank"
              rel="noreferrer"
            >
              Open @Myfenrir_bot for /readiness
            </a>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/55 px-5 py-3 text-sm">
          {limit > 0 ? (
            <>
              <span className="font-semibold">
                {used} / {limit}
              </span>{" "}
              Gates · {owner ? "owner multi-community" : "Standard Pack · 1 community"}
            </>
          ) : (
            <>
              <span className="font-semibold">{used} existing Gates</span> · Pack required
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
