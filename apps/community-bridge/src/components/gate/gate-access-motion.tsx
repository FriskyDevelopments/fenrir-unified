import { FileCheck2, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

const ACCESS_STEPS = [
  { icon: Fingerprint, label: "Verify identity" },
  { icon: FileCheck2, label: "Accept the rules" },
  { icon: KeyRound, label: "Unlock a private invite" },
] as const;

export function GateAccessMotion({
  accent,
  compact = false,
}: {
  accent: string;
  compact?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  if (compact) {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
        <ShieldCheck className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden="true" />
        Community Gate is the only way in
      </div>
    );
  }

  return (
    <section
      aria-label="Community Gate access path"
      className="relative w-full overflow-hidden rounded-2xl border border-white/12 bg-black/25 px-4 py-5 text-left backdrop-blur-md"
      style={{ boxShadow: `inset 0 1px 0 color-mix(in oklab, ${accent} 22%, transparent)` }}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/8 to-transparent blur-xl"
        initial={reduceMotion ? false : { x: "-180%" }}
        animate={reduceMotion ? undefined : { x: "520%" }}
        transition={{
          duration: 4.8,
          ease: "linear",
          repeat: Number.POSITIVE_INFINITY,
          repeatDelay: 1.2,
        }}
      />

      <motion.p
        className="relative text-[9px] font-semibold uppercase tracking-[0.28em]"
        style={{ color: accent }}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        One protected entrance
      </motion.p>

      <motion.h2
        className="relative mt-2 text-base font-semibold leading-snug text-white"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.08 }}
      >
        Your group isn&apos;t the front door.{" "}
        <span style={{ color: accent }}>Community Gate is.</span>
      </motion.h2>

      <ol className="relative mt-5 grid grid-cols-3 gap-2" aria-label="Access steps">
        {ACCESS_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.li
              key={step.label}
              className="relative flex min-w-0 flex-col items-center gap-2 text-center"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.2 + index * 0.16 }}
            >
              {index > 0 ? (
                <motion.span
                  aria-hidden="true"
                  className="absolute right-1/2 top-[17px] h-px w-[calc(100%-24px)] origin-left"
                  style={{ background: `color-mix(in oklab, ${accent} 55%, transparent)` }}
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.42 + index * 0.16 }}
                />
              ) : null}

              <motion.span
                className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/55"
                style={{ color: accent }}
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        scale: [1, 1.08, 1],
                        boxShadow: [
                          `0 0 0 0 color-mix(in oklab, ${accent} 0%, transparent)`,
                          `0 0 20px 1px color-mix(in oklab, ${accent} 42%, transparent)`,
                          `0 0 0 0 color-mix(in oklab, ${accent} 0%, transparent)`,
                        ],
                      }
                }
                transition={{
                  duration: 2.4,
                  repeat: Number.POSITIVE_INFINITY,
                  delay: index * 0.48,
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </motion.span>
              <span className="text-[10px] font-medium leading-tight text-white/70">
                {step.label}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <motion.p
        className="relative mt-5 border-t border-white/10 pt-3 text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.8 }}
      >
        No public links · No shortcuts · No unverified access
      </motion.p>
    </section>
  );
}
