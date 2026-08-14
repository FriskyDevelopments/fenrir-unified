import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { BrandBadge, BrandMark, BrandWordmark } from "@/components/brand/brand-logo";
import { TerminalTyper } from "./terminal-typer";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { BrandSyncStatus } from "@/components/brand/brand-sync-status";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { getPreset } from "@/lib/gate-presets";
import { motion, MotionConfig } from "motion/react";


export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { isStaff } = useAuth();
  const brand = useBrand();
  // Sign-in is aligned to the gate: same atmosphere, accent glow and centred
  // column as the public gate this brand's visitors arrive from.
  const preset = getPreset(brand.gatePreset);
  const previewing =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("brand");

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-14"
      style={{ background: preset.atmosphere }}
    >
      {/* Gate-matched atmosphere: accent glow + faint grid, never a flat fill */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          className="absolute -top-[10%] left-1/2 h-[55%] w-[70%] -translate-x-1/2 rounded-full blur-[140px]"
          style={{ background: `color-mix(in oklab, ${preset.accent} 16%, transparent)` }}
          animate={{ x: ["-50%", "-44%", "-52%"], y: [0, 24, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[15%] right-[-10%] h-[50%] w-[55%] rounded-full blur-[140px]"
          style={{ background: `color-mix(in oklab, ${preset.accent} 10%, transparent)` }}
          animate={{ x: [0, -32, 0], y: [0, -18, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 60% 50% at 50% 45%, #000 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 text-center [&>*]:w-full">

        <div className="flex flex-col items-center gap-2">
          <BrandSwitcher />
          {isStaff || previewing ? <BrandSyncStatus /> : null}
        </div>
        {/* Terminal */}
        <motion.div
          className="group relative"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div
            aria-hidden="true"
            className="absolute -inset-px rounded-2xl opacity-40 blur-md transition duration-700 group-hover:opacity-70"
            style={{ background: "var(--gradient-nexus)" }}
          />
          <div className="relative">
            <TerminalTyper />
          </div>
        </motion.div>

        {/* Auth card */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 20, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
        >
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
                <div className="relative mb-3 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-ring/30 bg-card/70 shadow-glow">
                  <BrandMark className="h-full w-full" />
                </div>

                <BrandWordmark className="mb-4 max-w-[168px]" />


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
        </motion.div>

        {footer ? (
          <div className="text-center text-xs text-muted-foreground">{footer}</div>
        ) : null}

        <div className="pt-1 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
            Secured · End-to-end encrypted
          </p>
          <div className="mt-3 flex justify-center">
            <BrandBadge />
          </div>
        </div>
      </div>
    </div>
    </MotionConfig>
  );
}
