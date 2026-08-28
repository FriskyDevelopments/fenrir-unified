// Short-lived OAuth state in Workers KV. Persistent users/sessions live in Neon.
import { cfg } from "./config.js";

const STATE_PREFIX = "oauthstate:";

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

export async function saveOAuthState(env, state, payload, ttlSeconds = 600) {
  await env.SESSIONS.put(STATE_PREFIX + state, JSON.stringify(payload), {
    expirationTtl: ttlSeconds,
  });
}

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

export function emptySessionCookie(env) {
  const c = cfg(env);
  return serializeCookie(c.cookieName, "", { domain: c.cookieDomain, expired: true });
}
