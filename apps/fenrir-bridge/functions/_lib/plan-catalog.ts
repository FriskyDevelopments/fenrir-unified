import type { BillingEnv } from "./billing-env";
import { requireEnv } from "./billing-env";

// "standard" is The Pack — the plan the MyFenrir Community Bridge and the
// Telegram Stars / NOWPayments rails actually write into billing_subscriptions
// (see workers/fenrir-stars-payments.js, which hardcodes plan='standard').
// It was missing here, so every Pack entitlement — including the live courtesy
// grants already in D1 — fell through effectiveBillingPlanFromRow() and
// resolved to "free" on www.myfenrir.com. Keep it first-class.
export type PaidPlanKey = "starter" | "pro" | "operator" | "standard";
export type BillingPlanKey = "free" | PaidPlanKey;

export type PlanLimits = {
  maxTelegramLocks: number | null;
  maxFenrirSubdomains: number | null;
  customDomainSupported: boolean;
  liveRoomsSupported: boolean;
  multiAdminWorkflows: boolean;
  auditLogScope: "none" | "standard" | "full";
};

export function limitsForPlan(plan: BillingPlanKey): PlanLimits {
  switch (plan) {
    case "free":
      return {
        maxTelegramLocks: 1,
        maxFenrirSubdomains: 1,
        customDomainSupported: false,
        liveRoomsSupported: false,
        multiAdminWorkflows: false,
        auditLogScope: "none"
      };
    case "starter":
      return {
        maxTelegramLocks: 3,
        maxFenrirSubdomains: null,
        customDomainSupported: false,
        liveRoomsSupported: true,
        multiAdminWorkflows: false,
        auditLogScope: "standard"
      };
    case "pro":
      return {
        maxTelegramLocks: 10,
        maxFenrirSubdomains: null,
        customDomainSupported: true,
        liveRoomsSupported: true,
        multiAdminWorkflows: false,
        auditLogScope: "standard"
      };
    // The Pack ($14.99/mo por comunidad enlazada): locks sin tope numérico,
    // flujos multi-admin, audit logs y dominio propio — per FENRIR_STARS_DESCRIPTION
    // in wrangler.fenrir-stars.toml. Same entitlement surface as `operator`.
    //
    // `maxTelegramLocks: null` significa "sin tope numérico en este plan", NO
    // una promesa de cantidad. La copy nunca lo describe como una cifra sin
    // límite: con precio por comunidad enlazada esa promesa es falsa y es
    // reembolso seguro. La guardia canónica está en
    // workers/fenrir-stars-payments.js.
    //
    // `operator` se conserva aquí a propósito: es un plan RETIRADO de la oferta
    // que sigue existiendo en cuentas y registros antiguos. Se apaga la venta,
    // no el dato: quitar el case dejaría esas cuentas cayendo a `free` y
    // perdiendo derechos que sí pagaron.
    case "standard":
    case "operator":
      return {
        maxTelegramLocks: null,
        maxFenrirSubdomains: null,
        customDomainSupported: true,
        liveRoomsSupported: true,
        multiAdminWorkflows: true,
        auditLogScope: "full"
      };
    default:
      return limitsForPlan("free");
  }
}

/**
 * Plans this app can sell directly. "standard" (The Pack) is deliberately NOT
 * here: that rail is owned by the fenrir-stars-payments Worker, which holds the
 * live Pack price IDs. Selling it from here too would create a second, divergent
 * checkout against the same live Stripe account.
 */
export const SELLABLE_PLANS = ["starter", "pro", "operator"] as const;
export type SellablePlanKey = (typeof SELLABLE_PLANS)[number];

export function isSellablePlan(plan: PaidPlanKey): plan is SellablePlanKey {
  return (SELLABLE_PLANS as readonly string[]).includes(plan);
}

export function priceIdForPaidPlan(env: BillingEnv, plan: PaidPlanKey): string {
  if (plan === "starter") return requireEnv(env.STRIPE_STARTER_PRICE_ID, "STRIPE_STARTER_PRICE_ID");
  if (plan === "pro") return requireEnv(env.STRIPE_PRO_PRICE_ID, "STRIPE_PRO_PRICE_ID");
  if (plan === "operator") return requireEnv(env.STRIPE_OPERATOR_PRICE_ID, "STRIPE_OPERATOR_PRICE_ID");
  // Never silently fall through to the operator price for an unsellable plan —
  // that would charge the wrong amount for The Pack.
  throw new Error(`plan_not_sellable_here:${plan}`);
}

export function paidPlanFromStripePriceId(env: BillingEnv, priceId: string): PaidPlanKey | null {
  if (!priceId) return null;
  if (env.STRIPE_STARTER_PRICE_ID && priceId === env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (env.STRIPE_PRO_PRICE_ID && priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
  if (env.STRIPE_OPERATOR_PRICE_ID && priceId === env.STRIPE_OPERATOR_PRICE_ID) return "operator";
  if (PACK_PRICE_IDS.has(priceId)) return "standard";
  return null;
}

/**
 * Live MyFenrir Pack prices (product prod_V4D26u7h9K3ibN). Mirrors the ids
 * hardcoded in workers/fenrir-stars-payments.js handleFoundersCheckout so that
 * a Pack subscription arriving on this app's webhook resolves to a plan instead
 * of logging stripe_subscription_unresolved_plan and granting nothing.
 */
const PACK_PRICE_IDS = new Set([
  "price_1U45nNLxUF54S071oRPYXOec", // Founder Deal — US$14.99/month
  "price_1U4bO5LxUF54S071qvkmFT0V", // Founder Deal — US$149.90/year
  "price_1U45nILxUF54S0711UZbCg9d", // Pack standard — US$19.99/month
  "price_1U44coLxUF54S071p2EP0H93"  // Founder go-live — US$15/month
]);

export function normalizePaidPlanKey(input: unknown): PaidPlanKey | null {
  if (typeof input !== "string") return null;
  const p = input.trim().toLowerCase();
  if (p === "starter") return "starter";
  if (p === "pro") return "pro";
  if (p === "operator") return "operator";
  if (p === "standard") return "standard";
  return null;
}

/** Accept UI / JSON labels like "Starter", "PRO", etc. */
export function coercePaidPlanFromLabel(label: string): PaidPlanKey | null {
  return normalizePaidPlanKey(label);
}

export function assertPaidPlanMetadata(value: string): PaidPlanKey | null {
  return normalizePaidPlanKey(value);
}

type SubscriptionRow = { plan: string; status: string } | null;

export function effectiveBillingPlanFromRow(row: SubscriptionRow): BillingPlanKey {
  if (!row) return "free";
  const status = row.status;
  const plan = normalizePaidPlanKey(row.plan);
  if (!plan) return "free";
  if (status === "active" || status === "trialing" || status === "past_due") return plan;
  return "free";
}
