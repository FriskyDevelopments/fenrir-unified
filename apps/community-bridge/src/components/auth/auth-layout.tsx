import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { BrandBadge, BrandMark, BrandWordmark } from "@/components/brand/brand-logo";
import { TerminalTyper } from "./terminal-typer";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { BrandSyncStatus } from "@/components/brand/brand-sync-status";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { getPreset, isUsableMediaUrl, isVideoUrl } from "@/lib/gate-presets";
import type { ProviderId } from "@/config/brands";
import type { PublicGateConfig } from "@/lib/gate.functions";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  providers,
  gate,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  providers?: ProviderId[] | null;
  gate?: PublicGateConfig | null;
}) {
  const { isStaff } = useAuth();
  const brand = useBrand();
  // Sign-in is aligned to the gate: same atmosphere, accent glow and centred
  // column as the public gate this brand's visitors arrive from.
  const preset = getPreset(gate?.preset ?? brand.gatePreset);
  const gateIdentityMedia =
    gate?.logo_url && isUsableMediaUrl(gate.logo_url)
      ? gate.logo_url
      : gate?.mascot_url && isUsableMediaUrl(gate.mascot_url)
        ? gate.mascot_url
        : null;
  const gateBackground =
    gate?.background_url && isUsableMediaUrl(gate.background_url) ? gate.background_url : null;
  const previewing =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("brand");

  return (
    <div
      className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-14"
      style={{ background: preset.atmosphere }}
    >
      {gateBackground ? (
        <>
          {isVideoUrl(gateBackground) ? (
            <video
              src={gateBackground}
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
              src={gateBackground}
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
      {/* Gate-matched atmosphere: accent glow + faint grid, never a flat fill */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -top-[10%] left-1/2 h-[55%] w-[70%] -translate-x-1/2 rounded-full blur-[140px]"
          style={{ background: `color-mix(in oklab, ${preset.accent} 16%, transparent)` }}
        />
        <div
          className="absolute -bottom-[15%] right-[-10%] h-[50%] w-[55%] rounded-full blur-[140px]"
          style={{ background: `color-mix(in oklab, ${preset.accent} 10%, transparent)` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 60% 50% at 50% 45%, #000 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 text-center [&>*]:w-full">
        <div className="flex flex-col items-center gap-2">
          {gate ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/55">
              Community sign-in
            </span>
          ) : (
            <BrandSwitcher />
          )}
          {!gate && (isStaff || previewing) ? <BrandSyncStatus /> : null}
        </div>
        {/* Terminal */}
        <div className="group relative">
          <div
            aria-hidden="true"
            className="absolute -inset-px rounded-2xl opacity-40 blur-md transition duration-700 group-hover:opacity-70"
            style={{ background: "var(--gradient-nexus)" }}
          />
          <div className="relative">
            <TerminalTyper providers={providers} />
          </div>
        </div>

        {/* Auth card */}
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-8 rounded-[2.25rem] opacity-30 blur-3xl"
            style={{ background: "var(--gradient-cosmic)" }}
          />
          <div
            aria-hidden="true"
            className="absolute -inset-[1px] rounded-3xl opacity-70"
            style={{ background: "var(--gradient-cosmic)" }}
          />

          <Card variant="glow" className="relative overflow-hidden rounded-3xl bg-card p-7 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
            />

            <div className="relative">
              <div className="mb-6 flex flex-col items-center text-center">
                {gate ? (
                  gateIdentityMedia ? (
                    isVideoUrl(gateIdentityMedia) ? (
                      <video
                        src={gateIdentityMedia}
                        aria-hidden="true"
                        className="mb-4 max-h-24 max-w-[180px] object-contain"
                        muted
                        loop
                        autoPlay
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={gateIdentityMedia}
                        alt={`${gate.community_label} community mark`}
                        className="mb-4 max-h-24 max-w-[180px] object-contain"
                        decoding="async"
                      />
                    )
                  ) : (
                    <span className="mb-4 text-xl font-semibold uppercase tracking-[0.16em] text-foreground">
                      {gate.community_label}
                    </span>
                  )
                ) : (
                  <>
                    <div className="relative mb-3 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-ring/30 bg-card/70 shadow-glow">
                      <BrandMark className="h-full w-full" />
                    </div>
                    <BrandWordmark className="mb-4 max-w-[168px]" />
                  </>
                )}

                <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>

              {children}
            </div>
          </Card>
        </div>

        {footer ? <div className="text-center text-xs text-muted-foreground">{footer}</div> : null}

        <div className="pt-1 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
            Secured · private access only
          </p>
          <div className="mt-3 flex justify-center">
            <BrandBadge />
          </div>
        </div>
      </div>
    </div>
  );
}
