import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  DoorOpen,
  EyeOff,
  Flame,
  Ghost,
  Hand,
  Heart,
  Lock,
  PawPrint,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { cn } from "@/lib/utils";
import { GateShare } from "@/components/gate/gate-share";
import { UiverseSweep } from "@/components/ui/uiverse-motion";
import { getBrand } from "@/config/brands";
import {
  getPreset,
  isUsableMediaUrl,
  isVideoUrl,
  DEFAULT_GATE_DISCLAIMER,
  DEFAULT_GATE_RULES,
  type GateConfig,
  type MascotKey,
} from "@/lib/gate-presets";
import type { GateRuleKey } from "@/lib/gate-member-acceptance";

export interface GateMemberAcceptanceState {
  authenticated: true;
  accepted: boolean;
  rulesUpdated: boolean;
  changedRuleKeys: GateRuleKey[];
  accepting: boolean;
  error?: string | null;
  onAccept: () => void;
}

function singleSignOnHref(slug?: string, brandId?: string) {
  // Keep this first-party until the browser knows its real public origin.
  // SSR previews otherwise serialize localhost:5173 into `next`, making the
  // identity provider bounce to a dead endpoint instead of this Gate. The slug
  // is bound explicitly so the Authentik state can restore this exact Gate
  // after sign-in (never a fabricated "sso=complete" marker).
  const params = new URLSearchParams();
  if (slug) {
    params.set("next", `/g/${encodeURIComponent(slug)}`);
    params.set("slug", slug);
  } else {
    params.set("next", "/");
  }
  if (brandId) params.set("brand", brandId);
  return `/verify?${params.toString()}`;
}

const MASCOT_ICONS = {
  ghost: Ghost,
  wolf: PawPrint,
  shield: ShieldCheck,
  flame: Flame,
  sparkle: Sparkles,
  wave: Waves,
  crown: Crown,
} as const;

function MascotArt({ mascot, accent }: { mascot: MascotKey; accent: string }) {
  const Icon = MASCOT_ICONS[mascot] ?? ShieldCheck;
  return (
    <div
      className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15"
      style={{
        background: `color-mix(in oklab, ${accent} 14%, transparent)`,
        boxShadow: `0 0 40px -8px ${accent}`,
      }}
    >
      <Icon className="h-8 w-8" style={{ color: accent }} strokeWidth={1.5} />
    </div>
  );
}

/**
 * Entry-choreography wrapper: content rises in with a soft fade. `MotionConfig`
 * (see GatePreview) reduces this to a stationary fade for users who prefer
 * reduced motion, so there is always a calm static equivalent.
 */
function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A single blurred accent glow that drifts very slowly for layered depth.
 * There is no looping spinner or "busy" animation here — just restrained ambient
 * drift, and MotionConfig freezes it entirely under reduced motion.
 */
function AmbientAura({
  accent,
  className,
  duration,
  drift,
}: {
  accent: string;
  className?: string;
  duration: number;
  drift: { x: number; y: number; scale: number }[];
}) {
  const style: CSSProperties = {
    background: `radial-gradient(circle at 50% 50%, color-mix(in oklab, ${accent} 26%, transparent), transparent 68%)`,
  };
  return (
    <motion.div
      aria-hidden="true"
      className={cn("absolute rounded-full", className)}
      style={style}
      animate={{
        x: drift.map((d) => d.x),
        y: drift.map((d) => d.y),
        scale: drift.map((d) => d.scale),
      }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/**
 * A Gate threshold, not a legal accordion. Every rule is its own clear moment;
 * the public data remains host-editable through disclaimer/rules. Persistence of
 * acceptance intentionally happens after an authenticated Community session.
 */
function GatePolicyPanels({
  disclaimer,
  rules,
  accent,
  visibleRuleKeys,
  onReviewed,
  onAccept,
  accepting = false,
}: {
  disclaimer: string;
  rules: string;
  accent: string;
  visibleRuleKeys?: GateRuleKey[];
  onReviewed?: () => void;
  onAccept?: () => void;
  accepting?: boolean;
}) {
  const [step, setStep] = useState(0);
  const allScreens: Array<{ key: GateRuleKey; icon: typeof DoorOpen; eyebrow: string; title: string; body: string }> = [
    {
      key: "arrival",
      icon: DoorOpen,
      eyebrow: "Threshold 01",
      title: "Enter with intent",
      body: disclaimer,
    },
    {
      key: "safety",
      icon: ShieldCheck,
      eyebrow: "Threshold 02",
      title: "Zero tolerance means zero exceptions",
      body: "No sexual content involving minors. No sexual content involving animals. No exceptions, loopholes, or private-channel workarounds.",
    },
    {
      key: "respect",
      icon: Heart,
      eyebrow: "Threshold 03",
      title: "Treat people as people",
      body: "No harassment, threats, targeting, or behavior that makes another member unsafe.",
    },
    {
      key: "privacy",
      icon: EyeOff,
      eyebrow: "Threshold 04",
      title: "Keep the room in the room",
      body: "Do not record, repost, or identify another member without the host's explicit permission.",
    },
    {
      key: "participation",
      icon: Hand,
      eyebrow: "Threshold 05",
      title: "Make space for every voice",
      body: "Follow the host's format and use the queue when the room is live.",
    },
    {
      key: "ready",
      icon: Check,
      eyebrow: "Threshold 06",
      title: "You are ready to enter",
      body: rules,
    },
  ];
  const screens = visibleRuleKeys
    ? allScreens.filter((screen) => visibleRuleKeys.includes(screen.key))
    : allScreens;
  const current = screens[step]!;
  const Icon = current.icon;
  const atLast = step === screens.length - 1;

  return (
    <section
      aria-label="Gate rules"
      className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/30 px-5 py-5 text-left shadow-2xl backdrop-blur-xl"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 20%, transparent), 0 20px 70px -42px ${accent}` }}
    >
      <motion.div
        aria-hidden="true"
        className="absolute -right-12 -top-16 h-44 w-44 rounded-full blur-3xl"
        style={{ background: accent, opacity: 0.16 }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.12, 0.2, 0.12] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex items-center justify-between gap-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/55">
          Before you enter
        </p>
        <div className="flex gap-1.5" aria-label={`${step + 1} of ${screens.length} rules`}>
          {screens.map((screen, index) => (
            <motion.span
              key={screen.title}
              layout
              className="h-1.5 rounded-full"
              animate={{ width: index === step ? 28 : 7, opacity: index <= step ? 1 : 0.35 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              style={{ backgroundColor: index <= step ? accent : "white" }}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.title}
          initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -12, filter: "blur(5px)" }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative pt-6"
        >
          <motion.div
            layoutId="gate-rule-icon"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/25"
            style={{ boxShadow: `0 0 32px -8px ${accent}` }}
          >
            <Icon className="h-5 w-5" style={{ color: accent }} aria-hidden="true" />
          </motion.div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: accent }}>
            {current.eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{current.title}</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/70">{current.body}</p>
        </motion.div>
      </AnimatePresence>

      <div className="relative mt-6 flex items-center justify-between gap-3">
        <motion.button
          type="button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
          whileHover={step === 0 ? undefined : { x: -3 }}
          whileTap={step === 0 ? undefined : { scale: 0.96 }}
          className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
        </motion.button>
        <motion.button
          type="button"
          onClick={() => {
            if (atLast) {
              if (onAccept) onAccept();
              else onReviewed?.();
              return;
            }
            setStep((value) => Math.min(screens.length - 1, value + 1));
          }}
          disabled={accepting}
          whileHover={{ scale: 1.025, boxShadow: `0 0 42px -5px ${accent}` }}
          whileTap={{ scale: 0.96 }}
          className="inline-flex h-10 items-center gap-1 rounded-xl px-4 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-65"
          style={{ background: accent, boxShadow: `0 0 28px -8px ${accent}` }}
        >
          {atLast ? (onAccept ? (accepting ? "Recording…" : "Accept rules") : "Continue to sign in") : "Continue"}
          {!atLast ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
        </motion.button>
      </div>
    </section>
  );
}

export function GatePreview({
  config,
  className,
  compact = false,
  memberAcceptance,
}: {
  config: Omit<GateConfig, "slug"> & { id?: string; slug?: string };
  className?: string;
  compact?: boolean;
  memberAcceptance?: GateMemberAcceptanceState;
}) {
  const [rulesReviewed, setRulesReviewed] = useState(false);
  const preset = getPreset(config.preset);
  const brand = getBrand(config.brand_id ?? preset.brandId);
  const accent = preset.accent;
  const disclaimer = config.disclaimer_text.trim() || DEFAULT_GATE_DISCLAIMER;
  const rules = config.rules_text.trim() || DEFAULT_GATE_RULES;
  const logo =
    config.logo_url && isUsableMediaUrl(config.logo_url) ? config.logo_url : preset.logoUrl;
  const mascotUrl =
    config.mascot_url && isUsableMediaUrl(config.mascot_url) ? config.mascot_url : null;
  const background =
    config.background_url && isUsableMediaUrl(config.background_url)
      ? config.background_url
      : null;
  const signInHref = singleSignOnHref(config.slug, config.brand_id ?? preset.brandId);

  return (
    <MotionConfig reducedMotion="user">
      {compact ? (
        <div
          className={cn(
            "relative isolate flex min-h-[380px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl px-6 py-10 text-center",
            className,
          )}
          style={{ background: preset.atmosphere }}
        >
          {background ? (
            <>
              {isVideoUrl(background) ? (
                <video
                  src={background}
                  aria-hidden="true"
                  className="absolute inset-0 -z-20 h-full w-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={background}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 -z-20 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10"
                style={{ background: preset.overlay }}
              />
            </>
          ) : null}

          <div className="relative flex w-full max-w-sm flex-col items-center gap-6">
            {isVideoUrl(logo) ? (
              <video
                src={logo}
                aria-hidden="true"
                className="max-w-[150px] object-contain"
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={logo}
                alt="Gate logo"
                className="max-w-[150px] object-contain"
                decoding="async"
              />
            )}

            {mascotUrl ? (
              isVideoUrl(mascotUrl) ? (
                <video
                  src={mascotUrl}
                  aria-hidden="true"
                  className="h-20 object-contain"
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={mascotUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-20 object-contain"
                  loading="lazy"
                  decoding="async"
                />
              )
            ) : (
              <MascotArt mascot={preset.mascot} accent={accent} />
            )}

            <p className="font-semibold tracking-tight text-xl text-white">{config.headline}</p>
            <p className="text-xs leading-relaxed text-white/70">{config.subheadline}</p>

            <div className="max-w-sm rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-left text-xs leading-relaxed text-white/75 backdrop-blur-sm">
              <p className="font-semibold uppercase tracking-[0.16em] text-white/90">Before you enter</p>
              <p className="mt-1.5">{disclaimer}</p>
            </div>
            <details className="w-full max-w-sm rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-left text-xs leading-relaxed text-white/70 backdrop-blur-sm">
              <summary className="cursor-pointer list-none font-semibold uppercase tracking-[0.16em] text-white/90">Community rules</summary>
              <p className="mt-2 whitespace-pre-line">{rules}</p>
            </details>

            <a
              href={signInHref}
              className="flex h-9 w-full items-center justify-center rounded-xl text-xs font-medium text-white transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none motion-reduce:transform-none"
              style={{
                background: `color-mix(in oklab, ${accent} 85%, black)`,
                boxShadow: `0 0 40px -10px ${accent}`,
              }}
            >
              Continue with Community sign-in
            </a>

            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
              Secured · End-to-end encrypted
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn("relative isolate flex min-h-dvh w-full flex-col overflow-hidden", className)}
          style={{ background: preset.atmosphere }}
        >
          {/* Layered background media */}
          {background ? (
            <>
              {isVideoUrl(background) ? (
                <video
                  src={background}
                  aria-hidden="true"
                  className="absolute inset-0 -z-30 h-full w-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={background}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 -z-30 h-full w-full object-cover"
                  decoding="async"
                />
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-20"
                style={{ background: preset.overlay }}
              />
            </>
          ) : null}

          {/* Ambient accent drift for layered depth */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <AmbientAura
              accent={accent}
              className="left-[-12%] top-[-14%] h-[46vmax] w-[46vmax]"
              duration={34}
              drift={[
                { x: 0, y: 0, scale: 1 },
                { x: 70, y: 36, scale: 1.14 },
                { x: -18, y: -12, scale: 0.97 },
                { x: 0, y: 0, scale: 1 },
              ]}
            />
            <AmbientAura
              accent={accent}
              className="bottom-[-20%] right-[-14%] h-[40vmax] w-[40vmax]"
              duration={44}
              drift={[
                { x: 0, y: 0, scale: 1 },
                { x: -60, y: -30, scale: 1.1 },
                { x: 24, y: 14, scale: 0.96 },
                { x: 0, y: 0, scale: 1 },
              ]}
            />
          </div>

          {/* Cinematic vignette + grain */}
          <div aria-hidden="true" className="gate-vignette pointer-events-none absolute inset-0 z-[1]" />
          <div aria-hidden="true" className="gate-grain pointer-events-none absolute inset-0 z-[2]" />

          {/* Persistent escape route back to the public Community Gates home */}
          <Link
            to="/"
            className="group absolute left-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/65 backdrop-blur transition hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 motion-reduce:transition-none"
          >
            <ArrowLeft
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
            Community Gates
          </Link>

          {/* Content column */}
          <div className="relative z-20 flex w-full flex-1 items-center justify-center px-5 py-20 sm:px-8">
            <div className="flex w-full max-w-md flex-col items-center text-center">
              <Reveal>
                {mascotUrl ? (
                  isVideoUrl(mascotUrl) ? (
                    <video
                      src={mascotUrl}
                      aria-hidden="true"
                      className="h-20 object-contain"
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={mascotUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-20 object-contain"
                      decoding="async"
                    />
                  )
                ) : (
                  <MascotArt mascot={preset.mascot} accent={accent} />
                )}
              </Reveal>

              <Reveal delay={0.06}>
                {isVideoUrl(logo) ? (
                  <video
                    src={logo}
                    aria-hidden="true"
                    className="mt-5 max-h-12 w-auto max-w-[220px] object-contain"
                    muted
                    loop
                    autoPlay
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={logo}
                    alt="Gate logo"
                    className="mt-5 max-h-12 w-auto max-w-[220px] object-contain"
                    decoding="async"
                  />
                )}
              </Reveal>

              <Reveal delay={0.12}>
                <p
                  className="mt-7 text-[11px] font-semibold uppercase tracking-[0.3em]"
                  style={{ color: accent }}
                >
                  {brand.name} · Private community
                </p>
                <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {config.headline}
                </h1>
                <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
                  {config.subheadline}
                </p>
              </Reveal>

              {memberAcceptance?.accepted ? (
                <Reveal delay={0.18} className="mt-8 w-full">
                  <div role="status" className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-5 text-left text-white">
                    <p className="text-sm font-semibold">Access confirmed.</p>
                    <p className="mt-1 text-sm text-white/70">You may close this screen after opening the community.</p>
                  </div>
                </Reveal>
              ) : (
                <Reveal delay={0.18} className="mt-8 w-full">
                  {memberAcceptance?.rulesUpdated ? (
                    <p className="mb-3 rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-left text-sm text-white/75">
                      The host updated this Gate's rules. Review only what changed, then confirm the new version.
                    </p>
                  ) : null}
                  <GatePolicyPanels
                    disclaimer={disclaimer}
                    rules={rules}
                    accent={accent}
                    visibleRuleKeys={memberAcceptance?.changedRuleKeys}
                    onReviewed={() => setRulesReviewed(true)}
                    onAccept={memberAcceptance?.onAccept}
                    accepting={memberAcceptance?.accepting}
                  />
                  {memberAcceptance?.error ? <p role="alert" className="mt-3 text-sm text-red-200">{memberAcceptance.error}</p> : null}
                </Reveal>
              )}

              {!memberAcceptance && rulesReviewed ? <Reveal delay={0.24} className="mt-7 w-full">
                <motion.a
                  href={signInHref}
                  whileHover={{ y: -2, scale: 1.012 }}
                  whileTap={{ scale: 0.982 }}
                  className="group relative flex h-13 w-full items-center justify-center overflow-hidden rounded-xl border border-white/20 px-5 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  style={{
                    background: `color-mix(in oklab, ${accent} 85%, black)`,
                    boxShadow: `0 0 44px -12px ${accent}, 0 12px 32px -20px black`,
                  }}
                >
                  <UiverseSweep className="left-[-35%]" />
                  <span className="relative flex items-center gap-2">
                    <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" aria-hidden="true" />
                    Continue with Community sign-in
                    <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </motion.a>
                <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
                  Secured · End-to-end encrypted
                </p>
              </Reveal> : null}

              {config.slug ? (
                <Reveal delay={0.3} className="mt-6 w-full">
                  <div className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 backdrop-blur-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
                      Share this gate
                    </p>
                    <GateShare
                      slug={config.slug}
                      title={config.headline}
                      accent={accent}
                      atmosphere={preset.atmosphere}
                      className="mt-3"
                    />
                  </div>
                </Reveal>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </MotionConfig>
  );
}
