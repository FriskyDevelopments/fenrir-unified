// Signed-cookie sessions in Workers KV, plus short-lived OAuth state.
// Persistent users/sessions prefer Neon (see identity.js); KV is the login
// fallback when DATABASE_URL is missing or Neon is unreachable.
import { cfg } from "./config.js";
import { randomToken, signValue, verifySignedValue } from "./crypto.js";

const SESSION_PREFIX = "session:";
const STATE_PREFIX = "oauthstate:";

/**
 * Parses cookies from an HTTP request.
 * @param {Request} request - The request containing the `Cookie` header.
 * @returns {Object<string, string>} A map of cookie names to values.
 */
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

/**
 * Builds a secure, HTTP-only session cookie string.
 * @param {string} name - The cookie name.
 * @param {string} value - The cookie value.
 * @param {Object} options - Cookie configuration.
 * @param {string} options.domain - The cookie domain.
 * @param {number} [options.maxAge] - The cookie lifetime in seconds.
 * @param {boolean} [options.expired=false] - Whether to expire the cookie immediately.
 * @return {string} The serialized cookie header value.
 */
export function serializeCookie(name, value, { domain, maxAge, expired = false }) {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Domain=${domain}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (expired) parts.push("Max-Age=0");
  else if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

/**
 * Extracts a bearer token from an authorization header.
 * @param {Request} request - The request containing the authorization header.
 * @return {string|null} The trimmed bearer token, or `null` if the header is missing or does not use the bearer scheme.
 */
function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/**
 * Creates a signed session for a user and stores it with a configured expiration.
 * @param {object} user - The user data associated with the session.
 * @returns {Promise<object>} Session metadata containing the session ID, signed token, cookie, and record.
 */
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
    domain: c.cookieDomain,
    maxAge: c.sessionTtl,
  });
  return { sessionId, token: signed, cookie, record };
}

/**
 * Retrieves the authenticated session associated with a bearer token or session cookie.
 * @param {Object} env - The environment containing session configuration and storage.
 * @param {Request} request - The incoming request.
 * @return {Promise<Object|null>} The session record, or `null` when credentials are missing, invalid, expired, or unavailable.
 */
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

/**
 * Destroys the session associated with the request and creates an expired session cookie.
 * @param {object} env - The environment containing session configuration and storage.
 * @param {Request} request - The request containing the session bearer token or cookie.
 * @return {string} An expired session cookie.
 */
export async function destroySession(env, request) {
  const c = cfg(env);
  const raw = bearerToken(request) || parseCookies(request)[c.cookieName];
  if (raw && env.SESSIONS && c.sessionSecret) {
    const sessionId = await verifySignedValue(c.sessionSecret, raw);
    if (sessionId) await env.SESSIONS.delete(SESSION_PREFIX + sessionId);
  }
  return emptySessionCookie(env);
}

/**
 * Stores OAuth state data for a limited period.
 * @param {object} env - The runtime environment containing the sessions KV namespace.
 * @param {string} state - The OAuth state identifier.
 * @param {*} payload - The data associated with the OAuth state.
 * @param {number} [ttlSeconds=600] - The storage lifetime in seconds.
 */
export async function saveOAuthState(env, state, payload, ttlSeconds = 600) {
  await env.SESSIONS.put(STATE_PREFIX + state, JSON.stringify(payload), {
    expirationTtl: ttlSeconds,
  });
}

/**
 * Retrieves and consumes temporary OAuth state data.
 * @param {string} state - The OAuth state identifier.
 * @returns {Object|null} The parsed OAuth state payload, or `null` if the state is missing or invalid.
 */
export async function consumeOAuthState(env, state) {
  if (!state) return null;
  const data = await env.SESSIONS.get(STATE_PREFIX + state);
  if (!data) return null;
  await env.SESSIONS.delete(STATE_PREFIX + state);
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Creates an expired cookie for the configured session.
 * @param {Object} env - The environment containing session cookie configuration.
 * @return {string} The serialized expired session cookie.
 */
export function emptySessionCookie(env) {
  const c = cfg(env);
  return serializeCookie(c.cookieName, "", { domain: c.cookieDomain, expired: true });
}
