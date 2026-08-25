import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { alreadyActiveText } from "../../workers/fenrir-stars-payments.js";

const WORKER_SRC = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);

const RESOLVER = WORKER_SRC.slice(
  WORKER_SRC.indexOf("async function resolveBotAccess("),
  WORKER_SRC.indexOf("async function applyStarsMembership("),
);

/**
 * The bot was selling The Pack to the person who owns Fenrir.
 *
 * It decided who to pitch from getEntitlement alone — one table,
 * telegram_stars_entitlements, keyed by Telegram id. Courtesy grants, crypto and
 * card subscriptions all live in billing_subscriptions under a minted
 * frisky_org_* id, and the bot never looked there. Same two-identifier-spaces
 * split that made the web app demand an upgrade from a paying member.
 */
describe("nobody who already has access gets sold to", () => {
  it("checks ownership before it checks any payment row", () => {
    const ownerCheck = RESOLVER.indexOf("isOwner(env, id)");
    const entitlementRead = RESOLVER.indexOf("getEntitlement(env, id)");
    const subscriptionRead = RESOLVER.indexOf("FROM billing_subscriptions");

    expect(ownerCheck).toBeGreaterThan(-1);
    // An owner is an owner whether or not they ever paid. Voiding a stale test
    // payment must never turn the owner back into a prospect.
    expect(ownerCheck).toBeLessThan(entitlementRead);
    expect(ownerCheck).toBeLessThan(subscriptionRead);
  });

  it("looks past the Stars table to every other rail", () => {
    expect(RESOLVER).toContain("FROM billing_subscriptions");
    expect(RESOLVER).toContain("telegram_identity_links");
    expect(RESOLVER).toContain("status IN ('active','trialing','past_due')");
  });

  it("refuses to read a missing end date as access", () => {
    // The perpetual-licence bug has shipped twice already.
    expect(RESOLVER).toContain("bot_access_row_without_period_end");
    expect(RESOLVER).toContain("> Date.now()");
  });

  it("still requires a credible amount for the Stars rail", () => {
    expect(RESOLVER).toContain("paid >= STARS_MIN_GRANT_AMOUNT");
  });

  it("gates the pitch and the payment buttons on resolved access", () => {
    expect(WORKER_SRC).toContain('const alreadyIn = entitlement?.status === "active";');
    // Both selling surfaces are conditioned, not removed: someone who genuinely
    // needs to buy still gets the three rails.
    expect(WORKER_SRC).toContain("sendPayRails");
    expect(WORKER_SRC).toContain("payRailsKeyboard()");
  });

  it("resolves access for both bot entry points, not just one", () => {
    // Messages and inline-button taps must agree about who has access.
    const uses = WORKER_SRC.split("resolveBotAccess(env,").length - 1;
    expect(uses).toBeGreaterThanOrEqual(2);
  });
});

describe("what an owner is told instead of a price", () => {
  it("never mentions paying or subscribing", () => {
    for (const spanish of [false, true]) {
      const copy = alreadyActiveText({ access_source: "owner" }, spanish);
      expect(copy).not.toContain("$14.99");
      expect(copy).not.toMatch(/subscri/i);
      expect(copy).toMatch(spanish ? /dueño/i : /own/i);
    }
  });

  it("tells a courtesy or paid member when their access runs out", () => {
    const copy = alreadyActiveText(
      { access_source: "subscription", until: "2027-02-16T00:00:00.000Z" },
      false,
    );
    expect(copy).toContain("2027-02-16");
    expect(copy).toMatch(/nothing to pay/i);
  });

  it("does not invent an end date when there is none", () => {
    expect(alreadyActiveText({ access_source: "owner" }, false)).not.toMatch(/through/i);
  });
});
