// Signed-cookie sessions in Workers KV, plus short-lived OAuth state.
// Persistent users/sessions prefer Neon (see identity.js); KV is the login
// fallback when DATABASE_URL is missing or Neon is unreachable.
//
// Key schema in namespace FENRIR_AUTH_SESSIONS (binding: SESSIONS):
//   session:<id>     JSON SessionRecord   TTL = SESSION_TTL_SECONDS
//   oauthstate:<id>  JSON OAuthState      TTL = 600s
//   user:<userId>    JSON string[]        TTL = SESSION_TTL_SECONDS
//
// Cookie fenrir_session = <sessionId>.<HMAC-SHA256(sessionId, SESSION_SECRET)>
import { cfg } from "./config.js";
import { randomToken, signValue, verifySignedValue } from "./crypto.js";

export const SESSION_PREFIX = "session:";
export const STATE_PREFIX = "oauthstate:";
export const USER_INDEX_PREFIX = "user:";

const MIN_KV_TTL = 60;

export class SessionStoreUnavailable extends Error {
  constructor(message = "session_store_unavailable") {
    super(message);
    this.name = "SessionStoreUnavailable";
  }
}

function requireKv(env) {
  if (!env?.SESSIONS || typeof env.SESSIONS.put !== "function") {
    throw new SessionStoreUnavailable();
  }
  return env.SESSIONS;
}

function clampTtl(seconds, fallback) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < MIN_KV_TTL) return fallback;
  return Math.floor(n);
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeCookie(name, value, { domain, maxAge, expired = false }) {
  const encoded = expired ? "" : encodeURIComponent(value);
  const parts = [
    `${name}=${encoded}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (domain) parts.splice(2, 0, `Domain=${domain}`);
  if (expired) parts.push("Max-Age=0");
  else if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

function publicUser(user) {
  if (!user || typeof user !== "object") return user;
  return {
    id: user.id,
    provider: user.provider,
    sub: user.sub,
    email: user.email ?? null,
    email_verified: Boolean(user.email_verified),
    name: user.name ?? null,
    picture: user.picture ?? null,
  };
}

async function readJson(kv, key) {
  const data = await kv.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function indexSession(kv, userId, sessionId, ttl) {
  if (!userId) return;
  const key = USER_INDEX_PREFIX + userId;
  const existing = (await readJson(kv, key)) || [];
  const next = Array.isArray(existing) ? existing.filter((id) => id !== sessionId) : [];
  next.push(sessionId);
  await kv.put(key, JSON.stringify(next.slice(-20)), { expirationTtl: ttl });
}

async function unindexSession(kv, userId, sessionId, ttl) {
  if (!userId) return;
  const key = USER_INDEX_PREFIX + userId;
  const existing = (await readJson(kv, key)) || [];
  if (!Array.isArray(existing) || !existing.includes(sessionId)) return;
  const next = existing.filter((id) => id !== sessionId);
  if (!next.length) {
    await kv.delete(key);
    return;
  }
  await kv.put(key, JSON.stringify(next), { expirationTtl: ttl });
}

export async function createSession(env, user, meta = {}) {
  const kv = requireKv(env);
  const c = cfg(env);
  if (!c.sessionSecret) throw new Error("session_secret_missing");
  const sessionId = randomToken(32);
  const now = Date.now();
  const ttl = clampTtl(c.sessionTtl, 604800);
  const record = {
    id: sessionId,
    user: publicUser(user),
    createdAt: now,
    expiresAt: now + ttl * 1000,
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
    backend: "kv",
  };
  await kv.put(SESSION_PREFIX + sessionId, JSON.stringify(record), {
    expirationTtl: ttl,
  });
  await indexSession(kv, record.user?.id, sessionId, ttl);
  const signed = await signValue(c.sessionSecret, sessionId);
  const cookie = serializeCookie(c.cookieName, signed, {
    domain: c.cookieDomain,
    maxAge: ttl,
  });
  return { sessionId, token: signed, cookie, record };
}

export async function readSessionToken(env, request) {
  const c = cfg(env);
  if (!c.sessionSecret) return null;
  const raw = bearerToken(request) || parseCookies(request)[c.cookieName];
  if (!raw) return null;
  return verifySignedValue(c.sessionSecret, raw);
}

export async function getSession(env, request) {
  const c = cfg(env);
  if (!c.sessionSecret || !env?.SESSIONS) return null;
  const sessionId = await readSessionToken(env, request);
  if (!sessionId) return null;
  return getSessionById(env, sessionId);
}

export async function getSessionById(env, sessionId) {
  if (!sessionId || !env?.SESSIONS) return null;
  const record = await readJson(env.SESSIONS, SESSION_PREFIX + sessionId);
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < Date.now()) {
    await env.SESSIONS.delete(SESSION_PREFIX + sessionId);
    return null;
  }
  return record;
}

export async function destroySession(env, request) {
  const c = cfg(env);
  const raw = bearerToken(request) || parseCookies(request)[c.cookieName];
  if (raw && env?.SESSIONS && c.sessionSecret) {
    const sessionId = await verifySignedValue(c.sessionSecret, raw);
    if (sessionId) {
      const existing = await readJson(env.SESSIONS, SESSION_PREFIX + sessionId);
      await env.SESSIONS.delete(SESSION_PREFIX + sessionId);
      if (existing?.user?.id) {
        await unindexSession(
          env.SESSIONS,
          existing.user.id,
          sessionId,
          clampTtl(c.sessionTtl, 604800),
        );
      }
    }
  }
  return emptySessionCookie(env);
}

export async function listSessionsForUser(env, userId) {
  if (!userId || !env?.SESSIONS) return [];
  const ids = (await readJson(env.SESSIONS, USER_INDEX_PREFIX + userId)) || [];
  if (!Array.isArray(ids) || !ids.length) return [];
  const rows = [];
  for (const id of ids) {
    const record = await getSessionById(env, id);
    if (record) rows.push(record);
  }
  return rows;
}

export async function revokeSessionsForUser(env, userId) {
  if (!userId || !env?.SESSIONS) return 0;
  const ids = (await readJson(env.SESSIONS, USER_INDEX_PREFIX + userId)) || [];
  if (!Array.isArray(ids) || !ids.length) {
    await env.SESSIONS.delete(USER_INDEX_PREFIX + userId);
    return 0;
  }
  let revoked = 0;
  for (const id of ids) {
    await env.SESSIONS.delete(SESSION_PREFIX + id);
    revoked += 1;
  }
  await env.SESSIONS.delete(USER_INDEX_PREFIX + userId);
  return revoked;
}

export async function saveOAuthState(env, state, payload, ttlSeconds = 600) {
  const kv = requireKv(env);
  if (!state) throw new Error("oauth_state_missing");
  const ttl = clampTtl(ttlSeconds, 600);
  await kv.put(STATE_PREFIX + state, JSON.stringify(payload), {
    expirationTtl: ttl,
  });
}

export async function consumeOAuthState(env, state) {
  if (!state || !env?.SESSIONS) return null;
  const data = await env.SESSIONS.get(STATE_PREFIX + state);
  if (!data) return null;
  await env.SESSIONS.delete(STATE_PREFIX + state);
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function emptySessionCookie(env) {
  const c = cfg(env);
  return serializeCookie(c.cookieName, "", { domain: c.cookieDomain, expired: true });
}
