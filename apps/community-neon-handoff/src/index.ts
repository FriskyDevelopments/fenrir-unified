export interface Env {
  QUALITY_HANDOFF_SECRET: string;
  CANONICAL_NEON_ORIGIN: string;
  QUALITY_ORIGIN: string;
}

type Marker = { destination: string; nonce: string; exp: number };
type CommunityMe = {
  authenticated?: boolean;
  user?: { id?: string; email?: string };
  communitySlug?: string | null;
  communityOrgId?: string | null;
};

const PROVIDERS = new Set(["google", "microsoft", "apple"]);
const MARKER_COOKIE = "fenrir_quality_handoff";
const SESSION_COOKIE = "fenrir_community_session";
const MARKER_TTL = 10 * 60;
const HANDOFF_TTL = 90;

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function verifyHmac(secret: string, value: string, supplied: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, fromB64url(supplied), encoder.encode(value)).catch(() => false);
}

function cookie(request: Request, name: string): string {
  const raw = request.headers.get("Cookie") ?? "";
  return raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function safeDestination(raw: string | null, qualityOrigin: string): string | null {
  try {
    if (!raw) return null;
    const url = new URL(raw);
    if (url.origin !== qualityOrigin) return null;
    if (!url.pathname.startsWith("/g/") && url.pathname !== "/dashboard") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function signedJson<T>(payload: T, secret: string): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

async function verifiedJson<T>(token: string, secret: string): Promise<T | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!await verifyHmac(secret, body, signature)) return null;
  try { return JSON.parse(new TextDecoder().decode(fromB64url(body))) as T; } catch { return null; }
}

function markerCookie(value: string): string {
  return `${MARKER_COOKIE}=${value}; Path=/api/community-auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${MARKER_TTL}`;
}

function clearMarkerCookie(): string {
  return `${MARKER_COOKIE}=; Path=/api/community-auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function redirect(location: string, headers: HeadersInit = {}): Response {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers } });
}

async function qualityStart(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  const destination = safeDestination(url.searchParams.get("destination"), env.QUALITY_ORIGIN);
  if (!PROVIDERS.has(provider) || !destination) return new Response("Invalid Quality handoff", { status: 400 });
  const marker: Marker = { destination, nonce: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + MARKER_TTL };
  const oauth = new URL(`/api/community-auth/oauth/${provider}`, url.origin);
  oauth.searchParams.set("slug", "fenrir");
  oauth.searchParams.set("return_to", "/community/fenrir");
  return redirect(oauth.toString(), { "Set-Cookie": markerCookie(await signedJson(marker, `quality-marker-v1:${env.QUALITY_HANDOFF_SECRET}`)) });
}

async function proxyCallback(request: Request, env: Env): Promise<Response> {
  const incoming = new URL(request.url);
  const upstreamUrl = new URL(incoming.pathname + incoming.search, env.CANONICAL_NEON_ORIGIN);
  const upstream = await fetch(new Request(upstreamUrl, request));
  const markerToken = cookie(request, MARKER_COOKIE);
  if (!markerToken || upstream.status < 300 || upstream.status >= 400) return upstream;
  const setCookie = upstream.headers.get("set-cookie") ?? "";
  if (!setCookie.includes(`${SESSION_COOKIE}=`) || setCookie.includes(`${SESSION_COOKIE}=;`)) return upstream;
  const handoff = new URL("/api/community-auth/quality-handoff", incoming.origin);
  const headers = new Headers(upstream.headers);
  headers.set("Location", handoff.toString());
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function qualityHandoff(request: Request, env: Env): Promise<Response> {
  const marker = await verifiedJson<Marker>(cookie(request, MARKER_COOKIE), `quality-marker-v1:${env.QUALITY_HANDOFF_SECRET}`);
  const now = Math.floor(Date.now() / 1000);
  if (!marker || marker.exp < now || !marker.nonce || !safeDestination(marker.destination, env.QUALITY_ORIGIN)) {
    return redirect(`${env.QUALITY_ORIGIN}/login?error=handoff_invalid`, { "Set-Cookie": clearMarkerCookie() });
  }
  const meUrl = new URL("/api/community-auth/me", env.CANONICAL_NEON_ORIGIN);
  const meResponse = await fetch(meUrl, { headers: { Cookie: request.headers.get("Cookie") ?? "" } });
  const me = await meResponse.json().catch(() => ({})) as CommunityMe;
  if (!meResponse.ok || !me.authenticated || !me.user?.id || !me.user.email) {
    return redirect(`${env.QUALITY_ORIGIN}/login?error=handoff_invalid`, { "Set-Cookie": clearMarkerCookie() });
  }
  const payload = {
    user_id: me.user.id,
    email: me.user.email,
    community_slug: me.communitySlug ?? "fenrir",
    community_org_id: me.communityOrgId ?? null,
    destination: marker.destination,
    nonce: marker.nonce,
    exp: now + HANDOFF_TTL,
  };
  const token = await signedJson(payload, `community-quality-handoff-v1:${env.QUALITY_HANDOFF_SECRET}`);
  const callback = new URL("/auth/neon-callback", env.QUALITY_ORIGIN);
  callback.searchParams.set("token", token);
  return redirect(callback.toString(), { "Set-Cookie": clearMarkerCookie() });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.QUALITY_HANDOFF_SECRET?.trim()) return new Response("Not configured", { status: 503 });
    const path = new URL(request.url).pathname;
    if (path === "/api/community-auth/quality-start" && request.method === "GET") return qualityStart(request, env);
    if (path === "/api/community-auth/quality-handoff" && request.method === "GET") return qualityHandoff(request, env);
    if (path.startsWith("/api/community-auth/oauth/callback/")) return proxyCallback(request, env);
    return new Response("Not found", { status: 404 });
  },
};

export const testables = { safeDestination, signedJson, verifiedJson };
