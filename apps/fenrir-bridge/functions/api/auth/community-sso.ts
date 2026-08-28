import { readCookie, readSession } from "../../_lib/auth";
import { canonicalFenrirLoginUrl } from "../../_lib/fenrir-login";

type Env = {
  SESSION_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const COMMUNITY_ORIGIN = "https://communities.myfenrir.com";
const ATTEMPT_COOKIE = "fenrir_community_sso_attempted";
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

function loginFallback(next: string) {
  const url = new URL("/login", COMMUNITY_ORIGIN);
  url.searchParams.set("sso", "0");
  const target = new URL(next);
  url.searchParams.set("next", `${target.pathname}${target.search}${target.hash}`);
  return url.toString();
}

function fallbackResponse(next: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: loginFallback(next),
      "Cache-Control": "no-store",
      "Set-Cookie": "fenrir_community_sso_attempted=1; Path=/; Domain=.myfenrir.com; Max-Age=120; SameSite=Lax; Secure",
    },
  });
}

/**
 * A visitor arriving from a public Gate has no MyFenrir session yet — that is
 * the normal case, not an error. Sending them to the community's own login
 * strands them: the button promised SSO and delivered a local email form.
 * Park them on the MyFenrir sign-in surface instead, carrying this endpoint in
 * `?next=` so the handoff resumes the moment they have an identity.
 */
function signInRedirect(requestUrl: URL, next: string) {
  const handoff = new URL("/api/auth/community-sso", requestUrl.origin);
  handoff.searchParams.set("next", next);
  return new Response(null, {
    status: 302,
    headers: {
      Location: canonicalFenrirLoginUrl(`${handoff.pathname}${handoff.search}`),
      "Cache-Control": "no-store",
      // Doubles as the loop guard: if we land back here still signed out, the
      // sign-in round trip did not take and we stop bouncing.
      "Set-Cookie": `${ATTEMPT_COOKIE}=1; Path=/; Domain=.myfenrir.com; Max-Age=300; SameSite=Lax; Secure`,
    },
  });
}

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
  const fenrirSession = await readSession(context.request, context.env);
  if (!fenrirSession) {
    // Already came back from sign-in and still no session: stop looping and
    // hand the visitor to the community's own login.
    return readCookie(context.request, ATTEMPT_COOKIE)
      ? fallbackResponse(next)
      : signInRedirect(requestUrl, next);
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
    headers.append(
      "Set-Cookie",
      "fenrir_community_sso_attempted=; Path=/; Domain=.myfenrir.com; Max-Age=0; SameSite=Lax; Secure",
    );
    for (const cookie of sessionCookies(`sb-${ref}-auth-token`, value)) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("community_sso_failed", error instanceof Error ? error.message : "unknown");
    return fallbackResponse(next);
  }
}
