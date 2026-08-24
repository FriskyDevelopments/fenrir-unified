import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { courtesyRedeemReply, redeemDeepLinkCode } from "../../workers/fenrir-stars-payments.js";

const WORKER_SRC = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);

/**
 * Five places ended in "now go type a command". The worst was /connect: the
 * operator has just left Telegram's admin screen, and the last thing they read
 * before the flow dies is the name of a word they have to remember.
 *
 * Every command still works. The button is never the only way in.
 */
describe("no dead end asks for a retyped command", () => {
  it("stops naming a command as the way to recover", () => {
    for (const dead of [
      "then run /connect again",
      "Run /connect to retry",
      "then run /redeem again",
      "send /link to me",
      "Run /connect inside the Telegram group",
    ]) {
      expect(WORKER_SRC).not.toContain(dead);
    }
  });

  it("keeps every typed command alive", () => {
    // Routed through commandForThisBot, which honours the @botname suffix.
    for (const cmd of ["connect", "redeem", "link"]) {
      expect(WORKER_SRC).toContain(`commandForThisBot(text, "${cmd}"`);
    }
    // These two are matched by intent, not by the command router.
    expect(WORKER_SRC).toContain("function statusIntent(text)");
    expect(WORKER_SRC).toContain("/^\\/status\\b/i.test(text)");
    expect(WORKER_SRC).toContain("/^\\/subscribe\\b/i.test(text)");
  });
});

describe("connect recovers with a tap", () => {
  const HELPER = WORKER_SRC.slice(
    WORKER_SRC.indexOf("function connectResultReply("),
    WORKER_SRC.indexOf("async function sendPayRails("),
  );

  it("offers retry only where retrying can actually work", () => {
    // Recoverable by the person reading the message.
    for (const reason of ["bot_permissions_missing", "sync_failed", "telegram_identity_not_linked"]) {
      const at = HELPER.indexOf(reason);
      expect(HELPER.slice(at, at + 320)).toContain("connectRetryKeyboard");
    }
    // Not recoverable by tapping: a missing server secret, or a screening
    // decision. A button here would invite someone to tap forever.
    for (const reason of ["sync_not_configured", "screening_blocked", "not_a_group"]) {
      const at = HELPER.indexOf(reason);
      expect(HELPER.slice(at, at + 200)).not.toContain("connectRetryKeyboard");
    }
  });

  it("judges the tapper, not whoever the button is attached to", () => {
    const at = WORKER_SRC.indexOf('if (query.data === "fenrir_connect")');
    expect(at).toBeGreaterThan(-1);
    // syncVerifiedTelegramDestination checks the actor is a chat admin, so the
    // actor must be the person who tapped.
    expect(WORKER_SRC.slice(at, at + 500)).toContain("from: query.from");
  });

  it("shares one wording between the command and the auto-trigger", () => {
    expect(WORKER_SRC.split("connectResultReply(env, result)").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("still names nobody when screening blocks a group", () => {
    const at = HELPER.indexOf("screening_blocked");
    expect(HELPER.slice(at, at + 200)).toContain("could not verify this group");
  });
});

describe("redeem is one tap", () => {
  it("reads the code out of the deep link", () => {
    expect(redeemDeepLinkCode("/start redeem_ReXzuZHwYx63")).toBe("ReXzuZHwYx63");
    expect(redeemDeepLinkCode("/start@Myfenrir_bot redeem_ReXzuZHwYx63")).toBe("ReXzuZHwYx63");
  });

  it("ignores anything that is not a redeem link", () => {
    expect(redeemDeepLinkCode("/start")).toBeNull();
    expect(redeemDeepLinkCode("/start fenrir_stars")).toBeNull();
    expect(redeemDeepLinkCode("/start redeem_")).toBeNull();
  });

  it("is handled ABOVE menuIntent, like every other /start payload", () => {
    // menuIntent matches /^\/(start|menu|help)\b/ and swallows the payload. The
    // Stars deep link already learned this the hard way.
    const redeemGuard = WORKER_SRC.indexOf("const deepLinkCode = redeemDeepLinkCode(text);");
    const menuGuard = WORKER_SRC.indexOf("if (menuIntent(text)) {");
    expect(redeemGuard).toBeGreaterThan(-1);
    expect(redeemGuard).toBeLessThan(menuGuard);
  });

  it("words the outcome once, for both the tap and the typed command", () => {
    expect(courtesyRedeemReply({ ok: true, durationDays: 182, courtesyUntil: "2027-02-22T00:00:00.000Z" }))
      .toContain("2027-02-22");
    // Invalid / expired / already-used stay indistinguishable.
    const generic = "That code could not be redeemed. Check it and try again, or contact MyFenrir support.";
    expect(courtesyRedeemReply({ ok: false, reason: "generic" })).toBe(generic);
    expect(courtesyRedeemReply({ ok: false, reason: "whatever" })).toBe(generic);
    expect(courtesyRedeemReply({ ok: false, reason: "rate_limited" })).toMatch(/wait a few minutes/);
  });
});
