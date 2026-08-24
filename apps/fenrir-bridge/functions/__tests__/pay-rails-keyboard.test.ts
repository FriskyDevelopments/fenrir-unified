import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { payRailsKeyboard, payRailsText } from "../../workers/fenrir-stars-payments.js";

const WORKER_SRC = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);

/**
 * The bot used to answer 'Say "buy" and I'll show you the three ways to pay.'
 * Making someone guess and type a word before they may hand over money is
 * friction invented for nothing; Telegram has inline keyboards for exactly this.
 */
describe("paying is a tap, not a password", () => {
  it("no longer asks anyone to type a magic word", () => {
    expect(WORKER_SRC).not.toContain('Say “buy”');
    expect(WORKER_SRC).not.toContain('Say "buy"');
  });

  it("offers all three rails as buttons", () => {
    const rows = payRailsKeyboard().inline_keyboard;
    expect(rows).toHaveLength(3);
    expect(rows.flat().every((b) => "url" in b || "callback_data" in b)).toBe(true);
  });

  it("puts card first — the price canon, not cosmetics", () => {
    const [card, stars, crypto] = payRailsKeyboard().inline_keyboard.flat();
    expect(card.text).toMatch(/Card/);
    expect(stars.text).toMatch(/Stars/);
    expect(crypto.text).toMatch(/Crypto/);
  });

  it("completes Stars in-chat and sends the other two where those rails live", () => {
    const [card, stars, crypto] = payRailsKeyboard().inline_keyboard.flat();
    // Stars is the only rail that can finish inside Telegram.
    expect(stars).toMatchObject({ callback_data: "fenrir_subscribe" });
    expect(card.url).toContain("communities.myfenrir.com/upgrade");
    expect(crypto.url).toContain("communities.myfenrir.com/upgrade");
    // Distinguishable destinations, so the page can act on the choice later.
    expect(card.url).not.toBe(crypto.url);
  });

  it("shows the same list price on every rail", () => {
    const [card, , crypto] = payRailsKeyboard().inline_keyboard.flat();
    expect(card.text).toContain("$14.99");
    expect(crypto.text).toContain("$14.99");
  });

  it("quotes the crypto fee as money, never as a percentage", () => {
    for (const spanish of [false, true]) {
      const copy = payRailsText(spanish);
      expect(copy).toContain("$14.99");
      expect(copy).toContain("$0.75");
      expect(copy).not.toContain("%");
      expect(copy).toMatch(/NOWPayments/);
    }
  });

  it("never describes the crypto price as higher than list", () => {
    expect(payRailsText(false)).toMatch(/the same price/i);
    expect(payRailsText(true)).toMatch(/el mismo precio/i);
  });
});

describe("the typed commands still work", () => {
  it("keeps /subscribe and /unlock going straight to the Stars box", () => {
    expect(WORKER_SRC).toContain('/^\\/subscribe\\b/i.test(text) || /^\\/unlock\\b/i.test(text)');
  });

  it("sends a generic 'I want to pay' to the choice, not to one rail", () => {
    const idx = WORKER_SRC.indexOf("if (paymentIntent(text)) {");
    expect(idx).toBeGreaterThan(-1);
    const branch = WORKER_SRC.slice(idx, idx + 700);
    expect(branch).toContain("sendPayRails");
    // ...but only for someone who actually needs to buy.
    expect(branch).toContain("alreadyIn");
  });

  it("stamps the Stars order with the tapper, not the bot", () => {
    // query.message.from is the BOT on a button attached to a bot message.
    const idx = WORKER_SRC.indexOf('if (query.data === "fenrir_subscribe")');
    expect(WORKER_SRC.slice(idx, idx + 900)).toContain("from: query.from");
  });
});
