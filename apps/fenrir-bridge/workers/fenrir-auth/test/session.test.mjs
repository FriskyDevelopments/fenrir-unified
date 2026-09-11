import { test } from "node:test";
import assert from "node:assert/strict";
import { signValue } from "../src/crypto.js";
import {
  consumeOAuthState,
  createSession,
  destroySession,
  getSession,
  parseCookies,
  saveOAuthState,
  serializeCookie,
} from "../src/session.js";

function memoryKv(initial = {}) {
  const records = new Map(Object.entries(initial));
  const puts = [];
  const deletes = [];
  return {
    records,
    puts,
    deletes,
    async put(key, value, options) {
      puts.push({ key, value, options });
      records.set(key, value);
    },
    async get(key) {
      return records.get(key) ?? null;
    },
    async delete(key) {
      deletes.push(key);
      records.delete(key);
    },
  };
}

function env(kv = memoryKv()) {
  return {
    SESSION_SECRET: "session-test-secret",
    SESSION_COOKIE_NAME: "custom_session",
    COOKIE_DOMAIN: "auth.myfenrir.com",
    SESSION_TTL_SECONDS: "120",
    SESSIONS: kv,
  };
}

test("cookie helpers preserve values containing equals signs and set hardened attributes", () => {
  const request = new Request("https://myfenrir.com/auth/me", {
    headers: { Cookie: "first=one; token=abc=def==; malformed; spaced = value " },
  });
  assert.deepEqual(parseCookies(request), { first: "one", token: "abc=def==", spaced: "value" });
  assert.equal(
    serializeCookie("fenrir_session", "signed", { domain: "myfenrir.com", maxAge: 60 }),
    "fenrir_session=signed; Path=/; Domain=myfenrir.com; HttpOnly; Secure; SameSite=Lax; Max-Age=60",
  );
});

test("KV session creation stores the requested TTL and round-trips through cookie and bearer auth", async () => {
  const kv = memoryKv();
  const configured = env(kv);
  const user = { id: "google:one", provider: "google", sub: "one" };
  const before = Date.now();
  const created = await createSession(configured, user);

  assert.equal(kv.puts.length, 1);
  assert.equal(kv.puts[0].key, `session:${created.sessionId}`);
  assert.deepEqual(kv.puts[0].options, { expirationTtl: 120 });
  assert.equal(created.record.user, user);
  assert.ok(created.record.expiresAt >= before + 120_000);
  assert.match(created.cookie, /^custom_session=/);
  assert.match(created.cookie, /Domain=auth\.myfenrir\.com/);
  assert.match(created.cookie, /Max-Age=120/);

  const cookie = created.cookie.split(";", 1)[0];
  assert.equal((await getSession(configured, new Request("https://myfenrir.com/auth/me", {
    headers: { Cookie: cookie },
  })))?.user.id, "google:one");
  assert.equal((await getSession(configured, new Request("https://myfenrir.com/auth/me", {
    headers: { Authorization: `Bearer ${created.token}` },
  })))?.user.id, "google:one");
});

test("session lookup rejects tampering, malformed records, and expired records", async () => {
  const kv = memoryKv();
  const configured = env(kv);
  const created = await createSession(configured, { id: "google:one" });

  const tampered = `${created.token.slice(0, -1)}${created.token.endsWith("A") ? "B" : "A"}`;
  assert.equal(await getSession(configured, new Request("https://myfenrir.com/auth/me", {
    headers: { Authorization: `Bearer ${tampered}` },
  })), null);

  const malformedToken = await signValue(configured.SESSION_SECRET, "malformed");
  kv.records.set("session:malformed", "not-json");
  assert.equal(await getSession(configured, new Request("https://myfenrir.com/auth/me", {
    headers: { Authorization: `Bearer ${malformedToken}` },
  })), null);

  const expiredToken = await signValue(configured.SESSION_SECRET, "expired");
  kv.records.set("session:expired", JSON.stringify({ id: "expired", expiresAt: Date.now() - 1 }));
  assert.equal(await getSession(configured, new Request("https://myfenrir.com/auth/me", {
    headers: { Authorization: `Bearer ${expiredToken}` },
  })), null);
  assert.equal(kv.records.has("session:expired"), false);
  assert.ok(kv.deletes.includes("session:expired"));
});

test("OAuth state is short-lived, consumed once, and deleted even when its payload is malformed", async () => {
  const kv = memoryKv();
  const configured = env(kv);
  await saveOAuthState(configured, "state-1", { provider: "google", returnTo: "/main" }, 45);
  assert.deepEqual(kv.puts[0].options, { expirationTtl: 45 });
  assert.deepEqual(await consumeOAuthState(configured, "state-1"), { provider: "google", returnTo: "/main" });
  assert.equal(await consumeOAuthState(configured, "state-1"), null);

  kv.records.set("oauthstate:bad", "{");
  assert.equal(await consumeOAuthState(configured, "bad"), null);
  assert.equal(kv.records.has("oauthstate:bad"), false);
  assert.equal(await consumeOAuthState(configured, ""), null);
});

test("destroySession deletes a valid KV session and always expires the configured cookie", async () => {
  const kv = memoryKv();
  const configured = env(kv);
  const created = await createSession(configured, { id: "apple:one" });
  const responseCookie = await destroySession(configured, new Request("https://myfenrir.com/auth/logout", {
    headers: { Authorization: `Bearer ${created.token}` },
  }));

  assert.equal(kv.records.has(`session:${created.sessionId}`), false);
  assert.match(responseCookie, /^custom_session=;/);
  assert.match(responseCookie, /Domain=auth\.myfenrir\.com/);
  assert.match(responseCookie, /Max-Age=0/);
});
