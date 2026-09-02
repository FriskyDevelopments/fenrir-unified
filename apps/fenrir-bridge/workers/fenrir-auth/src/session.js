// Signed-cookie sessions in Workers KV, plus short-lived OAuth state.
// Persistent users/sessions prefer Neon (see identity.js); KV is the login
// fallback when DATABASE_URL is missing or Neon is unreachable.
//
// KV key schema in namespace FENRIR_AUTH_SESSIONS (binding: SESSIONS):
//   session:<id>     JSON SessionRecord   TTL = SESSION_TTL_SECONDS
//   oauthstate:<id>  JSON OAuthState      TTL = 600s
//
// SESSION_AUTHORITY Durable Objects hold the strongly consistent active-session
// marker and complete per-user indexes. KV remains the expiring record store.
//
// Cookie fenrir_session = <sessionId>.<HMAC-SHA256(sessionId, SESSION_SECRET)>
import { cfg } from "./config.js";
import { randomToken, signValue, verifySignedValue } from "./crypto.js";

export const SESSION_PREFIX = "session:";
export const STATE_PREFIX = "oauthstate:";
export const USER_INDEX_PREFIX = "user:";

const MIN_KV_TTL = 60;
const AUTHORITY_STATUS_KEY = "status";

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

function requireAuthority(env) {
  if (
    !env?.SESSION_AUTHORITY ||
    typeof env.SESSION_AUTHORITY.idFromName !== "function" ||
    typeof env.SESSION_AUTHORITY.get !== "function"
  ) {
    throw new SessionStoreUnavailable("session_authority_unavailable");
  }
  return env.SESSION_AUTHORITY;
}

function clampTtl(seconds, fallback) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_KV_TTL, Math.floor(n));
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      // Ignore only the malformed value; other cookies may still be valid.
    }
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

async function authorityCall(env, name, payload) {
  const namespace = requireAuthority(env);
  const stub = namespace.get(namespace.idFromName(name));
  const response = await stub.fetch("https://session-authority.internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new SessionStoreUnavailable("session_authority_unavailable");
  return response.json();
}

async function activateSession(env, sessionId, expiresAt) {
  await authorityCall(env, SESSION_PREFIX + sessionId, {
    action: "activate",
    expiresAt,
  });
}

async function revokeSession(env, sessionId, expiresAt) {
  await authorityCall(env, SESSION_PREFIX + sessionId, {
    action: "revoke",
    expiresAt,
  });
}

async function sessionIsActive(env, sessionId) {
  const result = await authorityCall(env, SESSION_PREFIX + sessionId, { action: "active" });
  return result.active === true;
}

async function indexSession(env, userId, sessionId, expiresAt) {
  if (!userId) return;
  await authorityCall(env, USER_INDEX_PREFIX + userId, {
    action: "add",
    sessionId,
    expiresAt,
  });
}

async function unindexSession(env, userId, sessionId) {
  if (!userId) return;
  await authorityCall(env, USER_INDEX_PREFIX + userId, {
    action: "remove",
    sessionId,
  });
}

async function sessionIdsForUser(env, userId) {
  if (!userId) return [];
  const result = await authorityCall(env, USER_INDEX_PREFIX + userId, { action: "list" });
  return Array.isArray(result.ids) ? result.ids : [];
}

async function unindexSessions(env, userId, sessionIds) {
  if (!userId || !sessionIds.length) return;
  await authorityCall(env, USER_INDEX_PREFIX + userId, {
    action: "removeMany",
    sessionIds,
  });
}

export async function createSession(env, user, meta = {}) {
  const kv = requireKv(env);
  requireAuthority(env);
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
  try {
    await activateSession(env, sessionId, record.expiresAt);
    await indexSession(env, record.user?.id, sessionId, record.expiresAt);
  } catch (error) {
    try {
      await revokeSession(env, sessionId, record.expiresAt);
    } catch {
      // Authorization fails closed while the authority is unavailable.
    }
    await kv.delete(SESSION_PREFIX + sessionId);
    throw error;
  }
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
  if (!record.user?.id) return null;
  try {
    if (!(await sessionIsActive(env, sessionId))) return null;
  } catch {
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
      const ttl = clampTtl(c.sessionTtl, 604800);
      try {
        await revokeSession(env, sessionId, Date.now() + ttl * 1000);
      } catch {
        // Reads fail closed if the authority is unavailable; still clear KV.
      }
      const existing = await readJson(env.SESSIONS, SESSION_PREFIX + sessionId);
      await env.SESSIONS.delete(SESSION_PREFIX + sessionId);
      if (existing?.user?.id) {
        try {
          await unindexSession(env, existing.user.id, sessionId);
        } catch {
          // The expired authority entry is pruned on a later list operation.
        }
      }
    }
  }
  return emptySessionCookie(env);
}

export async function listSessionsForUser(env, userId) {
  if (!userId || !env?.SESSIONS) return [];
  let ids;
  try {
    ids = await sessionIdsForUser(env, userId);
  } catch {
    return [];
  }
  const rows = [];
  const missing = [];
  for (const id of ids) {
    const record = await getSessionById(env, id);
    if (record) rows.push(record);
    else missing.push(id);
  }
  if (missing.length) {
    try {
      await unindexSessions(env, userId, missing);
    } catch {
      // Best-effort cleanup; expired entries are ignored by the authority.
    }
  }
  return rows;
}

export async function revokeSessionsForUser(env, userId) {
  if (!userId || !env?.SESSIONS) return 0;
  const ids = await sessionIdsForUser(env, userId);
  const expiresAt = Date.now() + clampTtl(cfg(env).sessionTtl, 604800) * 1000;
  for (const id of ids) {
    await revokeSession(env, id, expiresAt);
    await env.SESSIONS.delete(SESSION_PREFIX + id);
  }
  await unindexSessions(env, userId, ids);
  // Remove an index written by worker versions predating SESSION_AUTHORITY.
  await env.SESSIONS.delete(USER_INDEX_PREFIX + userId);
  return ids.length;
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

// One instance is addressed per session and one per user. Durable Object
// storage operations serialize each index/state transition across isolates.
export class SessionAuthority {
  constructor(state) {
    this.storage = state.storage;
  }

  async sessionIds(now = Date.now()) {
    const entries = await this.storage.list({ prefix: SESSION_PREFIX });
    const ids = [];
    const expired = [];
    let nextExpiry = Infinity;
    for (const [key, expiresAt] of entries) {
      const expiry = Number(expiresAt);
      if (expiry > now) {
        ids.push(key.slice(SESSION_PREFIX.length));
        nextExpiry = Math.min(nextExpiry, expiry);
      } else expired.push(key);
    }
    if (expired.length) await this.storage.delete(expired);
    if (Number.isFinite(nextExpiry)) await this.storage.setAlarm(nextExpiry);
    else await this.storage.deleteAlarm();
    return ids;
  }

  async scheduleExpiry(expiresAt) {
    const current = await this.storage.getAlarm();
    if (current == null || expiresAt < current) await this.storage.setAlarm(expiresAt);
  }

  async alarm() {
    const status = await this.storage.get(AUTHORITY_STATUS_KEY);
    if (status) {
      const expiresAt = Number(status.expiresAt);
      if (expiresAt > Date.now()) await this.storage.setAlarm(expiresAt);
      else await this.storage.deleteAll();
      return;
    }
    await this.sessionIds();
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const now = Date.now();
    switch (input?.action) {
      case "activate":
      case "revoke": {
        const expiresAt = Number(input.expiresAt);
        if (!Number.isFinite(expiresAt)) {
          return Response.json({ error: "invalid_expiry" }, { status: 400 });
        }
        await this.storage.put(AUTHORITY_STATUS_KEY, {
          active: input.action === "activate",
          expiresAt,
        });
        await this.scheduleExpiry(expiresAt);
        return Response.json({ ok: true });
      }
      case "active": {
        const status = await this.storage.get(AUTHORITY_STATUS_KEY);
        if (!status || Number(status.expiresAt) <= now) {
          if (status) await this.storage.delete(AUTHORITY_STATUS_KEY);
          return Response.json({ active: false });
        }
        return Response.json({ active: status.active === true });
      }
      case "add": {
        if (!input.sessionId || !Number.isFinite(Number(input.expiresAt))) {
          return Response.json({ error: "invalid_session" }, { status: 400 });
        }
        const expiresAt = Number(input.expiresAt);
        await this.storage.put(SESSION_PREFIX + input.sessionId, expiresAt);
        await this.scheduleExpiry(expiresAt);
        return Response.json({ ok: true });
      }
      case "remove":
        if (input.sessionId) await this.storage.delete(SESSION_PREFIX + input.sessionId);
        return Response.json({ ok: true });
      case "removeMany": {
        const ids = Array.isArray(input.sessionIds) ? input.sessionIds.filter(Boolean) : [];
        if (ids.length) await this.storage.delete(ids.map((id) => SESSION_PREFIX + id));
        return Response.json({ ok: true });
      }
      case "list":
        return Response.json({ ids: await this.sessionIds(now) });
      default:
        return Response.json({ error: "unknown_action" }, { status: 400 });
    }
  }
}
