import { createSessionPayload, readCookie, type SessionPayload } from "./auth";
import { requireEnv, type BillingEnv } from "./billing-env";
import { preservedLoginNext } from "./fenrir-login";

export type OAuthEnv = BillingEnv & {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /**
   * Authentik broker (https://authentik.friskydev.com). The issuer is per-application and
   * ends with a slash, e.g. `https://authentik.friskydev.com/application/o/<app-slug>/`.
   */
  AUTHENTIK_ISSUER?: string;
  AUTHENTIK_CLIENT_ID?: string;
  AUTHENTIK_CLIENT_SECRET?: string;
  /**
   * Hard kill switch. Must be exactly "true" for Authentik to be offered at all.
   * Credentials alone are deliberately NOT enough: this keeps a half-finished Authentik
   * rollout from appearing on a live gate, and lets the flag be flipped off instantly
   * without unbinding secrets. The live Google/Microsoft/Apple path is untouched by it.
   */
  AUTHENTIK_ENABLED?: string;
};

export type OAuthProvider = "google" | "microsoft" | "apple" | "authentik";

export type OAuthTransaction = {
  provider: OAuthProvider;
  state: string;
  verifier: string;
  nonce: string;
  returnTo: string;
  exp: number;
  /** Community Gate slug, set only for the community OAuth bridge flow. */
  community?: string;
};

export type DirectOAuthSession = {
  session: SessionPayload;
  identityId: string;
};

/** Raw verified identity from an OAuth provider, before any operator/community session is minted. */
export type OAuthIdentity = {
  provider: OAuthProvider;
  email: string;
  name: string;
  identityId: string;
  emailVerified: boolean;
};

export type OAuthSessionTransfer = {
  session: SessionPayload;
  returnTo: string;
  exp: number;
};

const transactionCookie = "fenrir_oauth_tx";
const transactionMaxAge = 10 * 60;

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === "google" || value === "microsoft" || value === "apple";
}

/**
 * Providers offered by the Community Gate. Deliberately narrower than isOAuthProvider():
 */
export function isCommunityOAuthProvider(value: unknown): value is OAuthProvider {
  return value === "google" || value === "microsoft" || value === "apple" || value === "authentik";
}

/**
 * Authentik exposes ONE global authorize/token/userinfo triple and a per-application
 * JWKS + issuer. Derived from AUTHENTIK_ISSUER so a single env var configures the lot.
 */
export function authentikEndpoints(issuer: string) {
  const normalizedIssuer = issuer.trim().replace(/\/*$/, "/");
  const origin = new URL(normalizedIssuer).origin;
  return {
    issuer: normalizedIssuer,
    authorize: `${origin}/application/o/authorize/`,
    token: `${origin}/application/o/token/`,
    userinfo: `${origin}/application/o/userinfo/`,
    jwks: `${normalizedIssuer}jwks/`
  };
}

export function isDirectOAuthAvailable(provider: OAuthProvider, env: OAuthEnv): boolean {
  switch (provider) {
    case "google":
      return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
    case "microsoft":
      return Boolean(env.MICROSOFT_CLIENT_ID?.trim() && env.MICROSOFT_CLIENT_SECRET?.trim());
    case "apple":
      return Boolean(env.APPLE_CLIENT_ID?.trim() && env.APPLE_TEAM_ID?.trim() && env.APPLE_KEY_ID?.trim() && env.APPLE_PRIVATE_KEY?.trim());
    case "authentik": {
      // Flag first: an unset/false AUTHENTIK_ENABLED means the provider does not exist,
      // no matter what credentials are bound.
      if (env.AUTHENTIK_ENABLED?.trim().toLowerCase() !== "true") return false;
      if (!env.AUTHENTIK_ISSUER?.trim() || !env.AUTHENTIK_CLIENT_ID?.trim() || !env.AUTHENTIK_CLIENT_SECRET?.trim()) {
        return false;
      }
      // A malformed issuer would blow up later inside the redirect; fail closed here.
      try {
        authentikEndpoints(env.AUTHENTIK_ISSUER);
      } catch {
        return false;
      }
      return true;
    }
    default: {
      const _exhaustive: never = provider;
      void _exhaustive;
      return false;
    }
  }
}

export async function createOAuthTransaction(provider: OAuthProvider, env: OAuthEnv, returnTo: string): Promise<OAuthTransaction> {
  return {
    provider,
    state: randomUrlToken(32),
    verifier: randomUrlToken(64),
    nonce: randomUrlToken(32),
    returnTo: safeReturnPath(returnTo),
    exp: Math.floor(Date.now() / 1000) + transactionMaxAge
  };
}

/**
 * Community Gate variant: carries the community slug through the round trip and
 * constrains returnTo to a relative /community/... path (never cross-origin).
 */
export async function createCommunityOAuthTransaction(
  provider: OAuthProvider,
  _env: OAuthEnv,
  options: { community: string; returnTo: string }
): Promise<OAuthTransaction> {
  return {
    provider,
    state: randomUrlToken(32),
    verifier: randomUrlToken(64),
    nonce: randomUrlToken(32),
    returnTo: safeCommunityReturnPath(options.returnTo),
    exp: Math.floor(Date.now() / 1000) + transactionMaxAge,
    community: options.community
  };
}

export async function getAuthorizationUrl(provider: OAuthProvider, env: OAuthEnv, redirectUri: string, tx: OAuthTransaction): Promise<string> {
  const codeChallenge = await pkceChallenge(tx.verifier);

  if (provider === "google") {
    const clientId = requireEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: tx.state,
      nonce: tx.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  if (provider === "microsoft") {
    const clientId = requireEnv(env.MICROSOFT_CLIENT_ID, "MICROSOFT_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: tx.state,
      nonce: tx.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      response_mode: "query"
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  if (provider === "apple") {
    const clientId = requireEnv(env.APPLE_CLIENT_ID, "APPLE_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "name email",
      response_mode: "form_post",
      state: tx.state,
      nonce: tx.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });
    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  if (provider === "authentik") {
    const clientId = requireEnv(env.AUTHENTIK_CLIENT_ID, "AUTHENTIK_CLIENT_ID");
    const endpoints = authentikEndpoints(requireEnv(env.AUTHENTIK_ISSUER, "AUTHENTIK_ISSUER"));
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: tx.state,
      nonce: tx.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      response_mode: "query"
    });
    return `${endpoints.authorize}?${params.toString()}`;
  }

    throw new Error(`unsupported_provider:${provider}`);
}

export async function transactionSetCookie(tx: OAuthTransaction, env: OAuthEnv, domain?: string) {
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(tx)));
  const signature = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  let header = `${transactionCookie}=${encoded}.${signature}; Path=/api/auth; HttpOnly; Secure; SameSite=${transactionSameSite(tx.provider)}; Max-Age=${transactionMaxAge}`;
  if (domain) header += `; Domain=${domain}`;
  return header;
}

export async function signSessionTransfer(session: SessionPayload, returnTo: string, env: OAuthEnv) {
  const payload: OAuthSessionTransfer = {
    session,
    returnTo: safeReturnPath(returnTo),
    exp: Math.floor(Date.now() / 1000) + 60
  };
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  return `${encoded}.${signature}`;
}

export async function readSessionTransfer(token: string, env: OAuthEnv): Promise<OAuthSessionTransfer | null> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  if (!timingSafeEqual(signature, expected)) return null;
  let transfer: OAuthSessionTransfer;
  try {
    transfer = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as OAuthSessionTransfer;
  } catch {
    return null;
  }
  if (!transfer || typeof transfer !== "object") return null;
  if (!transfer.exp || transfer.exp < Math.floor(Date.now() / 1000)) return null;
  if (!transfer.session?.email || !transfer.session?.frisky_user_id || !transfer.session?.frisky_org_id) return null;
  return {
    session: transfer.session,
    returnTo: safeReturnPath(transfer.returnTo),
    exp: transfer.exp
  };
}

export function clearTransactionCookie(domain?: string) {
  let header = `${transactionCookie}=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  if (domain) header += `; Domain=${domain}`;
  return header;
}

const communityTransactionCookie = "fenrir_community_oauth_tx";
const communityTransactionPath = "/api/community-auth";

export async function communityTransactionSetCookie(tx: OAuthTransaction, env: OAuthEnv, domain?: string) {
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(tx)));
  const signature = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  let header = `${communityTransactionCookie}=${encoded}.${signature}; Path=${communityTransactionPath}; HttpOnly; Secure; SameSite=${transactionSameSite(tx.provider)}; Max-Age=${transactionMaxAge}`;
  if (domain) header += `; Domain=${domain}`;
  return header;
}

/**
 * Apple returns via response_mode=form_post, i.e. a cross-site POST. A SameSite=Lax
 * cookie is withheld on cross-site POSTs, so the transaction would never reach the
 * callback and every Apple sign-in would fail with oauth_state_missing. SameSite=None
 * is required there; the cookie stays HttpOnly + Secure + HMAC-signed + state-checked.
 */
function transactionSameSite(provider: OAuthProvider) {
  return provider === "apple" ? "None" : "Lax";
}

export async function readCommunityOAuthTransaction(request: Request, env: OAuthEnv): Promise<OAuthTransaction | null> {
  const token = readCookie(request, communityTransactionCookie);
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  if (!timingSafeEqual(signature, expected)) return null;
  const tx = decodeTransaction(encoded);
  if (!tx) return null;
  if (!isCommunityOAuthProvider(tx.provider)) return null;
  return tx;
}

export function clearCommunityTransactionCookie(domain?: string) {
  let header = `${communityTransactionCookie}=; Path=${communityTransactionPath}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  if (domain) header += `; Domain=${domain}`;
  return header;
}

/**
 * Community OAuth returnTo allow-list: relative paths under /community only.
 * Never emits an absolute URL — an attacker-supplied ?return_to=https://evil.tld
 * would otherwise turn the callback into an open redirect.
 */
export function safeCommunityReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  const pathname = value.split(/[?#]/, 1)[0] || "/";
  if (!pathname.startsWith("/community/")) return "/";
  return value;
}

export async function readOAuthTransaction(request: Request, env: OAuthEnv): Promise<OAuthTransaction | null> {
  const token = readCookie(request, transactionCookie);
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  if (!timingSafeEqual(signature, expected)) return null;
  const tx = decodeTransaction(encoded);
  if (!tx) return null;
  if (!isOAuthProvider(tx.provider)) return null;
  return tx;
}

/** Decode + shape-check a signed transaction blob. Returns null on garbage or expiry. */
function decodeTransaction(encoded: string): OAuthTransaction | null {
  let tx: OAuthTransaction;
  try {
    tx = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as OAuthTransaction;
  } catch {
    return null;
  }
  if (!tx || typeof tx !== "object") return null;
  if (!tx.exp || tx.exp < Math.floor(Date.now() / 1000)) return null;
  return tx;
}

export function validateOAuthTransaction(tx: OAuthTransaction | null, provider: OAuthProvider, state: string | null) {
  if (!tx) throw new Error("oauth_state_missing");
  if (tx.provider !== provider) throw new Error("oauth_provider_mismatch");
  if (!state || !timingSafeEqual(tx.state, state)) throw new Error("oauth_state_invalid");
}

/**
 * Verify the provider round trip and return the raw identity, WITHOUT minting an
 * operator session or applying the operator admin allow-list. The Community Gate
 * bridge builds its own Neon session from this; exchangeCodeForSession() is the
 * operator path and keeps the allow-list check.
 */
export async function exchangeCodeForIdentity(
  provider: OAuthProvider,
  env: OAuthEnv,
  code: string,
  redirectUri: string,
  tx: OAuthTransaction
): Promise<OAuthIdentity> {
  if (provider === "google") return exchangeGoogleCode(env, code, redirectUri, tx);
  if (provider === "microsoft") return exchangeMicrosoftCode(env, code, redirectUri, tx);
  if (provider === "apple") return exchangeAppleCode(env, code, redirectUri, tx);
  if (provider === "authentik") return exchangeAuthentikCode(env, code, redirectUri, tx);
  throw new Error(`exchange_not_implemented_for:${provider}`);
}

export async function exchangeCodeForSession(
  provider: OAuthProvider,
  env: OAuthEnv,
  code: string,
  redirectUri: string,
  tx: OAuthTransaction
): Promise<DirectOAuthSession> {
  const identity = await exchangeCodeForIdentity(provider, env, code, redirectUri, tx);
  assertAdminAllowed(identity.email, env.SUPABASE_ADMIN_EMAILS);
  return {
    identityId: identity.identityId,
    session: createSessionPayload({
      email: identity.email,
      name: identity.name,
      provider: identity.provider,
      identityId: identity.identityId
    })
  };
}

/**
 * Sanitizes an OAuth return path and preserves approved login destinations.
 *
 * @param value - Candidate return path
 * @returns The approved return path, or `/main` when the value is invalid or restricted
 */
export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/main";
  const preserved = preservedLoginNext(value);
  if (preserved) return preserved;
  const pathname = value.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/auth/") || pathname.startsWith("/api/auth/")) return "/main";
  return value;
}

async function exchangeGoogleCode(env: OAuthEnv, code: string, redirectUri: string, tx: OAuthTransaction): Promise<OAuthIdentity> {
  const clientId = requireEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET");

  const tokens = await exchangeToken("https://oauth2.googleapis.com/token", {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: tx.verifier
  }, "google");

  const claims = await verifyIdToken(tokens.id_token, {
    issuer: /^(https:\/\/accounts\.google\.com|accounts\.google\.com)$/,
    audience: clientId,
    nonce: tx.nonce,
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs"
  });
  const email = stringClaim(claims.email, "google_missing_email");
  const sub = stringClaim(claims.sub, "google_missing_sub");
  const identityId = `google:${sub}`;
  return {
    provider: "google",
    email,
    name: typeof claims.name === "string" ? claims.name : email.split("@")[0],
    identityId,
    // Google only omits email_verified for unverified accounts — default closed.
    emailVerified: parseBoolClaim(claims.email_verified, false)
  };
}

async function exchangeMicrosoftCode(env: OAuthEnv, code: string, redirectUri: string, tx: OAuthTransaction): Promise<OAuthIdentity> {
  const clientId = requireEnv(env.MICROSOFT_CLIENT_ID, "MICROSOFT_CLIENT_ID");
  const clientSecret = requireEnv(env.MICROSOFT_CLIENT_SECRET, "MICROSOFT_CLIENT_SECRET");

  const tokens = await exchangeToken("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: tx.verifier
  }, "microsoft");

  const claims = await verifyIdToken(tokens.id_token, {
    issuer: /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i,
    audience: clientId,
    nonce: tx.nonce,
    jwksUrl: "https://login.microsoftonline.com/common/discovery/v2.0/keys"
  });
  const email = typeof claims.email === "string" && claims.email.trim().length > 0
    ? claims.email
    : stringClaim(claims.preferred_username, "microsoft_missing_email");
  const sub = stringClaim(claims.sub, "microsoft_missing_sub");
  const identityId = `microsoft:${sub}`;
  return {
    provider: "microsoft",
    email,
    name: typeof claims.name === "string" ? claims.name : email.split("@")[0],
    identityId,
    // Entra ID only emits email_verified/xms_edov for federated-domain edge cases.
    emailVerified: parseBoolClaim(claims.email_verified ?? claims.xms_edov, true)
  };
}

async function exchangeAppleCode(env: OAuthEnv, code: string, redirectUri: string, tx: OAuthTransaction): Promise<OAuthIdentity> {
  const clientId = requireEnv(env.APPLE_CLIENT_ID, "APPLE_CLIENT_ID");
  const clientSecret = await createAppleClientSecret(env);

  const tokens = await exchangeToken("https://appleid.apple.com/auth/token", {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: tx.verifier
  }, "apple");

  const claims = await verifyIdToken(tokens.id_token, {
    issuer: "https://appleid.apple.com",
    audience: clientId,
    nonce: tx.nonce,
    jwksUrl: "https://appleid.apple.com/auth/keys"
  });
  const email = stringClaim(claims.email, "apple_id_token_missing_email");
  const sub = stringClaim(claims.sub, "apple_missing_sub");
  const identityId = `apple:${sub}`;
  return {
    provider: "apple",
    email,
    name: email.split("@")[0],
    identityId,
    // Apple omits email_verified for the private-relay alias, which is verified by construction.
    emailVerified: parseBoolClaim(claims.email_verified, true)
  };
}

/**
 * Authentik as an OIDC broker. Same shape as the direct providers — the difference is that
 * Google / Microsoft / Apple sit BEHIND Authentik as federated sources, so this single
 * exchange covers all of them and `sub` is Authentik's stable user id, not the upstream one.
 *
 * That stability is the whole point: a user who signs in via Google today and Microsoft
 * tomorrow keeps ONE `authentik:<sub>` identity, because Authentik does the account
 * linking on its side instead of the bridge minting a second row per upstream provider.
 */
async function exchangeAuthentikCode(env: OAuthEnv, code: string, redirectUri: string, tx: OAuthTransaction): Promise<OAuthIdentity> {
  const clientId = requireEnv(env.AUTHENTIK_CLIENT_ID, "AUTHENTIK_CLIENT_ID");
  const clientSecret = requireEnv(env.AUTHENTIK_CLIENT_SECRET, "AUTHENTIK_CLIENT_SECRET");
  const endpoints = authentikEndpoints(requireEnv(env.AUTHENTIK_ISSUER, "AUTHENTIK_ISSUER"));

  const tokens = await exchangeToken(endpoints.token, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: tx.verifier
  }, "authentik");

  const claims = await verifyIdToken(tokens.id_token, {
    // Pinned to THIS application's issuer, so a token minted for a DIFFERENT Authentik
    // application on the same host is rejected. Anchored regex only to tolerate the
    // trailing slash — Authentik emits `iss` with one, config may be pasted without.
    issuer: new RegExp(`^${escapeRegExp(endpoints.issuer.replace(/\/$/, ""))}\\/?$`),
    audience: clientId,
    nonce: tx.nonce,
    jwksUrl: endpoints.jwks
  });

  const sub = stringClaim(claims.sub, "authentik_missing_sub");
  // Authentik only puts email/preferred_username in the id_token when the email/profile
  // scope mappings are attached to the provider. Fall back to /userinfo rather than
  // dead-ending the sign-in on a scope-mapping mistake.
  let email = typeof claims.email === "string" && claims.email.trim() ? claims.email.trim() : "";
  let name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : "";
  let emailVerifiedClaim = claims.email_verified;

  if (!email && tokens.access_token) {
    const info = await fetchAuthentikUserInfo(endpoints.userinfo, tokens.access_token);
    if (typeof info.email === "string") email = info.email.trim();
    if (!name && typeof info.name === "string") name = info.name.trim();
    if (emailVerifiedClaim === undefined) emailVerifiedClaim = info.email_verified;
  }

  if (!email) throw new Error("authentik_missing_email");

  return {
    provider: "authentik",
    email,
    name: name || email.split("@")[0],
    identityId: `authentik:${sub}`,
    // Authentik is our own broker: it either federated from a provider that already
    // verified the address, or the operator created the account by hand. It omits
    // email_verified unless the mapping is configured, so absence means "trusted",
    // an explicit false still blocks.
    emailVerified: parseBoolClaim(emailVerifiedClaim, true)
  };
}

async function fetchAuthentikUserInfo(userinfoUrl: string, accessToken: string) {
  const response = await httpFetch(userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`authentik_userinfo_failed:${response.status}`);
  return await response.json() as Record<string, unknown>;
}



let fetchOverride: typeof fetch | null = null;

/** Test hook: route OAuth token/JWKS calls through a stub instead of the network. */
export function __setFetchForTests(fetchFn: typeof fetch | null) {
  fetchOverride = fetchFn;
}

function httpFetch(input: RequestInfo | URL, init?: RequestInit) {
  return (fetchOverride ?? fetch)(input, init);
}

async function exchangeToken(url: string, params: Record<string, string>, provider: OAuthProvider) {
  const tokenRes = await httpFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });

  if (!tokenRes.ok) {
    throw new Error(`${provider}_token_exchange_failed:${await tokenRes.text()}`);
  }

  const tokens = await tokenRes.json() as { id_token?: string; access_token?: string };
  if (!tokens.id_token) throw new Error(`${provider}_missing_id_token`);
  // access_token is only consumed by the Authentik /userinfo fallback; the direct
  // providers ignore it and read everything off the verified id_token.
  return { id_token: tokens.id_token, access_token: tokens.access_token };
}

async function verifyIdToken(token: string, options: {
  issuer: string | RegExp;
  audience: string;
  nonce: string;
  jwksUrl: string;
}) {
  const { header, payload, signedData, signature } = decodeJwtParts(token);
  const alg = stringClaim(header.alg, "id_token_missing_alg");
  const kid = stringClaim(header.kid, "id_token_missing_kid");
  if (alg !== "RS256") throw new Error(`unsupported_id_token_alg:${alg}`);

  const jwks = await httpFetch(options.jwksUrl).then((response) => {
    if (!response.ok) throw new Error("jwks_fetch_failed");
    return response.json();
  }) as { keys?: JsonWebKey[] };
  const jwk = jwks.keys?.find((key) => key.kid === kid && key.kty === "RSA");
  if (!jwk) throw new Error("id_token_key_not_found");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(signedData));
  if (!verified) throw new Error("id_token_signature_invalid");

  const issuer = stringClaim(payload.iss, "id_token_missing_issuer");
  if (typeof options.issuer === "string" ? issuer !== options.issuer : !options.issuer.test(issuer)) {
    throw new Error("id_token_issuer_invalid");
  }

  const audience = payload.aud;
  const audienceValid = Array.isArray(audience) ? audience.includes(options.audience) : audience === options.audience;
  if (!audienceValid) throw new Error("id_token_audience_invalid");
  if (payload.nonce !== options.nonce) throw new Error("id_token_nonce_invalid");
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("id_token_expired");
  return payload;
}

async function createAppleClientSecret(env: OAuthEnv): Promise<string> {
  const clientId = requireEnv(env.APPLE_CLIENT_ID, "APPLE_CLIENT_ID");
  const teamId = requireEnv(env.APPLE_TEAM_ID, "APPLE_TEAM_ID");
  const keyId = requireEnv(env.APPLE_KEY_ID, "APPLE_KEY_ID");
  const privateKeyPem = requireEnv(env.APPLE_PRIVATE_KEY, "APPLE_PRIVATE_KEY");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 86400 * 180,
    aud: "https://appleid.apple.com",
    sub: clientId
  };

  const token = `${base64Url(new TextEncoder().encode(JSON.stringify(header)))}.${base64Url(new TextEncoder().encode(JSON.stringify(payload)))}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBinary(privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    new TextEncoder().encode(token)
  );

  return `${token}.${base64Url(new Uint8Array(signature))}`;
}

function decodeJwtParts(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt_format");
  return {
    header: JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as Record<string, unknown>,
    payload: JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as Record<string, unknown>,
    signedData: `${parts[0]}.${parts[1]}`,
    signature: base64UrlToBytes(parts[2])
  };
}

async function pkceChallenge(verifier: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

function randomUrlToken(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(signature));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function stringClaim(value: unknown, error: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(error);
  return value;
}

/** id_token booleans arrive as either true/false or the strings "true"/"false". */
function parseBoolClaim(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function assertAdminAllowed(email: string, allowlist?: string) {
  const allowed = (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(email.toLowerCase())) {
    throw new Error("oauth_admin_not_allowed");
  }
}

function pemToBinary(pem: string): ArrayBuffer {
  const base64 = pem.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
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
