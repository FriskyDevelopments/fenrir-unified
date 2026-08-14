import { motion } from "motion/react";
import { ArrowRight, Bot, Check, Globe2, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "Shape your gate",
    body: "Choose its address, atmosphere, and community standards. Nothing publishes until you press Publish.",
    icon: ShieldCheck,
  },
  {
    title: "Link Telegram",
    body: "Add Fenrir to the group, then promote it. Fenrir confirms the exact Telegram community name in the group before this Gate is ready to share.",
    icon: Bot,
  },
  {
    title: "Test and share",
    body: "Open the public gate, test the full member path, then share one stable community URL.",
    icon: Globe2,
  },
] as const;

/** A short, stateful explanation of the actual gate journey. */
export function OnboardingMotionGuide() {
  const [active, setActive] = useState(0);
  const current = steps[active];
  const Icon = current.icon;

  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl border border-primary/25 bg-card/75 p-5 shadow-[0_28px_100px_-60px_hsl(var(--primary))] sm:p-6" aria-label="Gate setup guide">
      <motion.div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-primary/15 blur-3xl" animate={{ scale: [1, 1.14, 1], opacity: [0.38, 0.7, 0.38] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Guided setup</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Your gate, from blank to live.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Follow one clear path. Each step explains exactly what happens next.</p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          {active + 1} / {steps.length}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Gate setup steps">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const selected = index === active;
          return (
            <button
              key={step.title}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(index)}
              className={cn(
                "relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                selected ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/70 bg-background/30 text-muted-foreground hover:border-primary/30",
              )}
            >
              {selected ? <motion.span layoutId="guide-active" className="absolute inset-0 rounded-xl border border-primary/50" transition={{ type: "spring", stiffness: 380, damping: 32 }} /> : null}
              <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-background/70 text-primary"><StepIcon className="h-3.5 w-3.5" /></span>
              <span className="relative truncate">{step.title}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={current.title}
        initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="mt-4 flex items-start gap-3 rounded-xl border border-border/70 bg-background/45 p-3.5"
      >
        <motion.span initial={{ rotate: -12, scale: 0.9 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 360, damping: 18 }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-4 w-4" /></motion.span>
        <div><p className="font-medium">{current.title}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{current.body}</p></div>
        {active === steps.length - 1 ? <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-label="Final setup step" /> : null}
      </motion.div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">{active === 0 ? "Start by choosing the gate people will recognize." : active === 1 ? "Telegram confirms the real group name after the owner promotes Fenrir." : "Run the member journey before sharing it."}</p>
        {active < steps.length - 1 ? <button type="button" onClick={() => setActive((step) => step + 1)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">Next <ArrowRight className="h-3.5 w-3.5" /></button> : <Link to="/upgrade" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80">Upgrade options <ArrowRight className="h-3.5 w-3.5" /></Link>}
      </div>
    </section>
  );
}
