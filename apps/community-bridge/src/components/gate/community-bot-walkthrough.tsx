import { AnimatePresence, motion } from "motion/react";
import { Bot, CheckCircle2, MapPinned, PlugZap, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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
    body: "Free gives you five Gates to build with. The Pack lets you link a Gate to a live community, billed per linked community.",
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
    label: "Link ID",
    title: "Link your FriskyDev ID",
    message: "Connect this Telegram account to your FriskyDev identity.",
    detail: "The secure link is single-use and confirms which Telegram account belongs to you.",
  },
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
    message: "Run /connect@Myfenrir_bot in the protected group.",
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

const telegramStepLinks = [
  "https://www.myfenrir.com/api/telegram/link/start",
  "https://t.me/Myfenrir_bot?start=account",
  "https://t.me/Myfenrir_bot?startgroup=discover",
  "https://t.me/Myfenrir_bot?start=mapping",
  "https://t.me/Myfenrir_bot?start=readiness",
] as const;

const telegramLaunchLabels = [
  "Link FriskyDev ID",
  "Open MyFenrir Bot",
  "Link a Telegram group",
  "Open mapping in Telegram",
  "Open readiness in Telegram",
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
  const telegramLinked = Boolean(linkedTelegram?.id);
  const stepComplete = [
    telegramLinked,
    telegramLinked,
    mappingVerified,
    mappingVerified,
    telegramLinked && mappingVerified,
  ];

  useEffect(() => {
    if (!telegramPreviewOpen) return;
    const firstPending = stepComplete.findIndex((complete) => !complete);
    setTelegramPreviewStep(firstPending === -1 ? 3 : firstPending);
  }, [telegramPreviewOpen, telegramLinked, mappingVerified]);

  function selectTelegramPreviewStep(index: number) {
    setTelegramPreviewStep(index);
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
                      (mapping.communityId === communityId || mapping.communityId === "myfenrir-core"
                        ? communityLabel
                        : mapping.communityId)}
                  </p>
                  {mapping.communityId !== "myfenrir-core" ? (
                    <p className="font-mono text-[10px] text-primary">{mapping.communityId}</p>
                  ) : null}
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
                Continue the real Telegram setup.
              </h3>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
                Choose the next step, then open the actual MyFenrir bot. Completion status comes
                from your linked identity and verified destination — never from a mock screen.
              </p>
            </div>

            <div className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 shadow-[0_20px_60px_-32px_rgba(0,0,0,.8)]">
              <div className="grid grid-cols-5 gap-1" role="tablist" aria-label="Telegram setup steps">
                  {telegramPreviewSteps.map((item, index) => (
                    <button
                      key={item.label}
                      type="button"
                      role="tab"
                      aria-selected={telegramPreviewStep === index}
                      onClick={() => selectTelegramPreviewStep(index)}
                      className={`group relative overflow-hidden rounded-lg border px-1 py-2 text-center transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${telegramPreviewStep === index ? "border-primary/70 bg-primary/15 text-foreground shadow-[0_0_18px_hsl(var(--primary)/.2)]" : "border-border/60 bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                    >
                      {telegramPreviewStep === index ? <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-primary/10 to-transparent" /> : null}
                      <span className="relative block text-[6px] font-black uppercase tracking-[0.12em] text-primary">Step {index + 1}</span>
                      <span className="relative mt-0.5 block text-[7px] font-bold uppercase tracking-[0.08em]">{item.label}</span>
                      <span className={`relative mt-1 block text-[6px] font-black uppercase tracking-[0.1em] ${stepComplete[index] ? "text-emerald-400" : telegramPreviewStep === index ? "animate-bounce text-foreground" : "text-amber-400"}`}>
                        {stepComplete[index]
                          ? "✓ Complete"
                          : telegramPreviewStep === index
                            ? "○ Pending · Selected"
                            : "○ Pending · Tap"}
                      </span>
                    </button>
                  ))}
                </div>
              <div className="space-y-3 pt-4">
                  <AnimatePresence mode="wait">
                  <motion.div
                    key={telegramPreviewStep}
                    initial={{ opacity: 0, scale: 0.86, y: 14 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 1.08, filter: "blur(7px)" }}
                    transition={{ type: "spring", stiffness: 340, damping: 24 }}
                    className={`rounded-2xl p-4 text-[11px] leading-relaxed text-foreground shadow-sm ${telegramPreviewStep === 4 ? "border border-emerald-400/25 bg-emerald-400/10" : "border border-border/60 bg-card/70"}`}
                  >
                    <p className="font-semibold">MyFenrir Bot · Step {telegramPreviewStep + 1} of 5</p>
                    <p className="mt-1 font-semibold text-primary">{telegramPreviewSteps[telegramPreviewStep].title}</p>
                    <p className="mt-2">{telegramPreviewSteps[telegramPreviewStep].message}</p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                      {telegramPreviewSteps[telegramPreviewStep].detail}
                    </p>
                    {telegramPreviewStep === 1 ? (
                      <p className="mt-2 font-mono text-[9px] text-emerald-300">
                        {linkedTelegramLabel ?? "Frisky Dev identity · verified"}
                      </p>
                    ) : null}
                    {telegramPreviewStep === 3 ? (
                      <p
                        className={`mt-2 font-semibold ${mappingVerified ? "text-emerald-300" : "text-amber-300"}`}
                      >
                        {mappingVerified ? "✓ Destination verified" : "○ Mapping pending"}
                      </p>
                    ) : null}
                    {telegramPreviewStep === 4 ? (
                      <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-400/15 text-base text-emerald-300">
                          ✓
                        </span>
                        <p className="mt-3 font-semibold text-emerald-200">ACCESS CONFIRMED</p>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">
                          Identity · rules · membership · destination
                        </p>
                      </div>
                    ) : null}
                  </motion.div>
                  </AnimatePresence>
                  <a
                    href={telegramStepLinks[telegramPreviewStep]}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-center text-[10px] font-semibold text-primary transition hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {telegramLaunchLabels[telegramPreviewStep]} ↗
                  </a>
                </div>
              </div>
          </motion.div>
        ) : null}
      </div>

    </Card>
  );
}
