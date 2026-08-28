// Signed-cookie sessions in Workers KV. OAuth state uses a Durable Object.
// Persistent users/sessions prefer Neon (see identity.js); KV is the login
// fallback when DATABASE_URL is missing or Neon is unreachable.
import { cfg } from "./config.js";
import { randomToken, signValue, verifySignedValue } from "./crypto.js";

const SESSION_PREFIX = "session:";

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, expired = false }) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (expired) parts.push("Max-Age=0");
  else if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export async function createSession(env, user) {
  const c = cfg(env);
  const sessionId = randomToken(32);
  const now = Date.now();
  const record = {
    id: sessionId,
    user,
    createdAt: now,
    expiresAt: now + c.sessionTtl * 1000,
  };
  await env.SESSIONS.put(SESSION_PREFIX + sessionId, JSON.stringify(record), {
    expirationTtl: c.sessionTtl,
  });
  const signed = await signValue(c.sessionSecret, sessionId);
  const cookie = serializeCookie(c.cookieName, signed, {
    maxAge: c.sessionTtl,
  });
  return { sessionId, token: signed, cookie, record };
}

export async function getSession(env, request) {
  const c = cfg(env);
  if (!c.sessionSecret) return null;
  const raw = bearerToken(request) || parseCookies(request)[c.cookieName];
  if (!raw) return null;
  const sessionId = await verifySignedValue(c.sessionSecret, raw);
  if (!sessionId) return null;
  const data = await env.SESSIONS.get(SESSION_PREFIX + sessionId);
  if (!data) return null;
  try {
    const record = JSON.parse(data);
    if (record.expiresAt && record.expiresAt < Date.now()) {
      await env.SESSIONS.delete(SESSION_PREFIX + sessionId);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function destroySession(env, request) {
  const c = cfg(env);
  const raw = bearerToken(request) || parseCookies(request)[c.cookieName];
  if (raw && env.SESSIONS && c.sessionSecret) {
    const sessionId = await verifySignedValue(c.sessionSecret, raw);
    if (sessionId) await env.SESSIONS.delete(SESSION_PREFIX + sessionId);
  }
  return emptySessionCookie(env);
}

export async function saveOAuthState(env, state, payload, ttlSeconds = 600) {
  const stub = oauthStateStub(env, state);
  const response = await stub.fetch("https://oauth-state/state", {
    method: "PUT",
    body: JSON.stringify({ payload, expiresAt: Date.now() + ttlSeconds * 1000 }),
  });
  if (!response.ok) throw new Error("oauth_state_save_failed");
}

export async function consumeOAuthState(env, state) {
  if (!state) return null;
  const response = await oauthStateStub(env, state).fetch("https://oauth-state/state", {
    method: "DELETE",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("oauth_state_consume_failed");
  return response.json();
}

export function emptySessionCookie(env) {
  const c = cfg(env);
  return serializeCookie(c.cookieName, "", { expired: true });
}

function oauthStateStub(env, state) {
  if (!env.OAUTH_STATE) throw new Error("oauth_state_store_unavailable");
  return env.OAUTH_STATE.get(env.OAUTH_STATE.idFromName(state));
}
