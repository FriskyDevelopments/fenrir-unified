import { describe, expect, it } from "vitest";
import {
  effectiveBillingPlanFromRow,
  isSellablePlan,
  limitsForPlan,
  normalizePaidPlanKey,
  paidPlanFromStripePriceId,
  priceIdForPaidPlan,
} from "../_lib/plan-catalog";

// Regression cover for the production defect where every MyFenrir Pack
// entitlement resolved to "free" on www.myfenrir.com.
//
// The Community Bridge rails (Stripe card, Telegram Stars, NOWPayments,
// courtesy grants) all write plan='standard' into the shared D1 table
// `billing_subscriptions`. fenrir-bridge's plan catalog only knew
// starter/pro/operator, so effectiveBillingPlanFromRow() dropped those rows on
// the floor and the paying member saw the free tier.

const LIVE_PACK_PRICES = {
  founderMonthly: "price_1U45nNLxUF54S071oRPYXOec", // US$14.99/mo
  founderAnnual: "price_1U4bO5LxUF54S071qvkmFT0V", // US$149.90/yr
  packStandard: "price_1U45nILxUF54S0711UZbCg9d", // US$19.99/mo
  founderGoLive: "price_1U44coLxUF54S071p2EP0H93", // US$15/mo
};

describe("The Pack (plan='standard') is a first-class paid plan", () => {
  it("resolves an active Pack row to a paid plan, not free", () => {
    expect(effectiveBillingPlanFromRow({ plan: "standard", status: "active" })).toBe("standard");
  });

  it("honours the real courtesy rows already live in D1", () => {
    // Both rows in production carry plan='standard', status='active'.
    expect(effectiveBillingPlanFromRow({ plan: "standard", status: "active" })).not.toBe("free");
  });

  it("keeps grace statuses paid and terminal statuses free", () => {
    expect(effectiveBillingPlanFromRow({ plan: "standard", status: "trialing" })).toBe("standard");
    expect(effectiveBillingPlanFromRow({ plan: "standard", status: "past_due" })).toBe("standard");
    expect(effectiveBillingPlanFromRow({ plan: "standard", status: "canceled" })).toBe("free");
  });

  it("still rejects unknown plan values", () => {
    expect(effectiveBillingPlanFromRow({ plan: "bogus", status: "active" })).toBe("free");
    expect(effectiveBillingPlanFromRow(null)).toBe("free");
  });

  it("grants the full Pack entitlement surface", () => {
    expect(limitsForPlan("standard")).toEqual({
      maxTelegramLocks: null,
      maxFenrirSubdomains: null,
      customDomainSupported: true,
      liveRoomsSupported: true,
      multiAdminWorkflows: true,
      auditLogScope: "full",
    });
  });

  it("accepts 'standard' from Stripe metadata", () => {
    expect(normalizePaidPlanKey("standard")).toBe("standard");
    expect(normalizePaidPlanKey("STANDARD")).toBe("standard");
  });

  it("maps every live Pack price id back to the standard plan", () => {
    for (const [label, priceId] of Object.entries(LIVE_PACK_PRICES)) {
      expect(paidPlanFromStripePriceId({}, priceId), label).toBe("standard");
    }
  });
});

describe("The Pack is not sellable from fenrir-bridge", () => {
  it("marks standard as not sellable here", () => {
    expect(isSellablePlan("standard")).toBe(false);
    expect(isSellablePlan("pro")).toBe(true);
  });

  it("refuses to price standard rather than silently charging the operator price", () => {
    const env = { STRIPE_OPERATOR_PRICE_ID: "price_operator_legacy" };
    expect(() => priceIdForPaidPlan(env, "standard")).toThrow(/plan_not_sellable_here/);
    expect(priceIdForPaidPlan(env, "operator")).toBe("price_operator_legacy");
  });
});
