import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CreditCard, Bitcoin, Loader2 } from "lucide-react";

import {
  confirmFoundersStripeCheckout,
  createFoundersNowPaymentsCheckout,
  createFoundersStripeCheckout,
  getFoundersBillingOptions,
} from "@/lib/founders-billing.functions";

/**
 * The Pack payment rails.
 *
 * Canon (locked): one price, $14.99/month, shown identically on every rail.
 * Card is the primary rail and comes first on screen — Apple Pay and Google Pay
 * ride on the Stripe Checkout session. Telegram Stars is second at the
 * equivalent 1,150 Stars. Crypto is third, at the same $14.99; NOWPayments
 * shows its own processing fee on its checkout screen, so we never fold a fee
 * into the advertised number and never quote a percentage.
 *
 * A rail is only rendered as payable when the billing worker reports it ready
 * (getFoundersBillingOptions probes the live Stripe key and the NOWPayments
 * credentials). An unavailable rail is shown disabled with a plain reason
 * rather than a button that throws.
 */
const PACK_PRICE_LABEL = "$14.99";
const PACK_STARS = "1,150";

type Options = { stripe: boolean; nowpayments: boolean; stars: boolean };
type Rail = "card" | "stars" | "crypto";

export function PackRails() {
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState<Rail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFoundersBillingOptions()
      .then((result) => alive && setOptions(result))
      .catch((cause: unknown) => {
        if (!alive) return;
        setOptions({ stripe: false, nowpayments: false, stars: true });
        setError(cause instanceof Error ? cause.message : "Could not read payment options.");
      });
    return () => {
      alive = false;
    };
  }, []);

  // Returning from Stripe Checkout: confirm the session server-side before
  // telling anyone they are Pack. The worker re-reads the session from Stripe
  // and checks it is paid and bound to this account.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") !== "success") return;
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    confirmFoundersStripeCheckout({ data: { sessionId } })
      .then((result) => setConfirmed(result.status))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Payment could not be confirmed yet."),
      );
  }, []);

  const go = useCallback(async (rail: Rail) => {
    setError(null);
    setBusy(rail);
    try {
      if (rail === "card") {
        const { url } = await createFoundersStripeCheckout({ data: { billingPeriod: "monthly" } });
        window.location.href = url;
        return;
      }
      if (rail === "crypto") {
        const { url } = await createFoundersNowPaymentsCheckout();
        window.location.href = url;
        return;
      }
      window.location.href = "https://t.me/Myfenrir_bot?start=fenrir_stars";
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That rail did not respond. Try another.");
      setBusy(null);
    }
  }, []);

  const loading = options === null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">The Pack</p>
        <p className="text-sm font-semibold">
          {PACK_PRICE_LABEL}
          <span className="text-muted-foreground"> /month</span>
        </p>
      </div>

      {confirmed ? (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          The Pack is active on this account.
        </p>
      ) : null}

      {/* 1 · CARD — primary rail, first on screen. */}
      <RailButton
        primary
        icon={<CreditCard className="h-4 w-4" />}
        label={`Pay by card · ${PACK_PRICE_LABEL}`}
        note="Apple Pay and Google Pay included."
        busy={busy === "card"}
        loading={loading}
        available={options?.stripe ?? false}
        unavailableNote="Card payments are being set up."
        onClick={() => void go("card")}
      />

      {/* 2 · TELEGRAM STARS — the same price, paid inside Telegram. */}
      <RailButton
        icon={<span aria-hidden="true">⭐</span>}
        label={`Pay with Telegram Stars · ${PACK_STARS}`}
        note={`The Stars equivalent of ${PACK_PRICE_LABEL}, billed monthly.`}
        busy={busy === "stars"}
        loading={loading}
        available={options?.stars ?? true}
        unavailableNote="The Telegram bot is offline."
        onClick={() => void go("stars")}
      />

      {/* 3 · CRYPTO — same displayed price; NOWPayments shows its own fee. */}
      <RailButton
        icon={<Bitcoin className="h-4 w-4" />}
        label={`Pay with crypto · ${PACK_PRICE_LABEL}`}
        note="NOWPayments shows its processing fee before you pay."
        busy={busy === "crypto"}
        loading={loading}
        available={options?.nowpayments ?? false}
        unavailableNote="Crypto payments are being set up."
        onClick={() => void go("crypto")}
      />

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Same price on every rail. Cancel any time.
      </p>
    </div>
  );
}

function RailButton({
  icon,
  label,
  note,
  onClick,
  busy,
  loading,
  available,
  unavailableNote,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  note: string;
  onClick: () => void;
  busy: boolean;
  loading: boolean;
  available: boolean;
  unavailableNote: string;
  primary?: boolean;
}) {
  const disabled = loading || busy || !available;
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          "group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-transform duration-300",
          "disabled:cursor-not-allowed disabled:opacity-55",
          primary
            ? "border border-primary/50 bg-primary text-primary-foreground hover:-translate-y-0.5 active:translate-y-0"
            : "border border-border/70 bg-background/60 text-foreground hover:-translate-y-0.5 hover:border-primary/50 active:translate-y-0",
        ].join(" ")}
      >
        {busy || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        <span>{label}</span>
        {!disabled ? (
          <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        ) : null}
      </button>
      <p className="mt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
        {loading ? "Checking availability…" : available ? note : unavailableNote}
      </p>
    </div>
  );
}
