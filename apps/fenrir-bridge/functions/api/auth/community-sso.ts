import { readCookie, readSession } from "../../_lib/auth";
import {
  readCommunitySession,
  type CommunityAuthEnv,
  type CommunitySessionPayload,
} from "../../_lib/community-auth";
import {
  mintSupabaseSharedSessionCookies,
  type SupabaseSharedEnv,
} from "../../_lib/supabase-shared-session";

type Env = {
  SESSION_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FENRIR_COMMUNITY_AUTH_SECRET?: string;
  NEON_DATABASE_URL?: string;
};

const COMMUNITY_ORIGIN = "https://communities.myfenrir.com";
// Where a signed-out visitor is parked to authenticate. It has to be an app
// route rather than this endpoint, because safeReturnPath() refuses to send an
// OAuth `return_to` at /api/auth/* — that guard stays exactly as it is.
const SIGN_IN_PATH = "/main";
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
    return url.origin === COMMUNITY_ORIGIN
      ? url.toString()
      : `${COMMUNITY_ORIGIN}/dashboard`;
  } catch {
    return `${COMMUNITY_ORIGIN}/dashboard`;
  }
}

function loginFallback(next: string) {
  const url = new URL("/login", COMMUNITY_ORIGIN);
  url.searchParams.set("sso", "0");
  const target = new URL(next);
  url.searchParams.set(
    "next",
    `${target.pathname}${target.search}${target.hash}`
  );
  return url.toString();
}

function fallbackResponse(next: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: loginFallback(next),
      "Cache-Control": "no-store",
      "Set-Cookie":
        "fenrir_community_sso_attempted=1; Path=/; Domain=.myfenrir.com; Max-Age=120; SameSite=Lax; Secure",
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
  const signIn = new URL(SIGN_IN_PATH, requestUrl.origin);
  signIn.searchParams.set("next", `${handoff.pathname}${handoff.search}`);
  return new Response(null, {
    status: 302,
    headers: {
      Location: signIn.toString(),
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
  for (
    let index = 0;
    index * STORAGE_CHUNK_SIZE < encodedValue.length;
    index += 1
  ) {
    cookies.push(
      `${encodedName}.${index}=${encodedValue.slice(
        index * STORAGE_CHUNK_SIZE,
        (index + 1) * STORAGE_CHUNK_SIZE
      )}; ${attributes}`
    );
  }
  return cookies;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const requestUrl = new URL(context.request.url);
  const next = safeNext(requestUrl.searchParams.get("next"));

  // --- Resolve identity: prefer operator session, fall back to community session ---
  const fenrirSession = await readSession(context.request, context.env);
  const communitySession: CommunitySessionPayload | null = fenrirSession
    ? null
    : await readCommunitySession(
        context.request,
        context.env as CommunityAuthEnv
      ).catch(() => null);

  const resolvedEmail = fenrirSession?.email ?? communitySession?.email;
  const resolvedName =
    fenrirSession?.name ?? communitySession?.email?.split("@")[0] ?? "";
  const resolvedUserId =
    fenrirSession?.frisky_user_id ?? communitySession?.user_id ?? "";

  if (!resolvedEmail) {
    // No session of either type. Redirect to sign-in (or fallback if already
    // attempted once to prevent looping).
    return readCookie(context.request, ATTEMPT_COOKIE)
      ? fallbackResponse(next)
      : signInRedirect(requestUrl, next);
  }

  // --- Mint Supabase shared session and redirect to Community Bridge ---
  try {
    const supabaseCookies = await mintSupabaseSharedSessionCookies(
      context.env as SupabaseSharedEnv,
      resolvedEmail,
      { name: resolvedName, fenrirUserId: resolvedUserId }
    );

    // mintSupabaseSharedSessionCookies is best-effort. If Supabase env vars are
    // missing or the mint fails, fall back to the inline implementation so the
    // operator-session path keeps working exactly as before.
    if (!supabaseCookies.length && fenrirSession) {
      return await mintInlineSupabaseSession(
        context.env,
        fenrirSession.email,
        fenrirSession.name,
        fenrirSession.frisky_user_id,
        next
      );
    }

    if (!supabaseCookies.length) {
      // Community session exists but Supabase mint failed — still redirect to
      // community login so the user isn't stuck in a loop.
      return fallbackResponse(next);
    }

    const headers = new Headers({
      Location: next,
      "Cache-Control": "no-store",
    });
    headers.append(
      "Set-Cookie",
      "fenrir_community_sso_attempted=; Path=/; Domain=.myfenrir.com; Max-Age=0; SameSite=Lax; Secure"
    );
    for (const cookie of supabaseCookies) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error(
      "community_sso_failed",
      error instanceof Error ? error.message : "unknown"
    );
    return fallbackResponse(next);
  }
}

/**
 * Legacy inline Supabase session minting — kept as fallback for the operator-session
 * path if mintSupabaseSharedSessionCookies returns empty (e.g. missing service key
 * in env). This preserves the previous behavior byte-for-byte.
 */
async function mintInlineSupabaseSession(
  env: Env,
  email: string,
  name: string,
  friskyUserId: string,
  next: string
) {
  const supabaseUrl = required(env.SUPABASE_URL, "SUPABASE_URL").replace(
    /\/$/,
    ""
  );
  const anonKey = required(env.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");
  const serviceKey = required(
    env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY"
  );

  const linkResponse = await fetch(
    `${supabaseUrl}/auth/v1/admin/generate_link`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "magiclink",
        email,
        options: { data: { full_name: name, fenrir_user_id: friskyUserId } },
      }),
    }
  );
  const link = (await linkResponse.json().catch(() => null)) as {
    hashed_token?: string;
  } | null;
  if (!linkResponse.ok || !link?.hashed_token)
    throw new Error("supabase_generate_link_failed");

  const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ token_hash: link.hashed_token, type: "magiclink" }),
  });
  const auth = (await verifyResponse.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    user?: unknown;
  } | null;
  if (
    !verifyResponse.ok ||
    !auth?.access_token ||
    !auth.refresh_token ||
    !auth.user
  ) {
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
    "fenrir_community_sso_attempted=; Path=/; Domain=.myfenrir.com; Max-Age=0; SameSite=Lax; Secure"
  );
  for (const cookie of sessionCookies(`sb-${ref}-auth-token`, value))
    headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
