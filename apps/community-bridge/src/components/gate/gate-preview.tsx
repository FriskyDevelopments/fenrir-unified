import { Crown, Flame, Ghost, PawPrint, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPreset,
  isUsableMediaUrl,
  isVideoUrl,
  type GateConfig,
  type MascotKey,
} from "@/lib/gate-presets";

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

export function GatePreview({
  config,
  className,
  compact = false,
}: {
  config: Omit<GateConfig, "slug"> & { slug?: string };
  className?: string;
  compact?: boolean;
}) {
  const preset = getPreset(config.preset);
  const logo =
    config.logo_url && isUsableMediaUrl(config.logo_url) ? config.logo_url : preset.logoUrl;
  const mascotUrl =
    config.mascot_url && isUsableMediaUrl(config.mascot_url) ? config.mascot_url : null;
  const background =
    config.background_url && isUsableMediaUrl(config.background_url)
      ? config.background_url
      : null;

  return (
    <div
      className={cn(
        "relative isolate flex w-full flex-col items-center justify-center overflow-hidden text-center",
        compact ? "min-h-[380px] rounded-2xl px-6 py-10" : "min-h-dvh px-6 py-14",
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
          {/* automatic dark overlay so text stays readable on any image */}
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
            className={cn("w-full object-contain", compact ? "max-w-[150px]" : "max-w-[220px]")}
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
            className={cn("w-full object-contain", compact ? "max-w-[150px]" : "max-w-[220px]")}
            decoding="async"
          />
        )}

        {mascotUrl ? (
          isVideoUrl(mascotUrl) ? (
            <video
              src={mascotUrl}
              aria-hidden="true"
              className={cn("object-contain", compact ? "h-20" : "h-32")}
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
              className={cn("object-contain", compact ? "h-20" : "h-32")}
              loading="lazy"
              decoding="async"
            />
          )
        ) : (
          <MascotArt mascot={preset.mascot} accent={preset.accent} />
        )}

        <div className="space-y-2">
          {compact ? (
            <p className="font-semibold tracking-tight text-white text-xl">
              {config.headline}
            </p>
          ) : (
            <h1 className="font-semibold tracking-tight text-white text-3xl">
              {config.headline}
            </h1>
          )}

          <p
            className={cn(
              "text-white/70",
              compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
            )}
          >
            {config.subheadline}
          </p>
        </div>

        <a
          href={`/login?brand=${encodeURIComponent(preset.brandId)}`}
          className={cn(
            "flex w-full items-center justify-center rounded-xl font-medium text-white transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
            compact ? "h-9 text-xs" : "h-11 text-sm",
          )}
          style={{
            background: `color-mix(in oklab, ${preset.accent} 85%, black)`,
            boxShadow: `0 0 40px -10px ${preset.accent}`,
          }}
        >
          Continue with single sign-on
        </a>

        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/40">
          Secured · End-to-end encrypted
        </p>
      </div>
    </div>
  );
}
