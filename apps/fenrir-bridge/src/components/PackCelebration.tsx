/**
 * PackCelebration — the moment a membership is confirmed.
 *
 * Not a toast. The screen goes to ink, the diamond protocol grid ignites, the
 * member's wolf mark draws itself in gold, and six pack-mates converge inward
 * and close a ring around it. Then the facts resolve underneath: what you
 * bought, what you paid, until when, what it unlocked.
 *
 * Everything rendered here comes from getMembershipFacts(). A fact the backend
 * cannot substantiate is rendered as its reason, in muted italic — never as a
 * confident placeholder. The celebration is allowed to say "we don't know".
 *
 * WolfMark path is the kit's own (@frisky/kit-fenrir WolfMark), reproduced so
 * this surface has no cross-package build dependency.
 */
import { useEffect, useMemo, useRef } from "react";
import "./PackCelebration.css";

export type MembershipFacts = {
  entitled: boolean;
  reason?: string;
  plan: { key: string | null; display: string | null; recognised: boolean };
  status: { raw: string; needsAttention: boolean; cancelAtPeriodEnd: boolean };
  term: { currentPeriodEnd: string | null; known: boolean; reason: string | null };
  rail: { key: string; label: string | null };
  amount: { charged: boolean | null; display: string | null; reason: string | null };
  limits: {
    maxTelegramLocks: number | null;
    locksUnlimited: boolean;
    multiAdmin: boolean;
    auditLogs: boolean;
    customDomain: boolean;
  } | null;
};

type Props = {
  facts: MembershipFacts;
  locale?: "en" | "es";
  onDismiss: () => void;
  onOpenPortal?: () => void;
};

const COPY = {
  en: {
    eyebrow: "MEMBERSHIP CONFIRMED",
    eyebrowAttention: "PAYMENT NEEDS ATTENTION",
    sub: "The gate is open. Your seat is held, and every surface below now reads the same record.",
    subUnknown: "Your membership is active, but one detail below could not be confirmed. It is marked rather than guessed.",
    plan: "Plan", paid: "Paid", rail: "Paid with", term: "Renews",
    unlocked: "What this unlocks",
    locks: "Telegram Locks", multiAdmin: "Multi-admin", audit: "Audit logs", domain: "Custom domain",
    unlimited: "Unlimited", included: "Included", notIncluded: "Not included",
    noTerm: "No renewal date on file", noAmount: "Amount not recorded", noCharge: "No charge",
    unknownPlan: "Unrecognised plan", unknownRail: "Rail unknown", notOnFile: "Allowance not on file",
    enter: "Enter the Pack", later: "Later",
    pastDue: "Your last payment did not go through. Access is on for now — please update your payment method.",
    cancelling: "This membership is set to end at the close of the current period. It will not renew.",
    noTermWhy: "This rail did not record a term, so no end date is shown. We are not going to display a date we cannot prove.",
    noAmountWhy: "The amount was not stored alongside your subscription. Your payment provider's receipt is the authoritative record.",
    unknownPlanWhy: "Your subscription is active but its plan key is not one this build recognises, so its allowances are not shown.",
  },
  es: {
    eyebrow: "MEMBRESÍA CONFIRMADA",
    eyebrowAttention: "EL PAGO REQUIERE ATENCIÓN",
    sub: "La puerta está abierta. Tu lugar está guardado, y desde ahora todas las pantallas leen el mismo registro.",
    subUnknown: "Tu membresía está activa, pero un dato de abajo no se pudo confirmar. Está marcado en vez de inventado.",
    plan: "Plan", paid: "Pagaste", rail: "Pagado con", term: "Renueva",
    unlocked: "Qué desbloquea",
    locks: "Locks de Telegram", multiAdmin: "Multi-admin", audit: "Audit logs", domain: "Dominio propio",
    unlimited: "Ilimitados", included: "Incluido", notIncluded: "No incluido",
    noTerm: "Sin fecha de renovación registrada", noAmount: "Importe no registrado", noCharge: "Sin cargo",
    unknownPlan: "Plan no reconocido", unknownRail: "Riel desconocido", notOnFile: "Límites no registrados",
    enter: "Entrar al Pack", later: "Después",
    pastDue: "Tu último pago no se procesó. El acceso sigue activo por ahora — actualiza tu método de pago.",
    cancelling: "Esta membresía terminará al cierre del periodo actual. No se renovará.",
    noTermWhy: "Este riel no registró una vigencia, así que no se muestra fecha de término. No vamos a mostrar una fecha que no podemos comprobar.",
    noAmountWhy: "El importe no se guardó junto a tu suscripción. El recibo de tu proveedor de pago es el registro autoritativo.",
    unknownPlanWhy: "Tu suscripción está activa pero su plan no es uno que esta versión reconozca, así que no se muestran sus límites.",
  },
} as const;

/** The kit wolf mark. Outline only; reads gold from tokens. */
function WolfMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Fenrir">
      <path
        d="M8 34 L14 18 L20 26 L24 12 L28 26 L34 18 L40 34 L32 38 L24 30 L16 38 Z"
        fill="none"
        stroke="var(--pk-gold)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="28" r="1.4" fill="var(--pk-gold)" />
      <circle cx="28" cy="28" r="1.4" fill="var(--pk-gold)" />
    </svg>
  );
}

/** Six pack-mates on a ring. Angles are fixed so the formation reads as a
 *  deliberate circle rather than a random scatter. */
const MATES = [0, 60, 120, 180, 240, 300];

function formatDay(iso: string | null, locale: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export function PackCelebration({ facts, locale = "en", onDismiss, onOpenPortal }: Props) {
  const c = COPY[locale];
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc closes; focus moves in so the ceremony is keyboard-reachable.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const termDay = useMemo(() => formatDay(facts.term.currentPeriodEnd, locale), [facts.term.currentPeriodEnd, locale]);

  if (!facts.entitled) return null;

  const planName = facts.plan.display;
  const title = planName
    ? locale === "es" ? `Estás en ${planName}` : `You're in ${planName}`
    : c.unknownPlan;

  const amountText = facts.amount.charged === false ? c.noCharge : facts.amount.display;

  const notes: string[] = [];
  if (facts.status.needsAttention) notes.push(c.pastDue);
  if (facts.status.cancelAtPeriodEnd) notes.push(c.cancelling);
  if (!facts.term.known) notes.push(c.noTermWhy);
  if (facts.amount.charged !== false && !facts.amount.display) notes.push(c.noAmountWhy);
  if (!facts.plan.recognised) notes.push(c.unknownPlanWhy);

  const hasUnknown = !facts.term.known || !facts.plan.recognised || (facts.amount.charged !== false && !facts.amount.display);

  const fact = (label: string, value: string | null, fallback: string) => (
    <div className="pk__fact">
      <dt>{label}</dt>
      <dd data-unknown={value ? "false" : "true"}>{value ?? fallback}</dd>
    </div>
  );

  return (
    <div
      className="pk"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      ref={dialogRef}
      data-kit="fenrir"
    >
      <span className="pk__grid" aria-hidden />
      <span className="pk__field" aria-hidden />
      <span className="pk__vignette" aria-hidden />
      <span className="pk__grain" aria-hidden />

      <div className="pk__stage">
        <div className="pk__sigil" aria-hidden>
          <span className="pk__ring" />
          <span className="pk__ring pk__ring--2" />
          {MATES.map((angle, i) => (
            <span
              key={angle}
              className="pk__mate"
              style={{
                // Each mate travels inward from --r-far to --r-near on its angle.
                ["--a" as string]: `${angle}deg`,
                ["--r-far" as string]: "-190px",
                ["--r-near" as string]: "-124px",
                ["--i" as string]: String(i),
              }}
            >
              <WolfMark />
            </span>
          ))}
          <WolfMark className="pk__self" />
        </div>

        <div className="pk__eyebrow pk__rise" style={{ animationDelay: "1250ms" }}>
          {facts.status.needsAttention ? c.eyebrowAttention : c.eyebrow}
        </div>

        <h1 className="pk__title pk__rise" style={{ animationDelay: "1330ms" }}>{title}</h1>

        <p className="pk__sub pk__rise" style={{ animationDelay: "1420ms" }}>
          {hasUnknown ? c.subUnknown : c.sub}
        </p>

        <dl className="pk__facts pk__rise" style={{ animationDelay: "1510ms" }}>
          {fact(c.plan, planName, c.unknownPlan)}
          {fact(c.paid, amountText, c.noAmount)}
          {fact(c.rail, facts.rail.label, c.unknownRail)}
          {fact(c.term, termDay, c.noTerm)}
        </dl>

        <div className="pk__unlocked pk__rise" style={{ animationDelay: "1600ms" }}>
          <h2>{c.unlocked}</h2>
          {facts.limits ? (
            <ul>
              <li data-on="true">
                <span><i className="pk__dot" />{c.locks}</span>
                <span>{facts.limits.locksUnlimited ? c.unlimited : facts.limits.maxTelegramLocks}</span>
              </li>
              <li data-on={String(facts.limits.multiAdmin)}>
                <span><i className="pk__dot" />{c.multiAdmin}</span>
                <span>{facts.limits.multiAdmin ? c.included : c.notIncluded}</span>
              </li>
              <li data-on={String(facts.limits.auditLogs)}>
                <span><i className="pk__dot" />{c.audit}</span>
                <span>{facts.limits.auditLogs ? c.included : c.notIncluded}</span>
              </li>
              <li data-on={String(facts.limits.customDomain)}>
                <span><i className="pk__dot" />{c.domain}</span>
                <span>{facts.limits.customDomain ? c.included : c.notIncluded}</span>
              </li>
            </ul>
          ) : (
            <div className="pk__note">{c.notOnFile}</div>
          )}
        </div>

        {notes.length > 0 && (
          <div className="pk__note pk__rise" style={{ animationDelay: "1680ms" }}>
            {notes.map((n, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "10px 0 0" }}>{n}</p>
            ))}
          </div>
        )}

        <div className="pk__actions pk__rise" style={{ animationDelay: "1760ms" }}>
          <button type="button" className="pk__btn pk__btn--primary" onClick={onOpenPortal ?? onDismiss}>
            {c.enter}
          </button>
          <button type="button" className="pk__btn pk__btn--ghost" onClick={onDismiss}>
            {c.later}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PackCelebration;
