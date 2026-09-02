type OAuthProvider = "google" | "microsoft" | "apple" | "telegram";

/** OAuth, passkey, or Better Auth (`frisky`) — session cookie may reference any after sign-in. */
export type SessionProvider = OAuthProvider | "passkey" | "frisky";

export type AuthEnv = {
  SESSION_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  FRISKY_AUTH_SECRET?: string;
  FRISKY_AUTH_ENABLED?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_ADMIN_EMAILS?: string;
  AUTH?: { fetch: (request: Request) => Promise<Response> };
};

export type SessionPayload = {
  email: string;
  name: string;
  provider: SessionProvider;
  frisky_user_id: string;
  frisky_org_id: string;
  iat: number;
  exp: number;
};

const sessionCookie = "fenrir_session";
const week = 60 * 60 * 24 * 7;

export function cookieHeader(name: string, value: string, maxAge: number, domain?: string) {
  let header = `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  if (domain) {
    header += `; Domain=${domain}`;
  }
  return header;
}

export function clearCookieHeader(name: string, domain?: string) {
  let header = `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  if (domain) {
    header += `; Domain=${domain}`;
  }
  return header;
}

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export function sessionCookieName() {
  return sessionCookie;
}

/**
 * Signs a session payload for use as an authenticated session token.
 *
 * @param payload - The session data to encode and sign
 * @param env - The environment containing the session signing secret
 * @returns The encoded session payload followed by its HMAC signature
 */
export async function signSession(payload: SessionPayload, env: AuthEnv) {
  const secret = requireSecret(env.SESSION_SECRET, "SESSION_SECRET");
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(secret, encoded);
  return `${encoded}.${signature}`;
}

/**
 * Reads and validates the Fenrir session cookie from a request.
 *
 * @param env - Environment containing the session signing secret
 * @returns The decoded session payload, or `null` if the cookie is missing, invalid, or expired
 */
export async function readFenrirCookieSession(request: Request, env: AuthEnv) {
  const token = readCookie(request, sessionCookie);
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(requireSecret(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  if (!timingSafeEqual(signature, expected)) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as SessionPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function sessionFromAuthMe(body: {
  authenticated?: boolean;
  user?: { id: string; email?: string | null; name?: string | null; provider?: SessionProvider };
} | null) {
  if (!body?.authenticated || !body.user) return null;
  return createSessionPayload({
    email: body.user.email || "",
    name: body.user.name || body.user.email || "",
    provider: sessionProviderFromIdentity(body.user.provider),
    identityId: body.user.id
  });
}

async function readWorkerFenrirSession(request: Request, env: AuthEnv) {
  const headers = {
    Cookie: request.headers.get("Cookie") ?? "",
    Authorization: request.headers.get("Authorization") ?? "",
    Accept: "application/json",
  };
  if (env.AUTH?.fetch) {
    try {
      const forwarded = await env.AUTH.fetch(new Request("https://myfenrir.com/auth/me", { headers }));
      const fromBinding = await sessionFromAuthMe(await forwarded.json().catch(() => null));
      if (fromBinding) return fromBinding;
    } catch {
      // Fall through to the public Worker /auth/me (same fenrir_session cookie).
    }
  }

  const cookie = headers.Cookie;
  const bearer = headers.Authorization;
  if (!cookie.includes("fenrir_session=") && !bearer.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  try {
    const forwarded = await fetch("https://myfenrir.com/auth/me", { headers });
    return sessionFromAuthMe(await forwarded.json().catch(() => null));
  } catch {
    return null;
  }
}

/**
 * Reads the authenticated session from the Fenrir Worker cookie (fenrir_session)
 * via the AUTH service binding or public /auth/me, then the legacy payload cookie,
 * then Frisky Auth when enabled.
 */
export async function readSession(request: Request, env: AuthEnv) {
  const workerSession = await readWorkerFenrirSession(request, env);
  if (workerSession) return workerSession;

  const cookieSession = await readFenrirCookieSession(request, env);
  if (cookieSession) return cookieSession;
  const { friskyAuthEnabled, readFriskyAuthSession } = await import("./frisky-auth");
  if (!friskyAuthEnabled(env)) return null;
  return readFriskyAuthSession(request, env);
}

/**
 * Creates a session cookie containing the specified token with a one-week lifetime.
 *
 * @param token - The session token to store in the cookie
 * @param domain - The optional cookie domain
 * @returns A `Set-Cookie` header value
 */
export function sessionSetCookie(token: string, domain?: string) {
  return cookieHeader(sessionCookie, token, week, domain);
}

export function createSessionPayload(input: {
  email: string;
  name: string;
  provider: SessionProvider;
  identityId: string;
  friskyUserId?: string;
  friskyOrgId?: string;
}): SessionPayload {
  const now = Math.floor(Date.now() / 1000);
  const friskyUserId = input.friskyUserId ?? stableFriskyId("usr", input.identityId);
  return {
    email: input.email,
    name: input.name,
    provider: input.provider,
    frisky_user_id: friskyUserId,
    frisky_org_id: input.friskyOrgId ?? stableFriskyId("org", friskyUserId),
    iat: now,
    exp: now + week
  };
}

function sessionProviderFromIdentity(provider: string | undefined): SessionProvider {
  switch (provider) {
    case "google":
    case "microsoft":
    case "apple":
    case "telegram":
    case "passkey":
      return provider;
    default:
      return "google";
  }
}

function requireSecret(value: string | undefined, name: string) {
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(signature));
}

export function stableFriskyId(kind: "usr" | "org", value: string) {
  const normalized = value.trim().toLowerCase();
  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const safe = normalized.replace(/[^a-z0-9]+/g, "").toUpperCase();
  return `frisky_${kind}_${safe.slice(0, 18).padEnd(6, "X")}_${(hash >>> 0).toString(36).toUpperCase()}`;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}
