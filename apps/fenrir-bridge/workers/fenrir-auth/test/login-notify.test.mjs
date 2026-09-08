import assert from "node:assert/strict";
import test from "node:test";
import { authLogChatId, notifyLoginEvent, telegramBotToken } from "../src/telegram.js";

test("auth log chat id prefers FENRIR_AUTH_LOG_CHAT_ID", () => {
  assert.equal(authLogChatId({ FENRIR_AUTH_LOG_CHAT_ID: "-1004450930780" }), "-1004450930780");
  assert.equal(authLogChatId({}), "");
});

test("telegram bot token accepts prod then generic", () => {
  assert.equal(telegramBotToken({ TELEGRAM_PROD_BOT_TOKEN: "prod" }), "prod");
  assert.equal(telegramBotToken({ TELEGRAM_BOT_TOKEN: "generic" }), "generic");
  assert.equal(telegramBotToken({}), "");
});

test("notifyLoginEvent skips when unset and never throws", async () => {
  const skipped = await notifyLoginEvent({}, { provider: "google", sub: "abc12345" });
  assert.equal(skipped.skipped, true);

  const calls = [];
  const env = {
    FENRIR_AUTH_LOG_CHAT_ID: "-1004450930780",
    TELEGRAM_BOT_TOKEN: "test-token",
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response("{}", { status: 200 });
    },
  };
  // Worker runtime uses global fetch — stub it.
  const original = globalThis.fetch;
  globalThis.fetch = env.fetch;
  try {
    const result = await notifyLoginEvent(env, { provider: "google", sub: "abc12345" }, { host: "myfenrir.com" });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.telegram\.org\/bottest-token\/sendMessage/);
    assert.equal(calls[0].body.chat_id, "-1004450930780");
    assert.match(calls[0].body.text, /MyFenrir login/);
    assert.match(calls[0].body.text, /google · …2345/);
    assert.doesNotMatch(calls[0].body.text, /test-token/);
    assert.doesNotMatch(calls[0].body.text, /abc12345/);
  } finally {
    globalThis.fetch = original;
  }
});
