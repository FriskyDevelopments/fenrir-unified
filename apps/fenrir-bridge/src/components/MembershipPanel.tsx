/**
 * MembershipPanel — what the portal shows about your membership.
 *
 * Replaces three surfaces that each guessed differently: the header pill that
 * printed a raw plan key, the session strip whose planLabel lookup returned
 * undefined for `standard` (the very plan The Pack writes), and the billing
 * panel that fell back to "Awaiting payment" whenever subscriptionStatus was
 * null — including for members who were fully paid up.
 *
 * Reads GET /api/membership/state. Four render states, no fifth:
 *   loading   — says it is loading; never a placeholder status
 *   error     — says the state could not be read, and why
 *   inactive  — says there is no active membership, and the reason code
 *   active    — the real plan, amount, rail, term and limits
 *
 * Any single fact may be unknown even when active. Unknown renders as the
 * reason, in muted italic. Nothing here ever prints a status the backend does
 * not support.
 */
import { useCallback, useEffect, useState } from "react";
import "./MembershipPanel.css";

export type MembershipState = {
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
  startedAt?: string | null;
};

const COPY = {
  en: {
    eyebrow: "MEMBERSHIP",
    loading: "Reading membership state…",
    errorTitle: "Membership state unavailable",
    errorBody: "We could not read your membership from the bridge just now, so nothing is shown rather than a status we cannot vouch for. Reload in a moment; if it persists, contact support.",
    retry: "Try again",
    noneTitle: "No active membership",
    noneBody: "There is no active subscription on this workspace. If you have just paid, it can take a moment to land — and if you paid with Telegram Stars, your Telegram account must be linked for the entitlement to attach.",
    upgrade: "See plans",
    plan: "Plan", paid: "Paid", rail: "Paid with", term: "Renews", since: "Member since",
    limitsTitle: "Your limits",
    locks: "Telegram Locks", multiAdmin: "Multi-admin", audit: "Audit logs", domain: "Custom domain",
    unlimited: "Unlimited", included: "Included", notIncluded: "Not included",
    noTerm: "No renewal date on file", noAmount: "Amount not recorded", noCharge: "No charge",
    unknownPlan: "Unrecognised plan", unknownRail: "Rail not recorded", noLimits: "Allowances not on file for this plan.",
    active: "ACTIVE", trialing: "TRIAL", pastDue: "PAYMENT FAILED", ending: "ENDING",
    pastDueNote: "Your last payment did not go through. Access is still on, but it will not stay on indefinitely — please update your payment method.",
    cancelNote: "This membership is set to end at the close of the current period. It will not renew.",
    noTermNote: "This rail did not record a term, so no renewal date is shown. We will not display a date the backend cannot prove.",
    noAmountNote: "The amount was not stored alongside this subscription. Your payment provider's receipt is the authoritative record.",
    unknownPlanNote: "This subscription is active but its plan key is not one this build recognises, so its allowances are not shown. Support has been notified.",
  },
  es: {
    eyebrow: "MEMBRESÍA",
    loading: "Leyendo el estado de la membresía…",
    errorTitle: "Estado de membresía no disponible",
    errorBody: "No pudimos leer tu membresía desde el bridge en este momento, así que no mostramos nada en vez de un estado que no podemos respaldar. Recarga en un momento; si continúa, contacta a soporte.",
    retry: "Reintentar",
    noneTitle: "Sin membresía activa",
    noneBody: "No hay suscripción activa en este workspace. Si acabas de pagar, puede tardar un momento — y si pagaste con Telegram Stars, tu cuenta de Telegram debe estar vinculada para que la entitlement se adjunte.",
    upgrade: "Ver planes",
    plan: "Plan", paid: "Pagaste", rail: "Pagado con", term: "Renueva", since: "Miembro desde",
    limitsTitle: "Tus límites",
    locks: "Locks de Telegram", multiAdmin: "Multi-admin", audit: "Audit logs", domain: "Dominio propio",
    unlimited: "Ilimitados", included: "Incluido", notIncluded: "No incluido",
    noTerm: "Sin fecha de renovación registrada", noAmount: "Importe no registrado", noCharge: "Sin cargo",
    unknownPlan: "Plan no reconocido", unknownRail: "Riel no registrado", noLimits: "Límites no registrados para este plan.",
    active: "ACTIVA", trialing: "PRUEBA", pastDue: "PAGO FALLIDO", ending: "TERMINA",
    pastDueNote: "Tu último pago no se procesó. El acceso sigue activo, pero no de forma indefinida — actualiza tu método de pago.",
    cancelNote: "Esta membresía terminará al cierre del periodo actual. No se renovará.",
    noTermNote: "Este riel no registró una vigencia, así que no se muestra fecha de renovación. No mostraremos una fecha que el backend no puede comprobar.",
    noAmountNote: "El importe no se guardó junto a esta suscripción. El recibo de tu proveedor de pago es el registro autoritativo.",
    unknownPlanNote: "Esta suscripción está activa pero su plan no es uno que esta versión reconozca, así que no se muestran sus límites. Soporte ya fue notificado.",
  },
} as const;

type Props = {
  locale?: "en" | "es";
  onSeePlans?: () => void;
  /** Source of membership state. Overridable so an owner-side view can read a
   *  different org, and so previews/tests can drive each render state. */
  endpoint?: string;
};

function formatDay(iso: string | null | undefined, locale: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export function MembershipPanel({ locale = "en", onSeePlans, endpoint = "/api/membership/state" }: Props) {
  const c = COPY[locale];
  const [state, setState] = useState<MembershipState | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await fetch(endpoint, { credentials: "include" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(body?.error || `http_${res.status}`);
      setState(body.membership as MembershipState);
      setPhase("ready");
    } catch {
      // Deliberately no optimistic fallback. A failed read shows a failed read.
      setState(null);
      setPhase("error");
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  if (phase === "loading") {
    return <section className="mp" data-state="inactive"><div className="mp__loading">{c.loading}</div></section>;
  }

  if (phase === "error") {
    return (
      <section className="mp" data-state="attention">
        <div className="mp__head">
          <div>
            <div className="mp__eyebrow">{c.eyebrow}</div>
            <h2 className="mp__plan" data-unknown="true">{c.errorTitle}</h2>
          </div>
          <span className="mp__badge" data-tone="bad">ERROR</span>
        </div>
        <div className="mp__empty">
          <p>{c.errorBody}</p>
          <button type="button" className="mp__cta" onClick={() => void load()}>{c.retry}</button>
        </div>
      </section>
    );
  }

  if (!state?.entitled) {
    return (
      <section className="mp" data-state="inactive">
        <div className="mp__head">
          <div>
            <div className="mp__eyebrow">{c.eyebrow}</div>
            <h2 className="mp__plan" data-unknown="true">{c.noneTitle}</h2>
          </div>
          <span className="mp__badge" data-tone="idle">INACTIVE</span>
        </div>
        <div className="mp__empty">
          <p>{c.noneBody}</p>
          {/* The machine-readable reason, shown rather than swallowed. */}
          {state?.reason && (
            <p style={{ fontFamily: "var(--mp-mono)", fontSize: "0.6875rem", opacity: 0.75 }}>
              reason: {state.reason}
            </p>
          )}
          {onSeePlans && <button type="button" className="mp__cta" onClick={onSeePlans}>{c.upgrade}</button>}
        </div>
      </section>
    );
  }

  const badge = state.status.needsAttention
    ? { text: c.pastDue, tone: "bad" as const }
    : state.status.cancelAtPeriodEnd
      ? { text: c.ending, tone: "warn" as const }
      : state.status.raw === "trialing"
        ? { text: c.trialing, tone: "warn" as const }
        : { text: c.active, tone: "ok" as const };

  const amountText = state.amount.charged === false ? c.noCharge : state.amount.display;
  const termDay = formatDay(state.term.currentPeriodEnd, locale);
  const sinceDay = formatDay(state.startedAt, locale);

  const notes: Array<{ text: string; tone: "warn" | "bad" }> = [];
  if (state.status.needsAttention) notes.push({ text: c.pastDueNote, tone: "bad" });
  if (state.status.cancelAtPeriodEnd) notes.push({ text: c.cancelNote, tone: "warn" });
  if (!state.term.known) notes.push({ text: c.noTermNote, tone: "warn" });
  if (state.amount.charged !== false && !state.amount.display) notes.push({ text: c.noAmountNote, tone: "warn" });
  if (!state.plan.recognised) notes.push({ text: c.unknownPlanNote, tone: "warn" });

  const fact = (label: string, value: string | number | null, fallback: string) => (
    <div className="mp__fact">
      <dt>{label}</dt>
      <dd data-unknown={value == null ? "true" : "false"}>{value ?? fallback}</dd>
    </div>
  );

  return (
    <section className="mp" data-state={state.status.needsAttention ? "attention" : "active"} data-kit="fenrir">
      <div className="mp__head">
        <div>
          <div className="mp__eyebrow">{c.eyebrow}</div>
          <h2 className="mp__plan" data-unknown={state.plan.recognised ? "false" : "true"}>
            {state.plan.display ?? c.unknownPlan}
          </h2>
        </div>
        <span className="mp__badge" data-tone={badge.tone}>{badge.text}</span>
      </div>

      <dl className="mp__facts">
        {fact(c.paid, amountText, c.noAmount)}
        {fact(c.rail, state.rail.label, c.unknownRail)}
        {fact(c.term, termDay, c.noTerm)}
      </dl>

      <div className="mp__limits">
        <h3>{c.limitsTitle}</h3>
        {state.limits ? (
          <ul>
            <li data-on="true">
              <span><i className="mp__tick" />{c.locks}</span>
              <b>{state.limits.locksUnlimited ? c.unlimited : state.limits.maxTelegramLocks}</b>
            </li>
            <li data-on={String(state.limits.multiAdmin)}>
              <span><i className="mp__tick" />{c.multiAdmin}</span>
              <b>{state.limits.multiAdmin ? c.included : c.notIncluded}</b>
            </li>
            <li data-on={String(state.limits.auditLogs)}>
              <span><i className="mp__tick" />{c.audit}</span>
              <b>{state.limits.auditLogs ? c.included : c.notIncluded}</b>
            </li>
            <li data-on={String(state.limits.customDomain)}>
              <span><i className="mp__tick" />{c.domain}</span>
              <b>{state.limits.customDomain ? c.included : c.notIncluded}</b>
            </li>
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: "0.8125rem", fontStyle: "italic", color: "var(--mp-mute)" }}>{c.noLimits}</p>
        )}
        {sinceDay && (
          <p style={{ margin: "14px 0 0", fontFamily: "var(--mp-mono)", fontSize: "0.625rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--mp-mute)" }}>
            {c.since}: {sinceDay}
          </p>
        )}
      </div>

      {notes.map((n, i) => (
        <div key={i} className="mp__note" data-tone={n.tone}><p>{n.text}</p></div>
      ))}
    </section>
  );
}

export default MembershipPanel;
