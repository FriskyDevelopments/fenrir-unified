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
} from "../src/session.js";
import { memorySessionAuthority } from "./session-authority.mock.mjs";

function kv(initial = {}) {
  const values = new Map(Object.entries(initial));
  const store = {
    values,
    ignoreSessionDeletes: false,
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value, options = {}) {
      values.set(key, value);
      values.set(`${key}::ttl`, options.expirationTtl ?? null);
    },
    async delete(key) {
      if (store.ignoreSessionDeletes && key.startsWith(SESSION_PREFIX)) return;
      values.delete(key);
      values.delete(`${key}::ttl`);
    },
  };
  return store;
}

function env(extra = {}) {
  return {
    SESSION_SECRET: "test-secret",
    COOKIE_DOMAIN: "myfenrir.com",
    SESSION_TTL_SECONDS: "604800",
    SESSIONS: kv(),
    SESSION_AUTHORITY: memorySessionAuthority(),
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
  assert.deepEqual((await listSessionsForUser(e, user.id)).map((row) => row.id), [sessionId]);
});

test("createSession clamps a finite sub-minimum TTL to 60 seconds", async () => {
  const e = env({ SESSION_TTL_SECONDS: "30" });
  const { sessionId, cookie, record } = await createSession(e, user);
  assert.equal(e.SESSIONS.values.get(`${SESSION_PREFIX + sessionId}::ttl`), 60);
  assert.match(cookie, /(?:^|; )Max-Age=60(?:;|$)/);
  assert.equal(record.expiresAt - record.createdAt, 60_000);
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

test("malformed session cookie is ignored during read and destroy", async () => {
  const e = env();
  const request = new Request("https://myfenrir.com/auth/me", {
    headers: { Cookie: "fenrir_session=%E0%A4%A; theme=dark" },
  });
  assert.equal(await getSession(e, request), null);
  const cleared = await destroySession(e, request);
  assert.match(cleared, /Max-Age=0/);
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

test("revokeSessionsForUser retains and revokes all 21 session ids", async () => {
  const e = env();
  for (let i = 0; i < 21; i += 1) await createSession(e, user);
  assert.equal((await listSessionsForUser(e, user.id)).length, 21);
  assert.equal(await revokeSessionsForUser(e, user.id), 21);
  assert.equal((await listSessionsForUser(e, user.id)).length, 0);
});

test("concurrent session creation does not lose user index entries", async () => {
  const e = env();
  const created = await Promise.all(Array.from({ length: 21 }, () => createSession(e, user)));
  const listedIds = new Set((await listSessionsForUser(e, user.id)).map((row) => row.id));
  assert.equal(listedIds.size, 21);
  for (const { sessionId } of created) assert.ok(listedIds.has(sessionId));
});

test("destroySession revocation rejects an eventually stale KV record", async () => {
  const e = env();
  const created = await createSession(e, user);
  e.SESSIONS.ignoreSessionDeletes = true;
  await destroySession(e, new Request("https://myfenrir.com/auth/logout", {
    headers: { Cookie: created.cookie },
  }));
  assert.ok(e.SESSIONS.values.has(SESSION_PREFIX + created.sessionId));
  assert.equal(await getSession(e, new Request("https://myfenrir.com/auth/me", {
    headers: { Cookie: created.cookie },
  })), null);
});

test("user revocation rejects all eventually stale KV records", async () => {
  const e = env();
  const created = await Promise.all([createSession(e, user), createSession(e, user)]);
  e.SESSIONS.ignoreSessionDeletes = true;
  assert.equal(await revokeSessionsForUser(e, user.id), 2);
  for (const session of created) {
    assert.ok(e.SESSIONS.values.has(SESSION_PREFIX + session.sessionId));
    assert.equal(await getSession(e, new Request("https://myfenrir.com/auth/me", {
      headers: { Cookie: session.cookie },
    })), null);
  }
});

test("missing SESSIONS binding fails closed on write", async () => {
  await assert.rejects(
    () => createSession({ SESSION_SECRET: "x" }, user),
    (err) => err instanceof SessionStoreUnavailable,
  );
});

test("missing SESSION_AUTHORITY binding fails closed on write", async () => {
  await assert.rejects(
    () => createSession({ SESSION_SECRET: "x", SESSIONS: kv() }, user),
    (err) => err instanceof SessionStoreUnavailable,
  );
});
