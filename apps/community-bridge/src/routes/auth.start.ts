import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  OAUTH_COOKIE,
  OAUTH_FLOW_MAX_AGE,
  buildAuthorizeUrl,
  createState,
  encodeOauthFlow,
  generatePkce,
  isAuthentikConfigured,
  safeNext,
  serializeCookie,
} from "@/lib/authentik.server";
import { consumeHumanVerification } from "@/lib/human-verification.server";

export const Route = createFileRoute("/auth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => startCommunityAuth(request),
    },
  },
});

function bounded(value: string | null, maximum: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed && trimmed.length <= maximum ? trimmed : null;
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/**
 * Top-level navigation is intentional.  It sets the PKCE/nonce cookie and
 * leaves for Authentik in one response, avoiding a fetch-navigation race that
 * can lose the temporary cookie before the OAuth callback reaches Quality.
 */
async function startCommunityAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const slug = bounded(url.searchParams.get("slug"), 60);
  const brand = bounded(url.searchParams.get("brand"), 80);
  const communityId = bounded(url.searchParams.get("community"), 80);
  const next = safeNext(url.searchParams.get("next"));

  if (!isAuthentikConfigured()) return redirect(`/login?error=not_configured`);

  try {
    await consumeHumanVerification({ slug: slug ?? undefined, brandId: brand ?? undefined });
  } catch {
    const verify = new URLSearchParams();
    verify.set("next", next ?? "/gates");
    if (slug) verify.set("slug", slug);
    if (brand) verify.set("brand", brand);
    return redirect(`/verify?${verify.toString()}`);
  }

  const { verifier, challenge } = await generatePkce();
  const { state, nonce } = await createState({
    slug,
    community_id: communityId,
    brand_id: brand,
    next,
  });
  const flow = await encodeOauthFlow({
    code_verifier: verifier,
    nonce,
    state,
    exp: Math.floor(Date.now() / 1000) + OAUTH_FLOW_MAX_AGE,
  });
  const authorizeUrl = await buildAuthorizeUrl(state, challenge, nonce);
  return redirect(authorizeUrl, serializeCookie(OAUTH_COOKIE, flow, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_FLOW_MAX_AGE,
  }));
}
