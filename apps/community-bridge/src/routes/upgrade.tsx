import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Crown,
  Globe2,
  LockKeyhole,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  createFoundersNowPaymentsCheckout,
  createFoundersStripeCheckout,
  confirmFoundersStripeCheckout,
  getFoundersBillingOptions,
} from "@/lib/founders-billing.functions";

const capabilities = [
  {
    icon: Globe2,
    title: "A home that is yours",
    body: "Bring a community domain and make every gate feel like part of the same world.",
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

// Launch billing rail = Telegram Stars ONLY. Card (Stripe) and crypto (NOWPayments)
// checkout stay in code but are hidden until card billing goes live, so no user can
// reach /api/internal/founders-checkout — the Stripe path that 502s as
// `stripe_checkout_failed`. Flip to true (or wire an env flag) when card billing is ready.
const CARD_BILLING_ENABLED = false;

export const Route = createFileRoute("/upgrade")({ ssr: false, component: UpgradePage });

function UpgradePage() {
  const createNowPaymentsCheckout = useServerFn(createFoundersNowPaymentsCheckout);
  const createStripeCheckout = useServerFn(createFoundersStripeCheckout);
  const confirmStripeCheckout = useServerFn(confirmFoundersStripeCheckout);
  const getBillingOptions = useServerFn(getFoundersBillingOptions);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [nowPaymentsReady, setNowPaymentsReady] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  // Honor the OS "reduce motion" setting: all looping/background motion turns
  // off and entrances mount static for anyone who asks for it.
  const reduce = useReducedMotion();

  useEffect(() => {
    void getBillingOptions()
      .then((options) => setNowPaymentsReady(options.nowpayments))
      .catch(() => setNowPaymentsReady(false));
  }, [getBillingOptions]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("stripe") === "success" && sessionId) {
      setStripeBusy(true);
      void confirmStripeCheckout({ data: { sessionId } })
        .then(() => setBillingMessage("✅ Standard activated. Your 5 Gates are ready."))
        .catch((error: unknown) =>
          setBillingMessage(error instanceof Error ? error.message : "Payment confirmation failed"),
        )
        .finally(() => setStripeBusy(false));
      return;
    }
    const status = params.get("nowpayments");
    if (status === "processing")
      setBillingMessage(
        "🟣 Payment received by NOWPayments. Standard activates automatically after blockchain confirmation.",
      );
    if (status === "partial")
      setBillingMessage(
        "🟠 Partial payment detected. Complete the remaining amount in NOWPayments.",
      );
  }, [confirmStripeCheckout]);

  async function openStripe(billingPeriod: "monthly" | "annual" = "monthly") {
    setStripeBusy(true);
    setBillingMessage(null);
    try {
      const { url } = await createStripeCheckout({ data: { billingPeriod } });
      window.location.assign(url);
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "Stripe checkout unavailable");
      setStripeBusy(false);
    }
  }

  async function openNowPayments() {
    setStripeBusy(true);
    setBillingMessage(null);
    try {
      const { url } = await createNowPaymentsCheckout();
      window.location.assign(url);
    } catch (error) {
      setBillingMessage(
        error instanceof Error ? error.message : "NOWPayments checkout unavailable",
      );
      setStripeBusy(false);
    }
  }
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Founders Deal · Standard Pack
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Make your Gates a Pack.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Membership begins with your first Gate. Payment activates the Standard Pack: 5 Gates
              in one active community.
            </p>
            {CARD_BILLING_ENABLED && (
              <>
                <button
                  type="button"
                  disabled={stripeBusy}
                  onClick={() => void openStripe("annual")}
                  className="group relative mt-6 flex w-full items-center justify-center overflow-hidden rounded-xl border border-[#635bff]/60 bg-gradient-to-r from-[#635bff] to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_36px_rgba(99,91,255,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(99,91,255,0.4)] disabled:cursor-wait disabled:opacity-60"
                >
                  Commit more, pay less · US$149.90/year <ArrowUpRight className="ml-2 h-4 w-4" />
                </button>
                <p className="mt-2 text-center text-xs font-medium text-primary">Founders Deal · 2 months free</p>
                <button
                  type="button"
                  disabled={stripeBusy}
                  onClick={() => void openStripe("monthly")}
                  className="mt-3 flex w-full items-center justify-center rounded-xl border border-[#635bff]/45 bg-[#635bff]/10 px-4 py-3 text-sm font-medium text-violet-100 transition-colors hover:border-[#8078ff]/70 hover:bg-[#635bff]/20 disabled:cursor-wait disabled:opacity-60"
                >
                  Monthly · US$14.99/month <ArrowUpRight className="ml-2 h-4 w-4" />
                </button>
              </>
            )}
            {CARD_BILLING_ENABLED && nowPaymentsReady ? (
              <button
                type="button"
                disabled={stripeBusy}
                onClick={() => void openNowPayments()}
                className="mt-3 flex w-full items-center justify-center rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 text-sm font-medium text-violet-200 transition-colors hover:border-violet-300/70 hover:bg-violet-500/20 disabled:cursor-wait disabled:opacity-60"
              >
                ₿ Crypto · $15 USD with NOWPayments <ArrowUpRight className="ml-2 h-4 w-4" />
              </button>
            ) : null}
            <motion.a
              className="group relative mt-6 flex w-full items-center justify-center overflow-hidden rounded-xl border border-[#f4c542]/50 bg-[#f4c542] px-4 py-3 text-sm font-bold text-[#171204] shadow-[0_0_36px_rgba(244,197,66,0.24)] transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0"
              href="https://t.me/Myfenrir_bot?start=fenrir_stars"
              animate={
                reduce
                  ? undefined
                  : {
                      boxShadow: [
                        "0 0 28px rgba(244,197,66,0.22)",
                        "0 0 48px rgba(244,197,66,0.44)",
                        "0 0 28px rgba(244,197,66,0.22)",
                      ],
                    }
              }
              transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -top-8 h-12 -translate-x-full rotate-12 bg-primary-foreground/20 blur-md transition-transform duration-700 group-hover:translate-x-full"
              />
              <span className="relative">
                ⭐ Activate Standard Pack · 1,150 Stars{" "}
                <ArrowUpRight className="ml-2 inline h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </motion.a>
            {billingMessage ? (
              <p className="mt-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-center text-xs">
                {billingMessage}
              </p>
            ) : null}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Telegram confirms Stars inside the bot. Your linked MyFenrir account becomes Pack
              immediately after payment.
            </p>
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
              Activate the Standard Pack and create your first Gate.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {CARD_BILLING_ENABLED && (
              <Button variant="fenrir" disabled={stripeBusy} onClick={() => void openStripe("annual")}>
                <Sparkles className="mr-2 h-4 w-4" /> US$149.90/year · 2 months free
              </Button>
            )}
            <Button asChild variant="fenrir">
              <a href="https://t.me/Myfenrir_bot?start=fenrir_stars">⭐ Pay with Telegram Stars · The Pack</a>
            </Button>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
