/**
 * Authentik OIDC — Community Bridge identity boundary (server-only).
 *
 * The Community Bridge login boundary must be ONE Authentik organization,
 * independent of MyFenrir/FriskyDev, shared by every Gate. This module
 * implements authorization code + PKCE (S256), a signed `state` that binds the
 * original Gate slug + community, `nonce` binding, issuer/audience/signature
 * validation of the returned id_token, and a first-party HttpOnly session
 * cookie signed with AUTHENTIK_SESSION_SECRET.
 *
 * The client secret and session secret never reach the browser. Nothing here
 * imports or reuses the shared Supabase client or the MyFenrir SSO handoff.
 *
 * Inert until configured: `isAuthentikConfigured()` is false (and every
 * stateful entry point throws `authentik_not_configured`) until all
 * AUTHENTIK_* secrets are present, so this can be deployed ahead of IdP
 * provisioning without changing runtime behaviour.
 */

// ── Configuration ──────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  "AUTHENTIK_ISSUER",
  "AUTHENTIK_CLIENT_ID",
  "AUTHENTIK_CLIENT_SECRET",
  "AUTHENTIK_REDIRECT_URI",
  "AUTHENTIK_SESSION_SECRET",
] as const;

export function isAuthentikConfigured(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]?.trim()));
}

function requiredEnv(name: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`authentik_not_configured: set ${name}`);
  return value;
}

// ── base64url + JSON (no Node Buffer, no global btoa/atob dependency) ─────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = B64.indexOf(padded[i]!);
    const c1 = B64.indexOf(padded[i + 1]!);
    const c2 = padded[i + 2] === "=" ? -1 : B64.indexOf(padded[i + 2]!);
    const c3 = padded[i + 3] === "=" ? -1 : B64.indexOf(padded[i + 3]!);
    if (c0 < 0 || c1 < 0) continue;
    const n = (c0 << 18) | (c1 << 12) | ((c2 & 63) << 6) | (c3 & 63);
    bytes.push((n >> 16) & 255);
    if (c2 !== -1) bytes.push((n >> 8) & 255);
    if (c3 !== -1) bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}

function encodeJsonBase64Url(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJsonBase64Url<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

/** Text → bytes typed as ArrayBuffer-backed so they satisfy `BufferSource`. */
function encodeText(input: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(input) as Uint8Array<ArrayBuffer>;
}

// ── Random + HMAC-SHA256 (session/state signing key) ──────────────────────

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomToken(byteLength = 32): string {
  const bytes = randomBytes(byteLength);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

let hmacKeyPromise: Promise<CryptoKey> | null = null;

function sessionHmacKey(): Promise<CryptoKey> {
  if (!hmacKeyPromise) {
    const secret = encodeText(requiredEnv("AUTHENTIK_SESSION_SECRET"));
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return hmacKeyPromise;
}

async function sign(value: string): Promise<string> {
  const key = await sessionHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encodeText(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySignature(value: string, signature: string): Promise<boolean> {
  try {
    const key = await sessionHmacKey();
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      encodeText(value),
    );
  } catch {
    return false;
  }
}

// ── PKCE (S256) ────────────────────────────────────────────────────────────

export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  // 43 random bytes → 86 hex chars: within RFC 7636's 43–128 ASCII range.
  const verifier = randomToken(43);
  const digest = await crypto.subtle.digest("SHA-256", encodeText(verifier));
  const challenge = bytesToBase64Url(new Uint8Array(digest));
  return { verifier, challenge };
}

// ── OIDC discovery ─────────────────────────────────────────────────────────

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
}

let discoveryPromise: Promise<OidcDiscovery> | null = null;

export function discover(): Promise<OidcDiscovery> {
  if (!discoveryPromise) {
    const issuer = requiredEnv("AUTHENTIK_ISSUER").replace(/\/+$/, "");
    discoveryPromise = (async () => {
      const response = await fetch(`${issuer}/.well-known/openid-configuration`);
      if (!response.ok) throw new Error(`authentik_discovery_failed: HTTP ${response.status}`);
      const doc = (await response.json().catch(() => null)) as Partial<OidcDiscovery> | null;
      if (!doc?.authorization_endpoint || !doc?.token_endpoint || !doc?.jwks_uri) {
        throw new Error("authentik_discovery_failed: incomplete openid-configuration");
      }
      return {
        issuer: doc.issuer ?? issuer,
        authorization_endpoint: doc.authorization_endpoint,
        token_endpoint: doc.token_endpoint,
        jwks_uri: doc.jwks_uri,
        userinfo_endpoint: doc.userinfo_endpoint,
      };
    })();
  }
  return discoveryPromise;
}

// ── Signed OIDC state (binds Gate slug + community, rejects tampering) ────

export interface OidcState {
  slug: string | null;
  community_id: string | null;
  brand_id: string | null;
  next: string | null;
  nonce: string;
  exp: number;
}

// Human verification can legitimately move a member through ALTCHA and one
// fallback before the IdP returns the authorization code. Keep the signed
// OIDC request alive for that complete interaction; it is still single-use
// and bound to the HttpOnly verifier cookie at the callback.
export const OAUTH_FLOW_MAX_AGE = 1800; // 30 minutes

export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return null;
  return next;
}

/**
 * Always lands back on the exact Gate the visitor started from. Only the
 * signed, tamper-proof `slug`/`next` from the OIDC state may drive the
 * redirect — external destinations are rejected here and at state creation.
 */
export function resolveDestination(state: OidcState): string {
  if (state.slug) return `/g/${encodeURIComponent(state.slug)}`;
  const next = safeNext(state.next);
  if (next) return next;
  return "/dashboard";
}

export async function createState(input: {
  slug?: string | null;
  community_id?: string | null;
  brand_id?: string | null;
  next?: string | null;
}): Promise<{ state: string; nonce: string }> {
  const nonce = randomToken(24);
  const payload: OidcState = {
    slug: input.slug ?? null,
    community_id: input.community_id ?? null,
    brand_id: input.brand_id ?? null,
    next: safeNext(input.next),
    nonce,
    exp: Math.floor(Date.now() / 1000) + OAUTH_FLOW_MAX_AGE,
  };
  const encoded = encodeJsonBase64Url(payload);
  const signature = await sign(encoded);
  return { state: `${encoded}.${signature}`, nonce };
}

export async function verifyState(state: string): Promise<OidcState | null> {
  const dot = state.lastIndexOf(".");
  if (dot < 1) return null;
  const encoded = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  if (!(await verifySignature(encoded, signature))) return null;
  try {
    const payload = decodeJsonBase64Url<OidcState>(encoded);
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    if (typeof payload.nonce !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Community session (HttpOnly, signed) ───────────────────────────────────

export const SESSION_COOKIE = "cb_session";
export const OAUTH_COOKIE = "cb_oauth";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // seconds

export interface CommunityIdentity {
  sub: string;
  /** Persistent Community ownership key resolved from `sub` (see community-identity). */
  user_id: string | null;
  email: string | null;
  name: string | null;
  iss: string;
  community_id: string | null;
  brand_id: string | null;
  exp: number;
}

export async function encodeSession(identity: CommunityIdentity): Promise<string> {
  const encoded = encodeJsonBase64Url(identity);
  const signature = await sign(encoded);
  return `${encoded}.${signature}`;
}

export async function decodeSession(token: string): Promise<CommunityIdentity | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!(await verifySignature(encoded, signature))) return null;
  try {
    const identity = decodeJsonBase64Url<CommunityIdentity>(encoded);
    if (!identity.sub) return null;
    if (typeof identity.exp !== "number" || identity.exp < Date.now() / 1000) return null;
    return identity;
  } catch {
    return null;
  }
}

// ── OAuth flow cookie (PKCE verifier + nonce held server-side) ────────────

export interface OauthFlow {
  code_verifier: string;
  nonce: string;
  state: string;
  exp: number;
}

export async function encodeOauthFlow(flow: OauthFlow): Promise<string> {
  const encoded = encodeJsonBase64Url(flow);
  const signature = await sign(encoded);
  return `${encoded}.${signature}`;
}

export async function decodeOauthFlow(token: string): Promise<OauthFlow | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!(await verifySignature(encoded, signature))) return null;
  try {
    const flow = decodeJsonBase64Url<OauthFlow>(encoded);
    if (!flow.code_verifier || !flow.nonce || !flow.state) return null;
    if (typeof flow.exp !== "number" || flow.exp < Date.now() / 1000) return null;
    return flow;
  } catch {
    return null;
  }
}

// ── Cookie serialization (self-contained; no cookie-es dependency) ────────

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  let header = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) header += `; Max-Age=${options.maxAge}`;
  if (options.path) header += `; Path=${options.path}`;
  if (options.httpOnly) header += "; HttpOnly";
  if (options.secure) header += "; Secure";
  if (options.sameSite) {
    header += `; SameSite=${options.sameSite[0]!.toUpperCase()}${options.sameSite.slice(1)}`;
  }
  return header;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

// ── Token exchange (authorization code + PKCE) ────────────────────────────

export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<{ idToken: string | null; accessToken: string | null }> {
  const config = await discover();
  const clientId = requiredEnv("AUTHENTIK_CLIENT_ID");
  const clientSecret = requiredEnv("AUTHENTIK_CLIENT_SECRET");
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: requiredEnv("AUTHENTIK_REDIRECT_URI"),
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
  });

  type TokenBody = { id_token?: string; access_token?: string; error?: string };
  const requestToken = async (headers: HeadersInit = {}) => {
    const response = await fetch(config.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...headers,
      },
      body: params.toString(),
    });
    const raw = await response.text();
    const body = (() => {
      try {
        return JSON.parse(raw) as TokenBody;
      } catch {
        return null;
      }
    })();
    return { response, body };
  };

  let { response, body } = await requestToken();
  // Authentik supports both OAuth client-auth conventions. Some existing
  // Community providers are configured as client_secret_basic rather than
  // client_secret_post. Retry only after invalid_client (before a code is
  // consumed), retaining the same PKCE verifier and redirect URI.
  if (!response.ok && body?.error === "invalid_client") {
    const credentials = `${clientId}:${clientSecret}`;
    const basic = bytesToBase64Url(encodeText(credentials))
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(credentials.length / 3) * 4, "=");
    params.delete("client_secret");
    ({ response, body } = await requestToken({ Authorization: `Basic ${basic}` }));
  }
  if (!response.ok || (!body?.id_token && !body?.access_token)) {
    // Safe diagnostics only: OAuth codes, tokens and response text never enter
    // logs. This distinguishes an IdP token error from an HTML/proxy response.
    console.error("authentik_token_exchange_response", {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      json: body !== null,
      keys: body ? Object.keys(body).sort() : [],
      error: typeof body?.error === "string" ? body.error.slice(0, 80) : "",
    });
    throw new Error(`authentik_token_exchange_failed: ${body?.error ?? response.status}`);
  }
  return { idToken: body.id_token ?? null, accessToken: body.access_token ?? null };
}

// ── id_token validation (signature + issuer + audience + nonce + expiry) ──

interface IdTokenClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

interface Jwk {
  kty?: string;
  n?: string;
  e?: string;
  kid?: string;
  use?: string;
}

const jwksCache = new Map<string, { fetchedAt: number; keys: Jwk[] }>();

async function fetchSigningKey(jwksUri: string, kid?: string): Promise<Jwk> {
  let cached = jwksCache.get(jwksUri);
  if (!cached || Date.now() - cached.fetchedAt > 60 * 60 * 1000) {
    const response = await fetch(jwksUri);
    if (!response.ok) throw new Error(`authentik_jwks_failed: HTTP ${response.status}`);
    const doc = (await response.json().catch(() => null)) as { keys?: Jwk[] } | null;
    cached = { fetchedAt: Date.now(), keys: doc?.keys ?? [] };
    jwksCache.set(jwksUri, cached);
  }
  const key =
    (kid ? cached.keys.find((k) => k.kid === kid) : undefined) ??
    cached.keys.find((k) => k.use === "sig") ??
    cached.keys.find((k) => k.kty === "RSA") ??
    cached.keys[0];
  if (!key?.n || !key?.e) throw new Error("authentik_no_signing_key");
  return key;
}

async function importRsaKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n!, e: jwk.e!, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function validateIdToken(
  idToken: string,
  nonce: string,
): Promise<{ sub: string; email: string | null; name: string | null; iss: string; exp: number }> {
  const config = await discover();
  const clientId = requiredEnv("AUTHENTIK_CLIENT_ID");

  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("authentik_invalid_id_token");

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = decodeJsonBase64Url<{ alg?: string; kid?: string }>(headerB64);
  if (header.alg !== "RS256") throw new Error("authentik_unsupported_alg");

  const jwk = await fetchSigningKey(config.jwks_uri, header.kid);
  const key = await importRsaKey(jwk);
  const signature = base64UrlToBytes(signatureB64);
  const signingInput = encodeText(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signingInput);
  if (!valid) throw new Error("authentik_invalid_id_token_signature");

  const claims = decodeJsonBase64Url<IdTokenClaims>(payloadB64);
  if (claims.iss !== config.issuer) throw new Error("authentik_invalid_issuer");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) throw new Error("authentik_invalid_audience");
  if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) {
    throw new Error("authentik_id_token_expired");
  }
  if (!claims.sub) throw new Error("authentik_missing_sub");
  if (claims.nonce !== nonce) throw new Error("authentik_nonce_mismatch");

  return {
    sub: claims.sub,
    email: claims.email ?? null,
    name: claims.name ?? claims.preferred_username ?? null,
    iss: claims.iss,
    exp: claims.exp,
  };
}

/**
 * Authentik can be configured to return an OAuth access token without an
 * id_token even when the authorize request includes `openid`. State + PKCE
 * already bind that token exchange to this browser flow; retrieve the subject
 * from the discovered HTTPS userinfo endpoint instead of rejecting a valid
 * 200 response.
 */
export async function validateUserInfo(
  accessToken: string,
): Promise<{ sub: string; email: string | null; name: string | null; iss: string; exp: number }> {
  const config = await discover();
  if (!config.userinfo_endpoint || !config.userinfo_endpoint.startsWith("https://")) {
    throw new Error("authentik_userinfo_unavailable");
  }
  const response = await fetch(config.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const claims = (await response.json().catch(() => null)) as {
    sub?: string;
    email?: string;
    name?: string;
    preferred_username?: string;
  } | null;
  if (!response.ok) throw new Error(`authentik_userinfo_failed: HTTP ${response.status}`);
  if (!claims?.sub) throw new Error("authentik_userinfo_missing_sub");
  return {
    sub: claims.sub,
    email: claims.email ?? null,
    name: claims.name ?? claims.preferred_username ?? null,
    iss: config.issuer,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
}

// ── Authorize URL ──────────────────────────────────────────────────────────

export async function buildAuthorizeUrl(
  state: string,
  challenge: string,
  nonce: string,
): Promise<string> {
  const config = await discover();
  const url = new URL(config.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", requiredEnv("AUTHENTIK_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requiredEnv("AUTHENTIK_REDIRECT_URI"));
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}
