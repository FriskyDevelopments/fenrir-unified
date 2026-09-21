import { readCookie, readSession } from "../../_lib/auth";
import { canonicalFenrirLoginUrl } from "../../_lib/fenrir-login";

type Env = {
  SESSION_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const COMMUNITY_ORIGIN = "https://communities.myfenrir.com";
const ATTEMPT_COOKIE = "__Host-fenrir_community_sso_attempted";
const LEGACY_ATTEMPT_COOKIE = "fenrir_community_sso_attempted";
const ATTEMPT_COOKIE_ATTRIBUTES = "Path=/; Max-Age=300; SameSite=Lax; Secure; HttpOnly";

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
      "Set-Cookie": `${ATTEMPT_COOKIE}=1; ${ATTEMPT_COOKIE_ATTRIBUTES}`,
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
      "Set-Cookie": `${ATTEMPT_COOKIE}=1; ${ATTEMPT_COOKIE_ATTRIBUTES}`,
    },
  });
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

    // The one-time token lives in the URL fragment. Fragments are not sent to
    // the Community server and are not included in Referer headers. Community
    // redeems it directly with Supabase, persists the resulting session only
    // on its own origin, and immediately removes the fragment from history.
    const target = new URL(next);
    const fragment = new URLSearchParams(target.hash.slice(1));
    fragment.set("fenrir_handoff", link.hashed_token);
    fragment.set("fenrir_handoff_type", "magiclink");
    target.hash = fragment.toString();

    const headers = new Headers({
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    headers.append(
      "Set-Cookie",
      `${ATTEMPT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`,
    );
    // Clear the legacy domain cookie left by pre-cutover deployments.
    headers.append(
      "Set-Cookie",
      `${LEGACY_ATTEMPT_COOKIE}=; Path=/; Domain=.myfenrir.com; Max-Age=0; SameSite=Lax; Secure; HttpOnly`,
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("community_sso_failed", error instanceof Error ? error.message : "unknown");
    return fallbackResponse(next);
  }
}
