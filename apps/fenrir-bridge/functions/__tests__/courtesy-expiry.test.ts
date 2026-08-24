import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WORKER_SRC = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);

/** The INSERT ... INTO billing_subscriptions statement inside a named function. */
function subscriptionInsertIn(fnName: string): string {
  const start = WORKER_SRC.indexOf(`async function ${fnName}(`);
  if (start < 0) throw new Error(`${fnName} not found`);
  const body = WORKER_SRC.slice(start, start + 4000);
  const insert = body.indexOf("INSERT INTO billing_subscriptions");
  if (insert < 0) throw new Error(`no billing_subscriptions insert in ${fnName}`);
  return body.slice(insert, insert + 900);
}

/**
 * The rule that matters: an access check treats `current_period_end IS NULL` as
 * active forever. Any rail that writes NULL hands out a perpetual licence.
 *
 * This already shipped once on the Stars rail. These assertions pin the rails
 * that were fixed so it cannot silently come back.
 */
describe("courtesy grant expiry", () => {
  it("writes an explicit current_period_end, never NULL", () => {
    const src = WORKER_SRC.slice(
      WORKER_SRC.indexOf("async function redeemCourtesyCode("),
      WORKER_SRC.indexOf("async function handleCourtesyGenerate("),
    );

    // The duration comes from the code's own duration_days, and the value bound
    // into current_period_end is that computed date.
    expect(src).toContain("const courtesyUntil = new Date(Date.now() + durationDays * 864e5).toISOString()");
    expect(src).toMatch(/current_period_end = excluded\.current_period_end/);
    expect(src).toContain("courtesyUntil, now, now");

    // The literal NULL that caused the perpetual-licence bug must not appear in
    // this rail's insert.
    const insert = src.slice(src.indexOf("INSERT INTO billing_subscriptions"));
    expect(insert).not.toContain("'active', NULL");
  });

  it("offers 182 days as the canonical six-month window", () => {
    expect(WORKER_SRC).toContain("const COURTESY_DURATION_DAYS = [30, 90, 180, 182];");
    // Same number the crypto ladder uses for `half`, so both rails agree.
    expect(WORKER_SRC).toContain("half: { amount: 74.99, days: 182");
  });

  it("keeps the crypto and Stars rails on explicit dates too", () => {
    expect(subscriptionInsertIn("handleNowPaymentsIpn")).not.toContain("'active', NULL");
    expect(WORKER_SRC).toContain("const STARS_PERIOD_DAYS = 30;");
  });

  it("single use: redemption is one guarded UPDATE, not check-then-write", () => {
    const src = WORKER_SRC.slice(WORKER_SRC.indexOf("async function redeemCourtesyCode("));
    expect(src).toContain("SET status = 'used'");
    expect(src).toContain("AND status = 'unused'");
    expect(src).toContain("RETURNING duration_days");
    // Who redeemed it, and when.
    expect(src).toContain("redeemed_by_telegram_user_id = ?1");
    expect(src).toContain("redeemed_at = ?2");
  });
});
