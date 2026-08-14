import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowUpRight, Check, Crown, Globe2, LockKeyhole, Sparkles, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createFounderCheckout } from "@/lib/stripe-checkout.functions";

const capabilities = [
  { icon: Globe2, title: "A home that is yours", body: "Bring a community domain and make every gate feel like part of the same world." },
  { icon: LockKeyhole, title: "Admission with context", body: "Build access rules around the standards your community actually needs." },
  { icon: UsersRound, title: "A living member layer", body: "See activity, roles, and the decisions that shape your community over time." },
] as const;

export const Route = createFileRoute("/upgrade")({ ssr: false, component: UpgradePage });

function UpgradePage() {
  const startCheckout = useServerFn(createFounderCheckout);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function openFounderCheckout() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const result = await startCheckout();
      window.location.assign(result.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCheckoutError(
        message.includes("Unauthorized")
          ? "Sign in to Community before starting Founder Checkout."
          : message.replace(/^founder_checkout_(?:unavailable|failed):\s*/, "") || "Founder Checkout is unavailable.",
      );
      setCheckoutBusy(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-background px-5 py-8 sm:px-8 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <motion.div className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-primary/20 blur-[110px]" animate={{ x: [0, 54, 0], y: [0, 24, 0], opacity: [0.35, 0.72, 0.35] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-violet-500/15 blur-[120px]" animate={{ x: [0, -42, 0], y: [0, -30, 0], opacity: [0.25, 0.6, 0.25] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      <div className="mx-auto max-w-6xl">
        <Link to="/gates" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Your gates</Link>

        <section className="grid gap-10 pb-12 pt-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:pb-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary"><Crown className="h-3.5 w-3.5" /> Community Bridge / Pack</div>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-6xl lg:text-7xl">Grow the world around your Gates.</h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">You already have entrances. Pack turns them into a coherent community system—branded, protected, and ready to evolve with your people.</p>
          </motion.div>
          <motion.aside initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.48 }} className="relative overflow-hidden rounded-3xl border border-primary/55 bg-card/85 p-6 shadow-[0_28px_100px_-40px_hsl(var(--primary))] backdrop-blur">
            <div aria-hidden="true" className="absolute -right-8 -top-8 h-32 w-32 rounded-full border border-primary/30" />
            <div className="relative inline-flex items-center gap-2 rounded-full border border-amber-300/45 bg-amber-300/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200"><Crown className="h-3.5 w-3.5" /> Founder Deal</div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Lock in Pack at founder price.</h2>
            <div className="mt-5 flex items-end gap-3">
              <p className="text-5xl font-semibold tracking-[-0.06em] text-foreground">US$14.99</p>
              <p className="pb-1.5 text-sm text-muted-foreground">/ month</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-primary/12 px-2.5 py-1 font-semibold text-primary">Save US$5 every month</span>
              <span className="text-muted-foreground"><span className="line-through">US$19.99</span> standard price</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Join as a Founder and keep <strong className="text-foreground">US$14.99/month for as long as you keep your membership.</strong> Invitation trials are separate and issued personally.</p>
            <button type="button" onClick={() => void openFounderCheckout()} disabled={checkoutBusy} className="group relative mt-6 flex w-full items-center justify-center overflow-hidden rounded-xl border border-primary/40 bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.25),0_14px_32px_-16px_hsl(var(--primary))] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.32),0_20px_40px_-16px_hsl(var(--primary))] active:translate-y-0 disabled:cursor-wait disabled:opacity-70"><span aria-hidden="true" className="absolute inset-x-0 -top-8 h-12 -translate-x-full rotate-12 bg-primary-foreground/20 blur-md transition-transform duration-700 group-hover:translate-x-full" /><span className="relative">{checkoutBusy ? "Opening Stripe…" : "Lock in US$14.99"} <ArrowUpRight className="ml-2 inline h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span></button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Stripe test checkout · Price stays locked while subscribed · invitation trials only</p>
          {checkoutError ? <p className="mt-3 text-center text-sm text-destructive" role="alert">{checkoutError}</p> : null}
          </motion.aside>
        </section>

        <section className="border-t border-border/70 py-10 sm:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">What changes</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">One layer above the Gate.</h2></div><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">The Gate stays yours. Pack adds the connective tissue around it.</p></div>
          <div className="grid gap-px overflow-hidden rounded-3xl border border-border/70 bg-border/70 md:grid-cols-3">
            {capabilities.map((capability, index) => { const Icon = capability.icon; return <motion.article key={capability.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ delay: index * 0.08 }} className="bg-card/85 p-6 sm:p-7"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><h3 className="mt-7 text-lg font-semibold">{capability.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{capability.body}</p></motion.article>; })}
          </div>
        </section>

        <section className="mb-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="rounded-3xl border border-border/70 bg-card/65 p-7"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pack signal</p><h2 className="mt-3 text-2xl font-semibold tracking-tight">No new Gate. No duplicate setup.</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Pack starts from the community you already built and changes only the layer above it.</p></motion.div>
          <motion.div initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="grid gap-3 rounded-3xl border border-primary/25 bg-card/65 p-5 sm:grid-cols-3">
            {["Keep your address", "Connect your members", "Control access"].map((item, index) => <motion.div key={item} whileHover={{ y: -5, scale: 1.015 }} transition={{ type: "spring", stiffness: 320, damping: 22 }} className="group rounded-2xl border border-border/70 bg-background/60 p-4 shadow-[0_10px_28px_-22px_black] transition-colors hover:border-primary/50"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">0{index + 1}</span><p className="mt-6 text-sm font-medium">{item}</p><Check className="mt-3 h-4 w-4 text-primary opacity-60 transition-opacity group-hover:opacity-100" /></motion.div>)}
          </motion.div>
        </section>

        <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mb-6 flex flex-col justify-between gap-5 rounded-3xl border border-primary/25 bg-primary/10 p-7 sm:flex-row sm:items-center sm:p-9"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Founder Go-Live</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Your existing Gates are already the starting point.</h2></div><Button type="button" variant="fenrir" disabled={checkoutBusy} onClick={() => void openFounderCheckout()}><Sparkles className="mr-2 h-4 w-4" /> {checkoutBusy ? "Opening Stripe…" : "Continue to Founder Checkout"}</Button></motion.section>
      </div>
    </main>
  );
}
