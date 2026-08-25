import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isStarsDeepLink } from "../../workers/fenrir-stars-payments.js";

const WORKER_SRC = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);

/**
 * Regression: clicking "Pay with Telegram Stars" on /upgrade answered with the
 * Community control onboarding card and never opened the payment box.
 *
 * pack-rails.tsx sends the operator to t.me/<bot>?start=fenrir_stars, which
 * Telegram delivers as the message "/start fenrir_stars". menuIntent() matches
 * /^\/(start|menu|help)\b/ — it swallows EVERY /start regardless of payload — so
 * the branch that is checked FIRST wins. The Stars branch used to live further
 * down next to /subscribe, i.e. below menuIntent, so it was unreachable for the
 * deep link: the menu replied and returned.
 *
 * Nothing about entitlement was involved. An account showing "The Pack · active"
 * hit the same onboarding card as a free one — the cause was routing order.
 */
describe("Stars deep link from the /upgrade rail", () => {
  it("recognises what Telegram actually delivers for ?start=fenrir_stars", () => {
    expect(isStarsDeepLink("/start fenrir_stars")).toBe(true);
    expect(isStarsDeepLink("/start@Myfenrir_bot fenrir_stars")).toBe(true);
  });

  it("does not fire on a bare /start or an unrelated payload", () => {
    expect(isStarsDeepLink("/start")).toBe(false);
    expect(isStarsDeepLink("/start gate")).toBe(false);
    expect(isStarsDeepLink("/start ref_ABC123")).toBe(false);
    expect(isStarsDeepLink("/menu")).toBe(false);
  });

  it("collides with menuIntent — which is exactly why order matters", () => {
    // Same predicate menuIntent() uses. If this ever stops matching, the
    // ordering guard below is no longer load-bearing and can be revisited.
    expect(/^\/(start|menu|help)\b/i.test("/start fenrir_stars")).toBe(true);
  });

  it("checks the Stars deep link BEFORE the menu branch in the webhook", () => {
    const starsGuard = WORKER_SRC.indexOf("if (isStarsDeepLink(text)) {");
    const menuGuard = WORKER_SRC.indexOf("if (menuIntent(text)) {");

    expect(starsGuard).toBeGreaterThan(-1);
    expect(menuGuard).toBeGreaterThan(-1);
    // The whole bug in one assertion: menu first == no invoice, ever.
    expect(starsGuard).toBeLessThan(menuGuard);
  });

  it("still sends the Stars invoice with Telegram's required subscription clock", () => {
    // XTR + a 30-day subscription_period. Without subscription_period Telegram
    // charges once while the copy promises "$14.99/month".
    expect(WORKER_SRC).toContain('currency: "XTR"');
    expect(WORKER_SRC).toContain("subscription_period: 2592000");
  });
});
