import { describe, expect, it } from "vitest";
import {
  OWNER_GATE_LIMIT,
  STANDARD_GATE_LIMIT,
  gateQuota,
} from "../../../community-bridge/src/lib/gate-limits";
import {
  isValidFoundersStripeSession,
  isValidStarsPayment,
} from "../../workers/fenrir-stars-payments.js";

const userId = "11111111-1111-4111-8111-111111111111";

function stripeSession(overrides: Record<string, unknown> = {}) {
  return {
    payment_status: "paid",
    mode: "subscription",
    client_reference_id: userId,
    currency: "usd",
    amount_total: 1499,
    subscription: "sub_founder_pack",
    metadata: {
      frisky_org_id: userId,
      frisky_user_id: userId,
      plan: "standard",
      offer: "founder_forever",
      billing_period: "monthly",
    },
    ...overrides,
  };
}

describe("Community Bridge Standard billing validation", () => {
  it("accepts only the exact paid Stripe offer bound to the signed-in user", () => {
    expect(isValidFoundersStripeSession(stripeSession(), userId, userId)).toBe(true);
    expect(
      isValidFoundersStripeSession(stripeSession({ amount_total: 1500 }), userId, userId),
    ).toBe(false);
    expect(
      isValidFoundersStripeSession(
        stripeSession({ amount_total: 14990, metadata: { ...stripeSession().metadata, billing_period: "annual" } }),
        userId,
        userId,
      ),
    ).toBe(true);
    expect(
      isValidFoundersStripeSession(stripeSession({ currency: "eur" }), userId, userId),
    ).toBe(false);
    expect(
      isValidFoundersStripeSession(
        stripeSession(),
        "22222222-2222-4222-8222-222222222222",
        userId,
      ),
    ).toBe(false);
  });

  it("accepts Stars only for the pending invoice owner and exact XTR amount", () => {
    const order = { status: "pending", telegram_user_id: "8379", amount: 1150 };
    const payment = {
      invoice_payload: "fenrir_stars:8379:nonce",
      currency: "XTR",
      total_amount: 1150,
    };
    expect(isValidStarsPayment(payment, order, "8379")).toBe(true);
    expect(isValidStarsPayment(payment, order, "9999")).toBe(false);
    expect(isValidStarsPayment({ ...payment, total_amount: 250 }, order, "8379")).toBe(false);
    expect(isValidStarsPayment(payment, { ...order, status: "paid" }, "8379")).toBe(false);
  });
});

describe("Community Bridge Gate limits", () => {
  it("requires membership from Gate 1", () => {
    expect(gateQuota(0, false, false)).toMatchObject({
      limit: 0,
      canCreate: false,
      profileType: "unpaid",
      activeCommunityLimit: 0,
    });
  });

  it("limits Standard to 5 Gates in one active community", () => {
    expect(STANDARD_GATE_LIMIT).toBe(5);
    expect(gateQuota(4, false, true)).toMatchObject({
      remaining: 1,
      canCreate: true,
      activeCommunityLimit: 1,
    });
    expect(gateQuota(5, false, true).canCreate).toBe(false);
  });

  it("limits Owner to 20 Gates across multiple communities", () => {
    expect(OWNER_GATE_LIMIT).toBe(20);
    expect(gateQuota(19, true, true)).toMatchObject({
      remaining: 1,
      canCreate: true,
      profileType: "owner",
      activeCommunityLimit: null,
    });
    expect(gateQuota(20, true, true).canCreate).toBe(false);
  });
});
