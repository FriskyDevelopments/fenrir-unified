type Env = {
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

const COOKIE = "fenrir_session";
const WEEK = 60 * 60 * 24 * 7;

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function readCookie(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? "";
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function session(request: Request, env: Env) {
  const [payload, supplied] = readCookie(request).split(".");
  if (!payload || !supplied || !env.SESSION_SECRET || (await signature(env.SESSION_SECRET, payload)) !== supplied) return null;
  const parsed = JSON.parse(decodeBase64Url(payload)) as { email?: string; name?: string; provider?: string; frisky_user_id?: string; frisky_org_id?: string; exp?: number };
  if (!parsed.email || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

function cookieAttributes(request: Request) {
  const host = new URL(request.url).hostname;
  // A workers.dev origin cannot set a .myfenrir.com cookie. Only use the
  // shared domain after Quality is bound to a myfenrir.com hostname.
  const domain = host.endsWith(".myfenrir.com") ? "; Domain=.myfenrir.com" : "";
  return `Path=/${domain}; HttpOnly; Secure; SameSite=Lax; Max-Age=${WEEK}`;
}

async function createSession(request: Request, env: Env) {
  if (!env.SESSION_SECRET) return json({ ok: false, error: "quality_session_secret_missing" }, { status: 503 });
  const body = await request.json<{ accessToken?: string }>().catch(() => null);
  if (!body?.accessToken) return json({ ok: false, error: "missing_supabase_access_token" }, { status: 400 });
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${body.accessToken}` },
  });
  if (!response.ok) return json({ ok: false, error: "supabase_invalid_access_token" }, { status: 401 });
  const user = await response.json<{ id?: string; email?: string; user_metadata?: { full_name?: string; name?: string }; app_metadata?: { provider?: string } }>();
  if (!user.id || !user.email) return json({ ok: false, error: "supabase_identity_incomplete" }, { status: 401 });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split("@")[0],
    provider: user.app_metadata?.provider === "azure" ? "microsoft" : user.app_metadata?.provider === "apple" ? "apple" : "google",
    frisky_user_id: `quality_${user.id}`,
    frisky_org_id: `quality_${user.id}`,
    iat: now,
    exp: now + WEEK,
  };
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const token = `${encoded}.${await signature(env.SESSION_SECRET, encoded)}`;
  return json({ ok: true }, { headers: { "set-cookie": `${COOKIE}=${token}; ${cookieAttributes(request)}` } });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/supabase-session" && request.method === "POST") return createSession(request, env);
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const current = await session(request, env).catch(() => null);
      if (!current) return json({ ok: true, authenticated: false });
      return json({ ok: true, authenticated: true, user: { id: current.frisky_user_id, email: current.email, name: current.name, authProvider: current.provider }, org: { id: current.frisky_org_id, plan: "free" } });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return json({ ok: true }, { headers: { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
    }
    return env.ASSETS.fetch(request);
  },
};
