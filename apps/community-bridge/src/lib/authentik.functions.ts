import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import {
  isAuthentikConfigured,
  buildAuthorizeUrl,
  createState,
  generatePkce,
  encodeOauthFlow,
  decodeSession,
  parseCookies,
  OAUTH_COOKIE,
  OAUTH_FLOW_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type CommunityIdentity,
} from "@/lib/authentik.server";
import { consumeHumanVerification } from "@/lib/human-verification.server";

export interface CommunitySessionResult {
  configured: boolean;
  session: CommunityIdentity | null;
}

/**
 * Safe for client-side route recovery. Server functions deliberately keep the
 * detailed reason private, while routes can send a member back through the
 * Community login boundary instead of rendering a raw middleware exception.
 */
export function isCommunitySessionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error);
  return /^Unauthorized: (no Community session|invalid or expired Community session)$/.test(
    message,
  );
}

function loginHrefForRequest(request: Request | undefined): string {
  const fallback = "/gates";
  const referer = request?.headers.get("referer");
  if (!referer) return `/login?next=${encodeURIComponent(fallback)}`;
  try {
    const target = new URL(referer);
    const current = request ? new URL(request.url) : target;
    if (target.origin !== current.origin || !target.pathname.startsWith("/")) {
      return `/login?next=${encodeURIComponent(fallback)}`;
    }
    return `/login?next=${encodeURIComponent(`${target.pathname}${target.search}`)}`;
  } catch {
    return `/login?next=${encodeURIComponent(fallback)}`;
  }
}

/** Existing Community session (Authentik), read from the HttpOnly cookie. */
export const getCommunitySession = createServerFn({ method: "GET" })
  .inputValidator(() => undefined)
  .handler(async (): Promise<CommunitySessionResult> => {
    if (!isAuthentikConfigured()) return { configured: false, session: null };
    const raw = getCookie(SESSION_COOKIE);
    if (!raw) return { configured: true, session: null };
    const session = await decodeSession(raw);
    return { configured: true, session };
  });

const loginInput = z.object({
  slug: z.string().trim().toLowerCase().max(60).optional(),
  communityId: z.string().trim().max(80).optional(),
  brandId: z.string().trim().max(80).optional(),
  next: z.string().trim().max(2048).optional(),
});

/**
 * Start the Community Authentik flow. Returns the authorize URL to navigate to.
 * The PKCE verifier + nonce are held in a short-lived HttpOnly cookie, never in
 * the URL or the client bundle.
 */
export const beginAuthentikLogin = createServerFn({ method: "POST" })
  .inputValidator((data) => loginInput.parse(data))
  .handler(async ({ data }): Promise<{ authorizeUrl: string }> => {
    await consumeHumanVerification({ slug: data.slug, brandId: data.brandId });
    if (!isAuthentikConfigured()) {
      throw new Error("authentik_not_configured: set AUTHENTIK_* secrets on community-bridge-quality");
    }
    const { verifier, challenge } = await generatePkce();
    const { state, nonce } = await createState({
      slug: data.slug,
      community_id: data.communityId,
      brand_id: data.brandId,
      next: data.next,
    });
    const flow = await encodeOauthFlow({
      code_verifier: verifier,
      nonce,
      state,
      exp: Math.floor(Date.now() / 1000) + OAUTH_FLOW_MAX_AGE,
    });
    setCookie(OAUTH_COOKIE, flow, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: OAUTH_FLOW_MAX_AGE,
    });
    const authorizeUrl = await buildAuthorizeUrl(state, challenge, nonce);
    return { authorizeUrl };
  });

/** Clear the first-party Community session cookie. */
export const signOutCommunity = createServerFn({ method: "POST" })
  .inputValidator(() => undefined)
  .handler(async () => {
    setCookie(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0,
    });
    return { ok: true as const };
  });

/**
 * Server middleware: the caller must hold a valid first-party Community
 * session. Resolves the persistent ownership key (`user_id`) so gate/data
 * functions can scope reads/writes exactly like they did with the Supabase
 * user id — without fabricating a Supabase session.
 */
export const requireCommunitySession = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    if (!isAuthentikConfigured()) {
      throw new Error(
        "authentik_not_configured: set AUTHENTIK_* secrets on community-bridge-quality",
      );
    }
    const request = getRequest();
    const cookieHeader = request?.headers?.get("cookie") ?? null;
    const raw = parseCookies(cookieHeader)[SESSION_COOKIE];
    // Redirect at the protected boundary. This prevents a server-function
    // exception from leaking as "Unauthorized: no Community session" in the
    // browser when an old MyFenrir/Supabase cookie is present but cb_session is
    // not. The current internal path is preserved for post-OIDC return.
    if (!raw) throw redirect({ href: loginHrefForRequest(request) });
    const session = await decodeSession(raw);
    if (!session || !session.user_id) {
      throw redirect({ href: loginHrefForRequest(request) });
    }
    return next({
      context: {
        userId: session.user_id,
        identity: session,
      },
    });
  },
);
