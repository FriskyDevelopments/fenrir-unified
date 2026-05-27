import type { BillingEnv } from "./billing-env";
import { requireEnv } from "./billing-env";

export type PaidPlanKey = "starter" | "pro" | "operator";
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

export function priceIdForPaidPlan(env: BillingEnv, plan: PaidPlanKey): string {
  if (plan === "starter") return requireEnv(env.STRIPE_STARTER_PRICE_ID, "STRIPE_STARTER_PRICE_ID");
  if (plan === "pro") return requireEnv(env.STRIPE_PRO_PRICE_ID, "STRIPE_PRO_PRICE_ID");
  return requireEnv(env.STRIPE_OPERATOR_PRICE_ID, "STRIPE_OPERATOR_PRICE_ID");
}

export function paidPlanFromStripePriceId(env: BillingEnv, priceId: string): PaidPlanKey | null {
  if (!priceId) return null;
  if (env.STRIPE_STARTER_PRICE_ID && priceId === env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (env.STRIPE_PRO_PRICE_ID && priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
  if (env.STRIPE_OPERATOR_PRICE_ID && priceId === env.STRIPE_OPERATOR_PRICE_ID) return "operator";
  return null;
}

export function normalizePaidPlanKey(input: unknown): PaidPlanKey | null {
  if (typeof input !== "string") return null;
  const p = input.trim().toLowerCase();
  if (p === "starter") return "starter";
  if (p === "pro") return "pro";
  if (p === "operator") return "operator";
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
  const plan = row.plan;
  if (plan !== "starter" && plan !== "pro" && plan !== "operator") return "free";
  if (status === "active" || status === "trialing" || status === "past_due") return plan;
  return "free";
}
