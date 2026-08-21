import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Crown,
  Globe2,
  LockKeyhole,
  UsersRound,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { PackRails } from "@/components/billing/pack-rails";

const capabilities = [
  {
    icon: Globe2,
    title: "A home that is ready",
    body: "Every Gate receives a managed MyFenrir URL, ready to share without DNS setup.",
  },
  {
    icon: LockKeyhole,
    title: "Admission with context",
    body: "Build access rules around the standards your community actually needs.",
  },
  {
    icon: UsersRound,
    title: "Gate Reports · PostHog-ready",
    body: "See Gate views, seven-day trends, referrers, and unique daily visitors, ready to sync with your PostHog project.",
  },
] as const;

export const Route = createFileRoute("/upgrade")({ ssr: false, component: UpgradePage });

function UpgradePage() {
  // Honor the OS "reduce motion" setting: all looping/background motion turns
  // off and entrances mount static for anyone who asks for it.
  const reduce = useReducedMotion();

  return (
    <main className="min-h-dvh overflow-hidden bg-background px-5 py-8 sm:px-8 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
      >
        {/* Slow aurora: on-brand navy with controlled red + green light. */}
        <motion.div
          className="absolute inset-[-25%] opacity-80 [background:radial-gradient(38%_34%_at_20%_25%,hsl(var(--primary)/0.18),transparent_60%),radial-gradient(36%_32%_at_82%_74%,rgba(16,185,129,0.14),transparent_60%),radial-gradient(46%_40%_at_62%_8%,rgba(16,185,129,0.05),transparent_65%)]"
          animate={reduce ? undefined : { rotate: [0, 7, 0], scale: [1, 1.06, 1] }}
          transition={reduce ? undefined : { duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-primary/20 blur-[110px]"
          animate={reduce ? undefined : { x: [0, 54, 0], y: [0, 24, 0], opacity: [0.3, 0.6, 0.3] }}
          transition={reduce ? undefined : { duration: 13, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-emerald-500/15 blur-[120px]"
          animate={reduce ? undefined : { x: [0, -42, 0], y: [0, -30, 0], opacity: [0.22, 0.5, 0.22] }}
          transition={reduce ? undefined : { duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div className="mx-auto max-w-6xl">
        <Link
          to="/gates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Your gates
        </Link>

        <section className="grid gap-10 pb-12 pt-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:pb-20">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Crown className="h-3.5 w-3.5" /> Community Bridge / Pack
            </div>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Grow the world around your Gates.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              You already have entrances. Pack turns them into a coherent community system—branded,
              protected, and ready to evolve with your people.
            </p>
          </motion.div>
          <motion.aside
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.12, duration: 0.48 }}
            className="relative overflow-hidden rounded-3xl border border-primary/35 bg-card/70 p-6 shadow-[0_28px_100px_-50px_hsl(var(--primary))] backdrop-blur"
          >
            <div
              aria-hidden="true"
              className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-primary/30"
            />
            <h2 className="text-3xl font-semibold tracking-tight">Make your Gates a Pack.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Activate The Pack for multi-admin workflows and audit logs.
            </p>
            <div id="pack-rails" className="mt-6 scroll-mt-24">
              <PackRails />
            </div>
          </motion.aside>
        </section>

        <section className="border-t border-border/70 py-10 sm:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                What changes
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                One layer above the Gate.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              The Gate stays yours. Pack adds the connective tissue around it.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-3xl border border-border/70 bg-border/70 md:grid-cols-3">
            {capabilities.map((capability, index) => {
              const Icon = capability.icon;
              return (
                <motion.article
                  key={capability.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ delay: index * 0.08 }}
                  className="bg-card/85 p-6 sm:p-7"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-7 text-lg font-semibold">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {capability.body}
                  </p>
                </motion.article>
              );
            })}
          </div>
        </section>

        <section className="mb-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl border border-border/70 bg-card/65 p-7"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Pack signal
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              No new Gate. No duplicate setup.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Pack starts from the community you already built and changes only the layer above it.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="grid gap-3 rounded-3xl border border-primary/25 bg-card/65 p-5 sm:grid-cols-3"
          >
            {["Keep your address", "Connect your members", "Control access"].map((item, index) => (
              <motion.div
                key={item}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: reduce ? 0 : index * 0.1, duration: 0.4 }}
                whileHover={reduce ? undefined : { y: -5, scale: 1.015 }}
                className="group rounded-2xl border border-border/70 bg-background/60 p-4 shadow-[0_10px_28px_-22px_black] transition-colors hover:border-primary/50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  0{index + 1}
                </span>
                <p className="mt-6 text-sm font-medium">{item}</p>
                <Check className="mt-3 h-4 w-4 text-primary opacity-60 transition-opacity group-hover:opacity-100" />
              </motion.div>
            ))}
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-6 flex flex-col justify-between gap-5 rounded-3xl border border-primary/25 bg-primary/10 p-7 sm:flex-row sm:items-center sm:p-9"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Ready when you are
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Activate The Pack and create your first Gate.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="fenrir">
              <a href="#pack-rails">Choose how you pay · $14.99/month</a>
            </Button>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
