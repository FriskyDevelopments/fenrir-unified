import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isValidFoundersStripeSession } from "../../workers/fenrir-stars-payments.js";

const WORKER_SRC = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);

const ORG = "frisky_org_FRISKYUSRSUPABASE9_15G0AZO";
const USER = "frisky_usr_SUPABASE91140E8441_KVALRI";

function session(overrides: Record<string, unknown> = {}) {
  return {
    mode: "subscription",
    payment_status: "paid",
    currency: "usd",
    client_reference_id: ORG,
    amount_subtotal: 1499,
    amount_total: 1499,
    subscription: "sub_live_123",
    metadata: {
      frisky_org_id: ORG,
      frisky_user_id: USER,
      plan: "standard",
      offer: "founder_forever",
      billing_period: "monthly",
    },
    ...overrides,
  };
}

/**
 * The card rail used to insert `'active', NULL` into current_period_end. The
 * entitlement check treats a NULL expiry as active forever, so every card
 * subscriber held a perpetual licence that outlived cancellation.
 */
describe("card rail writes Stripe's own expiry", () => {
  it("never binds a NULL current_period_end anywhere in the worker", () => {
    expect(WORKER_SRC).not.toContain("'active', NULL");
    expect(WORKER_SRC).not.toContain('"active", NULL');
  });

  it("takes the period end from Stripe, not from a computed clock", () => {
    const fn = WORKER_SRC.slice(
      WORKER_SRC.indexOf("function stripeSubscriptionPeriodEnd("),
      WORKER_SRC.indexOf("async function upsertStripeSubscriptionRow("),
    );
    // Both API shapes: legacy subscription-level and newer item-level.
    expect(fn).toContain("subscription?.current_period_end");
    expect(fn).toContain("subscription.items.data.map((item) => item?.current_period_end)");
    // Never NULL, even when the payload shape surprises us.
    expect(fn).toContain("stripe_subscription_missing_period_end");
  });

  it("handles the renewal and cancellation events", () => {
    for (const type of [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
    ]) {
      expect(WORKER_SRC).toContain(type);
    }
    // Cancellation ends the row, it does not remove it.
    expect(WORKER_SRC).toContain("SET status = 'canceled', updated_at = ?");
  });

  it("only creates a row for a subscription carrying Pack metadata", () => {
    const fn = WORKER_SRC.slice(WORKER_SRC.indexOf("async function upsertStripeSubscriptionRow("));
    expect(fn).toContain('normalizeText(subscription?.metadata?.plan) !== "standard"');
  });
});

/**
 * Checkout has always had allow_promotion_codes:"true", but the validator
 * compared amount_total — the post-discount charge. A redeemed code therefore
 * produced a real subscription that this guard rejected, and a 100%-off coupon
 * (the 6-month promo) would have granted nothing at all.
 */
describe("promotion codes survive checkout validation", () => {
  it("accepts a full-price monthly session", () => {
    expect(isValidFoundersStripeSession(session(), USER, ORG)).toBe(true);
  });

  it("accepts a 100%-off session: subtotal is list price, nothing to charge", () => {
    const free = session({
      amount_total: 0,
      amount_subtotal: 1499,
      payment_status: "no_payment_required",
    });
    expect(isValidFoundersStripeSession(free, USER, ORG)).toBe(true);
  });

  it("accepts a partially discounted session", () => {
    expect(
      isValidFoundersStripeSession(session({ amount_total: 749, amount_subtotal: 1499 }), USER, ORG),
    ).toBe(true);
  });

  it("still rejects a session bought at some other list price", () => {
    // price_1U45nI… ($19.99) exists on the same product but is NOT The Pack.
    expect(
      isValidFoundersStripeSession(session({ amount_subtotal: 1999, amount_total: 1999 }), USER, ORG),
    ).toBe(false);
  });

  it("still rejects a session belonging to another account", () => {
    expect(isValidFoundersStripeSession(session(), USER, "frisky_org_SOMEONE_ELSE")).toBe(false);
  });

  it("still rejects an unsettled session", () => {
    expect(
      isValidFoundersStripeSession(session({ payment_status: "unpaid" }), USER, ORG),
    ).toBe(false);
  });

  it("accepts the annual list price", () => {
    const annual = session({
      amount_subtotal: 14990,
      amount_total: 14990,
      metadata: { ...session().metadata, billing_period: "annual" },
    });
    expect(isValidFoundersStripeSession(annual, USER, ORG)).toBe(true);
  });
});
