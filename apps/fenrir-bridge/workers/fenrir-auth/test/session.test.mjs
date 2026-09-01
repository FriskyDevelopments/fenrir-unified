import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  getSession,
  destroySession,
  saveOAuthState,
  consumeOAuthState,
  listSessionsForUser,
  revokeSessionsForUser,
  SessionStoreUnavailable,
  SESSION_PREFIX,
  STATE_PREFIX,
  USER_INDEX_PREFIX,
} from "../src/session.js";

function kv(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value, options = {}) {
      values.set(key, value);
      values.set(`${key}::ttl`, options.expirationTtl ?? null);
    },
    async delete(key) {
      values.delete(key);
      values.delete(`${key}::ttl`);
    },
  };
}

function env(extra = {}) {
  return {
    SESSION_SECRET: "test-secret",
    COOKIE_DOMAIN: "myfenrir.com",
    SESSION_TTL_SECONDS: "604800",
    SESSIONS: kv(),
    ...extra,
  };
}

const user = {
  id: "google:abc",
  provider: "google",
  sub: "abc",
  email: "ada@myfenrir.com",
  name: "Ada",
};

test("createSession writes session + user index with TTL", async () => {
  const e = env();
  const { sessionId, cookie, token, record } = await createSession(e, user, {
    userAgent: "fenrir-test",
    ip: "203.0.113.9",
  });
  assert.equal(record.backend, "kv");
  assert.equal(record.user.email, "ada@myfenrir.com");
  assert.equal(record.ip, "203.0.113.9");
  assert.match(cookie, /^fenrir_session=/);
  assert.match(cookie, /Domain=myfenrir.com/);
  assert.equal(typeof token, "string");
  assert.ok(e.SESSIONS.values.has(SESSION_PREFIX + sessionId));
  assert.equal(e.SESSIONS.values.get(`${SESSION_PREFIX + sessionId}::ttl`), 604800);
  const index = JSON.parse(e.SESSIONS.values.get(USER_INDEX_PREFIX + user.id));
  assert.deepEqual(index, [sessionId]);
});

test("getSession resolves cookie and Bearer token", async () => {
  const e = env();
  const { cookie, token } = await createSession(e, user);
  const fromCookie = await getSession(e, new Request("https://myfenrir.com/auth/me", {
    headers: { Cookie: cookie },
  }));
  const fromBearer = await getSession(e, new Request("https://myfenrir.com/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  }));
  assert.equal(fromCookie.user.id, "google:abc");
  assert.equal(fromBearer.user.id, "google:abc");
});

test("destroySession deletes KV row and clears cookie", async () => {
  const e = env();
  const { cookie, sessionId } = await createSession(e, user);
  const cleared = await destroySession(e, new Request("https://myfenrir.com/auth/logout", {
    headers: { Cookie: cookie },
  }));
  assert.match(cleared, /Max-Age=0/);
  assert.equal(e.SESSIONS.values.has(SESSION_PREFIX + sessionId), false);
  const again = await getSession(e, new Request("https://myfenrir.com/auth/me", {
    headers: { Cookie: cookie },
  }));
  assert.equal(again, null);
});

test("OAuth state is single-use", async () => {
  const e = env();
  await saveOAuthState(e, "st_1", { provider: "google", returnTo: "/main" }, 600);
  assert.equal(e.SESSIONS.values.get(`${STATE_PREFIX}st_1::ttl`), 600);
  const first = await consumeOAuthState(e, "st_1");
  const second = await consumeOAuthState(e, "st_1");
  assert.equal(first.provider, "google");
  assert.equal(second, null);
});

test("revokeSessionsForUser wipes every ticket for that identity", async () => {
  const e = env();
  await createSession(e, user);
  await createSession(e, user);
  const listed = await listSessionsForUser(e, user.id);
  assert.equal(listed.length, 2);
  const revoked = await revokeSessionsForUser(e, user.id);
  assert.equal(revoked, 2);
  assert.equal((await listSessionsForUser(e, user.id)).length, 0);
});

test("missing SESSIONS binding fails closed on write", async () => {
  await assert.rejects(
    () => createSession({ SESSION_SECRET: "x" }, user),
    (err) => err instanceof SessionStoreUnavailable,
  );
});
