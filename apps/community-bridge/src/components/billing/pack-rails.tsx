import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bitcoin, CreditCard, Loader2 } from "lucide-react";
import { motion, useReducedMotion, type Transition } from "motion/react";

import {
  confirmFoundersStripeCheckout,
  createFoundersNowPaymentsCheckout,
  createFoundersStripeCheckout,
  getFoundersBillingOptions,
} from "@/lib/founders-billing.functions";

/**
 * The Pack payment rails — OPERATOR checkout.
 *
 * Audience: the person who administers a community and pays for it. Not the
 * member walking through the Gate. The copy sells control, reliability and a
 * door that does not fall over — never belonging.
 *
 * Surface: this block is written to be liftable. It carries its own colour
 * tokens on the wrapper instead of inheriting `--primary` from the member-gate
 * theme, so moving it to the operator's own domain is a copy-paste, not a
 * re-skin. See BILLING_SURFACE_NOTES.md for why that move matters legally.
 *
 * Canon (locked):
 *  - One price per rail, shown identically. $14.99/month per linked community,
 *    or $149/year. Never a percentage — always the money.
 *  - Card is the primary rail and comes first on screen. Apple Pay and Google
 *    Pay ride on the Stripe Checkout session.
 *  - Telegram Stars is second, at the equivalent 1,150 Stars, monthly only:
 *    Telegram fixes the subscription period at 30 days, so there is no annual
 *    Stars plan to sell.
 *  - Crypto is third, at the same displayed price. NOWPayments shows its own
 *    processing fee on its checkout screen; we never fold a fee into the
 *    advertised number.
 *  - A rail only renders as payable when the billing worker reports it ready.
 *
 * Motion: every animation below has a stated reason in its comment. Anything
 * that could not justify itself was cut. All of it is gated behind
 * `useReducedMotion()`.
 */

const PRICE = {
  monthly: { amount: "14.99", stars: "1,150" },
  annual: { amount: "149", stars: null },
} as const;

/** $14.99 x 12 = $179.88. $179.88 - $149 = $30.88. Say the money, not the percent. */
const ANNUAL_SAVING = "$30.88";

type Period = keyof typeof PRICE;
type Rail = "card" | "stars" | "crypto";
type Options = { stripe: boolean; nowpayments: boolean; stars: boolean };

const LOCALES = ["es", "en"] as const;
type Locale = (typeof LOCALES)[number];

const COPY = {
  es: {
    vendor: "Frisky Developments",
    product: "Fenrir · The Pack",
    lede: "Control de admisión para la comunidad que administras.",
    per: "/mes por comunidad enlazada",
    perAnnual: "/año por comunidad enlazada",
    monthly: "Mensual",
    annual: "Anual",
    savingNote: `${ANNUAL_SAVING} menos al año.`,
    card: "Pagar con tarjeta",
    cardNote: "Apple Pay y Google Pay incluidos.",
    stars: "Pagar con Telegram Stars",
    starsNote: "El equivalente en Stars, facturado cada mes.",
    starsAnnual: "Telegram fija el periodo en 30 días. No hay plan anual en Stars.",
    crypto: "Pagar con cripto",
    cryptoNote: "NOWPayments muestra su comisión antes de que pagues.",
    cryptoAnnual: "La factura anual en cripto todavía no está conectada.",
    cardOff: "El cobro con tarjeta se está configurando.",
    starsOff: "El bot de Telegram está fuera de línea.",
    cryptoOff: "El cobro con cripto se está configurando.",
    checking: "Comprobando disponibilidad…",
    active: "The Pack está activo en esta cuenta.",
    footer: "Mismo precio en cada riel. Cancelas cuando quieras.",
    scope: "Se cobra por comunidad enlazada, no por cuenta.",
    failed: "Ese riel no respondió. Prueba otro.",
    noOptions: "No se pudieron leer las opciones de pago.",
    noConfirm: "El pago aún no se pudo confirmar.",
  },
  en: {
    vendor: "Frisky Developments",
    product: "Fenrir · The Pack",
    lede: "Admission control for the community you run.",
    per: "/month per linked community",
    perAnnual: "/year per linked community",
    monthly: "Monthly",
    annual: "Annual",
    savingNote: `${ANNUAL_SAVING} less per year.`,
    card: "Pay by card",
    cardNote: "Apple Pay and Google Pay included.",
    stars: "Pay with Telegram Stars",
    starsNote: "The Stars equivalent, billed monthly.",
    starsAnnual: "Telegram fixes the period at 30 days. There is no annual Stars plan.",
    crypto: "Pay with crypto",
    cryptoNote: "NOWPayments shows its processing fee before you pay.",
    cryptoAnnual: "The annual crypto invoice is not wired up yet.",
    cardOff: "Card payments are being set up.",
    starsOff: "The Telegram bot is offline.",
    cryptoOff: "Crypto payments are being set up.",
    checking: "Checking availability…",
    active: "The Pack is active on this account.",
    footer: "Same price on every rail. Cancel any time.",
    scope: "Billed per linked community, not per account.",
    failed: "That rail did not respond. Try another.",
    noOptions: "Could not read payment options.",
    noConfirm: "Payment could not be confirmed yet.",
  },
} satisfies Record<Locale, Record<string, string>>;

/** Spanish is the primary market: anything that is not explicitly English gets es. */
function normalizeLocale(value: string | null | undefined): Locale {
  const normalized = (value ?? "").slice(0, 2).toLowerCase();
  return normalized === "en" ? "en" : "es";
}

/**
 * Local palette. Fenrir brandbook substrate (midnight / indigo / ice / muted)
 * with the FriskyDev neon lime as the single accent, and cyan reserved for the
 * crypto rail. Declared here rather than pulled from the gate theme so this
 * block survives the move to its own domain unchanged.
 */
const TOKENS = {
  "--fd-midnight": "#080B16",
  "--fd-surface": "#0B0E1A",
  "--fd-indigo": "#161C3D",
  "--fd-indigo-lift": "#1E2650",
  "--fd-lime": "#b7ff2a",
  "--fd-violet": "#8B7CFF",
  "--fd-cyan": "#4FD7E0",
  "--fd-ice": "#ECEEFF",
  "--fd-muted": "#9AA0C7",
} as React.CSSProperties;

const SPRING: Transition = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 };

export function PackRails() {
  const reduce = useReducedMotion();
  const [locale, setLocale] = useState<Locale>("es");
  const [period, setPeriod] = useState<Period>("monthly");
  const [options, setOptions] = useState<Options | null>(null);
  const [busy, setBusy] = useState<Rail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const t = COPY[locale];

  // Locale resolution mirrors the rest of the app: ?lang= wins, then the stored
  // preference, then the browser. Spanish is the fallback, not English.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    const stored = window.localStorage.getItem("myfenrir_locale");
    setLocale(normalizeLocale(requested ?? stored ?? navigator.language));
  }, []);

  useEffect(() => {
    let alive = true;
    getFoundersBillingOptions()
      .then((result) => alive && setOptions(result))
      .catch((cause: unknown) => {
        if (!alive) return;
        setOptions({ stripe: false, nowpayments: false, stars: true });
        setError(cause instanceof Error ? cause.message : t.noOptions);
      });
    return () => {
      alive = false;
    };
  }, [t.noOptions]);

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
        setError(cause instanceof Error ? cause.message : t.noConfirm),
      );
  }, [t.noConfirm]);

  const go = useCallback(
    async (rail: Rail) => {
      setError(null);
      setBusy(rail);
      try {
        if (rail === "card") {
          const { url } = await createFoundersStripeCheckout({ data: { billingPeriod: period } });
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
        setError(cause instanceof Error ? cause.message : t.failed);
        setBusy(null);
      }
    },
    [period, t.failed],
  );

  const loading = options === null;
  const annual = period === "annual";
  const price = PRICE[period];

  return (
    <section
      style={TOKENS}
      className="relative overflow-hidden rounded-[28px] border border-white/10 p-6 sm:p-7"
    >
      {/* Substrate: a still, deep indigo field. It does not animate — the panel
          is the quiet ground the moving parts are read against. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 80% at 12% 0%, var(--fd-indigo-lift) 0%, var(--fd-surface) 46%, var(--fd-midnight) 100%)",
        }}
      />

      {/* ── Vendor handshake ─────────────────────────────────────────────────
          Motion 1 — SIGIL IGNITION. The real FriskyDev sigil (public/brand/
          friskydev-sigil-solid.svg, used as a CSS mask so the artwork is never
          redrawn) takes a single sweep of lime light left to right on mount.
          Reason: it establishes who is charging the operator before they read
          a price. Fires once, never loops. */}
      <header className="flex items-center gap-3">
        <motion.span
          aria-hidden="true"
          className="relative block h-9 w-9 shrink-0"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.span
            className="absolute inset-0 block"
            style={{
              backgroundImage:
                "linear-gradient(115deg, var(--fd-violet) 0%, var(--fd-ice) 38%, var(--fd-lime) 62%, var(--fd-violet) 100%)",
              backgroundSize: "320% 100%",
              WebkitMaskImage: "url(/brand/friskydev-sigil-solid.svg)",
              maskImage: "url(/brand/friskydev-sigil-solid.svg)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
            initial={reduce ? false : { backgroundPosition: "100% 0%" }}
            animate={{ backgroundPosition: "0% 0%" }}
            transition={reduce ? undefined : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.span>
        <div className="min-w-0">
          <p
            className="truncate text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--fd-muted)" }}
          >
            {t.vendor}
          </p>
          <p className="truncate text-sm font-semibold" style={{ color: "var(--fd-ice)" }}>
            {t.product}
          </p>
        </div>
        {/* The Fenrir mark, real raster from the brand folder, as the product
            seal. Static: it is a mark of provenance, not an effect. */}
        <img
          src="/brand/fenrir-mark-256.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="ml-auto h-9 w-9 shrink-0 rounded-xl opacity-80"
        />
      </header>

      <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--fd-muted)" }}>
        {t.lede}
      </p>

      {/* ── Price ────────────────────────────────────────────────────────────
          Motion 2 — PRICE WEIGHT. The amount rises into place with a small
          overshoot and settles; the qualifier ("per linked community") fades in
          one beat AFTER the number lands. Reason: the price is the single most
          consequential fact here, and the delayed qualifier forces the eye to
          actually read "per community" instead of skimming past it. That gap is
          the refund-prevention move, not decoration. Re-fires on period change
          because the number genuinely changed. */}
      <div className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-1">
        <motion.p
          key={period}
          className="font-semibold leading-none tracking-[-0.055em]"
          style={{ color: "var(--fd-ice)", fontSize: "clamp(2.75rem, 9vw, 3.75rem)" }}
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? undefined : SPRING}
        >
          <span style={{ color: "var(--fd-lime)" }}>$</span>
          {price.amount}
        </motion.p>
        <motion.p
          key={`${period}-suffix`}
          className="pb-1.5 text-sm font-medium"
          style={{ color: "var(--fd-muted)" }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduce ? undefined : { delay: 0.34, duration: 0.32 }}
        >
          {annual ? t.perAnnual : t.per}
        </motion.p>
      </div>

      {/* ── Period toggle ────────────────────────────────────────────────────
          Motion 6 — SHARED PILL. The selected pill physically slides between
          the two options via a shared layoutId rather than cross-fading.
          Reason: the slide says "one thing moved", which is what a billing
          period is — the same purchase on a different clock. A cross-fade would
          read as two separate products. */}
      <div
        role="tablist"
        aria-label={t.product}
        className="mt-5 inline-flex rounded-full border border-white/10 p-1"
        style={{ background: "rgba(8,11,22,0.6)" }}
      >
        {(["monthly", "annual"] as const).map((value) => {
          const selected = period === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPeriod(value)}
              className="relative rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
              style={{ color: selected ? "var(--fd-midnight)" : "var(--fd-muted)" }}
            >
              {selected ? (
                <motion.span
                  layoutId="fd-period-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--fd-lime)" }}
                  transition={reduce ? { duration: 0 } : SPRING}
                />
              ) : null}
              <span className="relative">{value === "monthly" ? t.monthly : t.annual}</span>
            </button>
          );
        })}
      </div>
      {annual ? (
        <motion.p
          className="mt-2 text-xs font-medium"
          style={{ color: "var(--fd-lime)" }}
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? undefined : { duration: 0.24 }}
        >
          {t.savingNote}
        </motion.p>
      ) : null}

      {confirmed ? (
        <p
          className="mt-5 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "rgba(183,255,42,0.35)",
            background: "rgba(183,255,42,0.08)",
            color: "var(--fd-lime)",
          }}
        >
          {t.active}
        </p>
      ) : null}

      {/* ── Rails ────────────────────────────────────────────────────────────
          Motion 3 — CARD LEAD-IN. Card enters at 0ms, Stars at +90ms, crypto at
          +180ms, each on a 10px rise. Reason: the stagger IS the hierarchy. The
          eye lands on card before it knows the other two exist, which is
          exactly the order of preference. Nothing else encodes that. */}
      <div className="mt-6 space-y-2.5">
        <RailButton
          index={0}
          reduce={reduce}
          primary
          accent="var(--fd-lime)"
          icon={<CreditCard className="h-4 w-4" />}
          label={`${t.card} · $${price.amount}`}
          note={t.cardNote}
          busy={busy === "card"}
          dimmed={busy !== null && busy !== "card"}
          loading={loading}
          available={options?.stripe ?? false}
          unavailableNote={t.cardOff}
          checkingNote={t.checking}
          onClick={() => void go("card")}
        />

        <RailButton
          index={1}
          reduce={reduce}
          accent="var(--fd-violet)"
          icon={<span aria-hidden="true">⭐</span>}
          label={
            annual ? t.stars : `${t.stars} · ${PRICE.monthly.stars}`
          }
          note={t.starsNote}
          busy={busy === "stars"}
          dimmed={busy !== null && busy !== "stars"}
          loading={loading}
          available={!annual && (options?.stars ?? true)}
          unavailableNote={annual ? t.starsAnnual : t.starsOff}
          checkingNote={t.checking}
          onClick={() => void go("stars")}
        />

        <RailButton
          index={2}
          reduce={reduce}
          accent="var(--fd-cyan)"
          icon={<Bitcoin className="h-4 w-4" />}
          label={`${t.crypto} · $${price.amount}`}
          note={t.cryptoNote}
          busy={busy === "crypto"}
          dimmed={busy !== null && busy !== "crypto"}
          loading={loading}
          available={!annual && (options?.nowpayments ?? false)}
          unavailableNote={annual ? t.cryptoAnnual : t.cryptoOff}
          checkingNote={t.checking}
          onClick={() => void go("crypto")}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-xs leading-relaxed text-red-300">
          {error}
        </p>
      ) : null}

      <footer className="mt-5 space-y-1 text-center">
        <p className="text-xs leading-relaxed" style={{ color: "var(--fd-muted)" }}>
          {t.footer}
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--fd-muted)", opacity: 0.75 }}>
          {t.scope}
        </p>
      </footer>
    </section>
  );
}

function RailButton({
  index,
  reduce,
  accent,
  icon,
  label,
  note,
  onClick,
  busy,
  dimmed,
  loading,
  available,
  unavailableNote,
  checkingNote,
  primary = false,
}: {
  index: number;
  reduce: boolean | null;
  accent: string;
  icon: React.ReactNode;
  label: string;
  note: string;
  onClick: () => void;
  busy: boolean;
  dimmed: boolean;
  loading: boolean;
  available: boolean;
  unavailableNote: string;
  checkingNote: string;
  primary?: boolean;
}) {
  const disabled = loading || busy || !available;
  const [hovered, setHovered] = useState(false);

  const idle = useMemo(
    () => ({
      background: primary ? accent : "rgba(22,28,61,0.55)",
      color: primary ? "var(--fd-midnight)" : "var(--fd-ice)",
      borderColor: primary ? accent : "rgba(255,255,255,0.10)",
    }),
    [primary, accent],
  );

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{
        opacity: dimmed ? 0.4 : 1,
        y: 0,
      }}
      transition={
        reduce
          ? undefined
          : {
              // Motion 3 — the stagger that encodes rail priority.
              y: { delay: index * 0.09, duration: 0.42, ease: [0.22, 1, 0.36, 1] },
              opacity: { delay: dimmed ? 0 : index * 0.09, duration: dimmed ? 0.18 : 0.42 },
            }
      }
    >
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        style={idle}
        className={[
          "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border",
          "px-4 py-3.5 text-sm font-semibold",
          "disabled:cursor-not-allowed disabled:opacity-55",
        ].join(" ")}
        /* Motion 4 — PHYSICAL HOVER. A 2px lift and a specular sweep, never a
           scale. Reason: lift + moving highlight reads as a real key cap under
           a light source; a zoom reads as a generic web hover and says nothing
           about the object. Press returns it to the surface. */
        whileHover={reduce || disabled ? undefined : { y: -2 }}
        whileTap={reduce || disabled ? undefined : { y: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {!disabled && !reduce ? (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-1/3"
            style={{
              background: primary
                ? "linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent)"
                : `linear-gradient(100deg, transparent, ${accent}59, transparent)`,
            }}
            initial={{ x: "-160%" }}
            animate={hovered ? { x: "460%" } : { x: "-160%" }}
            transition={hovered ? { duration: 0.55, ease: "easeOut" } : { duration: 0 }}
          />
        ) : null}

        <span className="relative flex items-center gap-2">
          {busy || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          <span>{label}</span>
          {!disabled ? (
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          ) : null}
        </span>
      </motion.button>
      <p
        className="mt-1.5 text-center text-[11px] leading-relaxed"
        style={{ color: "var(--fd-muted)" }}
      >
        {loading ? checkingNote : available ? note : unavailableNote}
      </p>
    </motion.div>
  );
}
