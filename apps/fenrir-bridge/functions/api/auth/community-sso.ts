import { readSession } from "../../_lib/auth";

type Env = {
  SESSION_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const COMMUNITY_ORIGIN = "https://communities.myfenrir.com";
const STORAGE_CHUNK_SIZE = 3000;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`missing_env:${name}`);
  return value.trim();
}

function safeNext(raw: string | null) {
  if (!raw) return `${COMMUNITY_ORIGIN}/dashboard`;
  try {
    const url = new URL(raw, COMMUNITY_ORIGIN);
    return url.origin === COMMUNITY_ORIGIN ? url.toString() : `${COMMUNITY_ORIGIN}/dashboard`;
  } catch {
    return `${COMMUNITY_ORIGIN}/dashboard`;
  }
}

function safeBrand(raw: string | null) {
  const value = raw?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value) ? value : null;
}

function safeGate(raw: string | null) {
  const value = raw?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(value) ? value : null;
}

function brandedLoginUrl(next: string, brand: string | null, gate: string | null) {
  const url = new URL("/login", COMMUNITY_ORIGIN);
  const target = new URL(next);
  url.searchParams.set("next", `${target.pathname}${target.search}${target.hash}`);
  if (brand) url.searchParams.set("brand", brand);
  if (gate) url.searchParams.set("gate", gate);
  return url.toString();
}

function brandedLoginResponse(next: string, brand: string | null, gate: string | null) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: brandedLoginUrl(next, brand, gate),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * A visitor arriving from a public Gate has no MyFenrir session yet — that is
 * the normal case, not an error. Keep them on Community Bridge's branded login
 * surface; that screen starts the canonical MyFenrir OAuth flow and returns to
 * this endpoint after identity succeeds. The brand is presentation context,
 * never authorization state.
 */
function sessionCookies(storageKey: string, value: string) {
  const encodedName = encodeURIComponent(storageKey);
  const encodedValue = encodeURIComponent(value);
  const attributes = `Path=/; Domain=.myfenrir.com; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
  if (encodedValue.length <= STORAGE_CHUNK_SIZE) {
    return [`${encodedName}=${encodedValue}; ${attributes}`];
  }
  const cookies: string[] = [];
  for (let index = 0; index * STORAGE_CHUNK_SIZE < encodedValue.length; index += 1) {
    cookies.push(
      `${encodedName}.${index}=${encodedValue.slice(index * STORAGE_CHUNK_SIZE, (index + 1) * STORAGE_CHUNK_SIZE)}; ${attributes}`,
    );
  }
  return cookies;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const requestUrl = new URL(context.request.url);
  const next = safeNext(requestUrl.searchParams.get("next"));
  const brand = safeBrand(requestUrl.searchParams.get("brand"));
  const gate = safeGate(requestUrl.searchParams.get("gate"));
  const fenrirSession = await readSession(context.request, context.env);
  if (!fenrirSession) {
    // Never let an old attempt cookie bypass the branded surface or choose a
    // different auth broker. Retrying is safe because this page waits for a
    // deliberate provider click; it does not auto-bounce into SSO.
    return brandedLoginResponse(next, brand, gate);
  }

  try {
    const supabaseUrl = required(context.env.SUPABASE_URL, "SUPABASE_URL").replace(/\/$/, "");
    const anonKey = required(context.env.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");
    const serviceKey = required(context.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

    const linkResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "magiclink",
        email: fenrirSession.email,
        options: { data: { full_name: fenrirSession.name, fenrir_user_id: fenrirSession.frisky_user_id } },
      }),
    });
    const link = (await linkResponse.json().catch(() => null)) as { hashed_token?: string } | null;
    if (!linkResponse.ok || !link?.hashed_token) throw new Error("supabase_generate_link_failed");

    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ token_hash: link.hashed_token, type: "magiclink" }),
    });
    const auth = (await verifyResponse.json().catch(() => null)) as
      | { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; user?: unknown }
      | null;
    if (!verifyResponse.ok || !auth?.access_token || !auth.refresh_token || !auth.user) {
      throw new Error("supabase_verify_failed");
    }

    const ref = new URL(supabaseUrl).hostname.split(".")[0] || "auth";
    const value = JSON.stringify({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      expires_in: auth.expires_in ?? 3600,
      expires_at: Math.floor(Date.now() / 1000) + (auth.expires_in ?? 3600),
      token_type: auth.token_type ?? "bearer",
      user: auth.user,
    });
    const headers = new Headers({ Location: next, "Cache-Control": "no-store" });
    for (const cookie of sessionCookies(`sb-${ref}-auth-token`, value)) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("community_sso_failed", error instanceof Error ? error.message : "unknown");
    return brandedLoginResponse(next, brand, gate);
  }
}
