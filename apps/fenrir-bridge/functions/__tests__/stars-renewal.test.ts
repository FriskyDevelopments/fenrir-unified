import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isStarsRenewal,
  isValidStarsPayment,
  isValidStarsRenewal,
  starsPaidThrough,
} from "../../workers/fenrir-stars-payments.js";

const TG = "8581086019";
const PRICE = 1150;
const order = (amount = PRICE, status = "paid") => ({ amount, status, telegram_user_id: TG });
const renewal = (over: Record<string, unknown> = {}) => ({
  invoice_payload: `fenrir_stars:${TG}:abc123`,
  currency: "XTR",
  total_amount: PRICE,
  is_recurring: true,
  telegram_payment_charge_id: "chg_2",
  ...over,
});

describe("Stars subscription renewals (month 2+)", () => {
  it("the old first-payment validator rejects a renewal — the bug", () => {
    expect(isValidStarsPayment(renewal(), order(), TG, PRICE)).toBe(false);
  });

  it("accepts a renewal of an already-paid order", () => {
    expect(isStarsRenewal(renewal())).toBe(true);
    expect(isValidStarsRenewal(renewal(), order(), TG)).toBe(true);
  });

  it("the first recurring charge is not a renewal", () => {
    expect(isStarsRenewal(renewal({ is_first_recurring: true }))).toBe(false);
    expect(isStarsRenewal({ ...renewal(), is_recurring: undefined })).toBe(false);
  });

  it("keeps honouring the price the member subscribed at (no retroactive price rise)", () => {
    expect(isValidStarsRenewal(renewal({ total_amount: 250 }), order(250), TG)).toBe(true);
  });

  it("rejects hand-made / underpaid / foreign / unpaid orders", () => {
    expect(isValidStarsRenewal(renewal({ total_amount: 5 }), order(5), TG)).toBe(false);
    expect(isValidStarsRenewal(renewal({ total_amount: 1 }), order(), TG)).toBe(false);
    expect(isValidStarsRenewal(renewal(), order(PRICE, "pending"), TG)).toBe(false);
    expect(isValidStarsRenewal(renewal(), order(), "9999")).toBe(false);
    expect(isValidStarsRenewal(renewal({ currency: "USD" }), order(), TG)).toBe(false);
    expect(isValidStarsRenewal(renewal({ invoice_payload: "evil:1" }), order(), TG)).toBe(false);
    expect(isValidStarsRenewal(renewal(), null, TG)).toBe(false);
  });

  it("paid-through date comes from Telegram when sane, else 30 days, never null", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    const in30 = Math.floor((now + 30 * 86400000) / 1000);
    expect(starsPaidThrough({ subscription_expiration_date: in30 }, now)).toBe(new Date(in30 * 1000).toISOString());
    const fallback = new Date(now + 30 * 86400000).toISOString();
    expect(starsPaidThrough({}, now)).toBe(fallback);
    expect(starsPaidThrough({ subscription_expiration_date: 1 }, now)).toBe(fallback); // past
    expect(starsPaidThrough({ subscription_expiration_date: in30 * 5 }, now)).toBe(fallback); // absurd
  });

  it("webhook routes renewals before first-payment validation and extends access", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
      "utf8",
    );
    const iRenew = src.indexOf("if (isStarsRenewal(payment))");
    const iFirst = src.indexOf("const valid = isValidStarsPayment(");
    expect(iRenew).toBeGreaterThan(0);
    expect(iRenew).toBeLessThan(iFirst);
    expect(src).toMatch(/applyStarsMembership\(env, telegramUserId, starsPaidThrough\(payment\)\)/);
    // renewals must not re-trigger the referral reward
    const block = src.slice(iRenew, iFirst);
    expect(block).not.toMatch(/recordReferralConversion/);
  });
});
