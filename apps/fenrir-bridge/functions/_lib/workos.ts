import { createSessionPayload, type SessionPayload } from "./auth";
import { requireEnv, type BillingEnv } from "./billing-env";

// WorkOS AuthKit (User Management) integration. Fenrir owns the callback and
// mints its own session cookie, exactly like the legacy direct-OAuth path —
// WorkOS only replaces Supabase as the hosted social/email login broker.
export type WorkOSEnv = BillingEnv & {
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
};

export type WorkOSProviderHint = "google" | "microsoft" | "apple";

// AuthKit authorize `provider` values for the built-in social connections.
const providerMap: Record<WorkOSProviderHint, string> = {
  google: "GoogleOAuth",
  microsoft: "MicrosoftOAuth",
  apple: "AppleOAuth"
};

const stateCookie = "fenrir_workos_state";
const stateMaxAge = 10 * 60;

export function isWorkOSProviderHint(value: unknown): value is WorkOSProviderHint {
  return value === "google" || value === "microsoft" || value === "apple";
}

export function isWorkOSConfigured(env: WorkOSEnv): boolean {
  return Boolean(env.WORKOS_CLIENT_ID?.trim() && env.WORKOS_API_KEY?.trim());
}

export type WorkOSStatePayload = {
  state: string;
  returnTo: string;
  exp: number;
};

export async function buildAuthorizationUrl(
  env: WorkOSEnv,
  redirectUri: string,
  state: string,
  providerHint?: WorkOSProviderHint
): Promise<string> {
  const clientId = requireEnv(env.WORKOS_CLIENT_ID, "WORKOS_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state
  });
  // Always use the hosted AuthKit selector. Jumping straight to a specific
  // connection (GoogleOAuth/MicrosoftOAuth/AppleOAuth) makes WorkOS return
  // 404 {"message":"Not Found"} when that connection isn't enabled in the
  // active environment — the post-login "Not Found" users hit. AuthKit shows
  // exactly the methods the environment has enabled and is the robust default.
  // (providerHint retained for future use once per-connection jump is desired
  // and the connections are enabled in the WorkOS dashboard.)
  const connection = providerHint && env.WORKOS_ALLOW_PROVIDER_HINT === "1"
    ? providerMap[providerHint]
    : "authkit";
  params.set("provider", connection);
  return `https://api.workos.com/user_management/authorize?${params.toString()}`;
}

type WorkOSAuthenticateResponse = {
  user?: {
    id?: string;
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
};

export async function exchangeCodeForSession(
  env: WorkOSEnv,
  code: string
): Promise<{ session: SessionPayload; identityId: string }> {
  const clientId = requireEnv(env.WORKOS_CLIENT_ID, "WORKOS_CLIENT_ID");
  const apiKey = requireEnv(env.WORKOS_API_KEY, "WORKOS_API_KEY");

  const response = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: apiKey,
      grant_type: "authorization_code",
      code
    })
  });

  if (!response.ok) {
    // Log the upstream body for operators, but throw only a stable code: the
    // callback surfaces error.message in a user-visible redirect URL, so the
    // raw WorkOS response (which can echo request fields) must not leak there.
    console.error("WorkOS token exchange failed", response.status, await response.text().catch(() => ""));
    throw new Error("workos_token_exchange_failed");
  }

  const data = (await response.json()) as WorkOSAuthenticateResponse;
  const user = data.user;
  if (!user?.email) throw new Error("workos_missing_email");
  if (!user.id) throw new Error("workos_missing_user_id");

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.email.split("@")[0];
  const identityId = `workos:${user.id}`;

  return {
    identityId,
    session: createSessionPayload({
      email: user.email,
      name,
      provider: "workos",
      identityId
    })
  };
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value) return "/main";
  // SECURITY: relative-path only. The WorkOS login flow is same-origin; honoring
  // an absolute returnTo here would be an open redirect (?return_to=https://evil).
  if (!value.startsWith("/") || value.startsWith("//")) return "/main";
  const pathname = value.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/auth/") || pathname.startsWith("/api/auth/")) {
    return "/main";
  }
  return value;
}

export async function stateSetCookie(payload: WorkOSStatePayload, env: WorkOSEnv, domain?: string) {
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  let header = `${stateCookie}=${encoded}.${signature}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${stateMaxAge}`;
  if (domain) header += `; Domain=${domain}`;
  return header;
}

export function clearStateCookie(domain?: string) {
  let header = `${stateCookie}=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  if (domain) header += `; Domain=${domain}`;
  return header;
}

export async function readState(request: Request, env: WorkOSEnv): Promise<WorkOSStatePayload | null> {
  const token = readCookie(request, stateCookie);
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(requireEnv(env.SESSION_SECRET, "SESSION_SECRET"), encoded);
  if (!timingSafeEqual(signature, expected)) return null;
  let payload: WorkOSStatePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as WorkOSStatePayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function randomState(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function createStatePayload(returnTo: string): WorkOSStatePayload {
  return {
    state: randomState(),
    returnTo: safeReturnPath(returnTo),
    exp: Math.floor(Date.now() / 1000) + stateMaxAge
  };
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
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
