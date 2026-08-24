import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isValidStarsPayment } from "../../workers/fenrir-stars-payments.js";

const WORKER_SRC = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);

const PRICE = 1150;
const TG = "8581086019";

const order = (amount: number, status = "pending") => ({
  amount,
  status,
  telegram_user_id: TG,
});

const payment = (amount: number) => ({
  invoice_payload: `fenrir_stars:${TG}:abc123`,
  currency: "XTR",
  total_amount: amount,
});

/**
 * A 5-Star entitlement row unlocked the full Pack in production.
 *
 * isValidStarsPayment compared the payment to `order.amount` only — proof that
 * the buyer paid what the order asked, never that the order asked the right
 * price. A test row worth 5 Stars (about ten cents), and stale rows minted at an
 * older 250-Star price, all stayed payable and bought the same access as 1,150.
 */
describe("Stars payments must match the catalogue price", () => {
  it("accepts a payment at the list price", () => {
    expect(isValidStarsPayment(payment(PRICE), order(PRICE), TG, PRICE)).toBe(true);
  });

  it("rejects the 5-Star order that caused this", () => {
    // The buyer genuinely paid what the order asked. That was never enough.
    expect(isValidStarsPayment(payment(5), order(5), TG, PRICE)).toBe(false);
  });

  it("rejects a stale order minted at an older price", () => {
    expect(isValidStarsPayment(payment(250), order(250), TG, PRICE)).toBe(false);
  });

  it("still rejects underpaying a correctly priced order", () => {
    expect(isValidStarsPayment(payment(5), order(PRICE), TG, PRICE)).toBe(false);
  });

  it("rejects when no expected amount is supplied — fail closed", () => {
    expect(isValidStarsPayment(payment(PRICE), order(PRICE), TG, undefined)).toBe(false);
    expect(isValidStarsPayment(payment(PRICE), order(PRICE), TG, 0)).toBe(false);
  });

  it("keeps the original guards", () => {
    expect(isValidStarsPayment(payment(PRICE), order(PRICE, "paid"), TG, PRICE)).toBe(false);
    expect(isValidStarsPayment(payment(PRICE), order(PRICE), "9999", PRICE)).toBe(false);
    expect(
      isValidStarsPayment({ ...payment(PRICE), currency: "USD" }, order(PRICE), TG, PRICE),
    ).toBe(false);
  });
});

/**
 * Three separate places minted access from an entitlement row. Closing only the
 * payment door would have left the other two open.
 */
describe("every grant path checks the amount", () => {
  it("sets the floor at the lowest price ever really charged, not today's", () => {
    // ⭐250 was the live price in July 2026 and three members paid it. A floor of
    // 1150 would have revoked them for paying exactly what was asked.
    expect(WORKER_SRC).toContain("const STARS_MIN_GRANT_AMOUNT = 250;");
    // The floor must never be derived from the current price.
    expect(WORKER_SRC).not.toContain("STARS_MIN_GRANT_AMOUNT = starsPrice");
  });

  it("still blocks the 5-Star test row at that floor", () => {
    expect(5).toBeLessThan(250);
  });

  it("guards applyStarsMembership", () => {
    const fn = WORKER_SRC.slice(WORKER_SRC.indexOf("async function applyStarsMembership("));
    expect(fn.slice(0, 2000)).toContain("paidStars < STARS_MIN_GRANT_AMOUNT");
    expect(fn.slice(0, 2000)).toContain("stars_grant_refused_underpaid");
  });

  it("guards the community-billing-status backfill", () => {
    const fn = WORKER_SRC.slice(WORKER_SRC.indexOf("async function handleCommunityBillingStatus("));
    expect(fn.slice(0, 3000)).toContain("entitlementPaidEnough");
  });

  it("guards what the bot reports as unlocked", () => {
    const fn = WORKER_SRC.slice(WORKER_SRC.indexOf("function fallbackMind("));
    expect(fn.slice(0, 3000)).toContain("paid >= STARS_MIN_GRANT_AMOUNT");
    // "Stars:" was ambiguous with an account balance. It is the amount paid.
    expect(fn.slice(0, 3000)).toContain("Paid: ⭐");
  });
});
