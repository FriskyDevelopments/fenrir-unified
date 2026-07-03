import { sessionSetCookie, signSession } from "../../../_lib/auth";
import { cookieDomain, siteOrigin } from "../../../_lib/billing-env";
import { resolveFriskyAccountId, type SupabaseAdminEnv } from "../../../_lib/frisky-account";
import { ensureCommunityUserByEmail, type CommunityAuthEnv } from "../../../_lib/community-auth";
import { ensureDefaultWorkspace } from "../../../_lib/workspaces";
import {
  clearStateCookie,
  exchangeCodeForSession,
  isWorkOSConfigured,
  readState,
  safeReturnPath,
  type WorkOSEnv
} from "../../../_lib/workos";

export const onRequestGet: PagesFunction<WorkOSEnv> = async (context) => {
  const siteBase = siteOrigin(context.request, context.env);
  // State cookie was set Domain-scoped at login; clear it with the same scope.
  const stateDomain = cookieDomain(context.request, context.env);

  if (!isWorkOSConfigured(context.env)) {
    return redirectWithAuthError(siteBase, "workos_not_configured", null, stateDomain);
  }

  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");

  if (providerError) {
    return redirectWithAuthError(siteBase, providerError, providerErrorDescription, stateDomain);
  }
  if (!code) {
    return redirectWithAuthError(siteBase, "missing_code", null, stateDomain);
  }

  try {
    const stored = await readState(context.request, context.env);
    if (!stored || !state || stored.state !== state) {
      throw new Error("workos_state_invalid");
    }

    const { session: sessionPayload } = await exchangeCodeForSession(context.env, code);

    // ── Enrichment is BEST-EFFORT and must NEVER block login ──────────────────
    // Once WorkOS returns a verified email the user IS authenticated; resolving
    // their Supabase master account, Neon community record, and D1 workspace are
    // enhancements. A hiccup in any of them (env drift, schema change, network)
    // must not throw the successful auth into the catch below and bounce the user
    // back to /login — that is the recurring "it authenticates but won't log in"
    // regression. Each step is individually guarded; failures degrade, not block.

    // Fenrir Protocol: collapse this verified email onto the one canonical master
    // account (Supabase auth.users UUID). Falls back to the legacy synthetic id.
    try {
      const accountId = await resolveFriskyAccountId(context.env as unknown as SupabaseAdminEnv, sessionPayload.email);
      if (accountId) sessionPayload.frisky_account_id = accountId;
    } catch (e) {
      console.error("callback enrichment: resolveFriskyAccountId failed (non-blocking)", e);
    }

    // Community Bridge master: resolve/create the Neon `fenrir_community_users` record.
    try {
      const communityUser = await ensureCommunityUserByEmail(
        context.env as unknown as CommunityAuthEnv,
        sessionPayload.email,
        sessionPayload.name
      );
      if (communityUser) sessionPayload.community_user_id = communityUser.id;
    } catch (e) {
      console.error("callback enrichment: ensureCommunityUserByEmail failed (non-blocking)", e);
    }

    // Default D1 workspace bootstrap.
    if (context.env.DB) {
      try {
        await ensureDefaultWorkspace(context.env.DB, sessionPayload);
      } catch (e) {
        console.error("callback enrichment: ensureDefaultWorkspace failed (non-blocking)", e);
      }
    }

    const session = await signSession(sessionPayload, context.env);
    // stored.returnTo is relative-only (safeReturnPath); never an off-site URL.
    const returnTo = safeReturnPath(stored.returnTo);
    const finalLocation = `${siteBase}${returnTo}`;

    const headers = new Headers({ Location: finalLocation });
    headers.append("Set-Cookie", sessionSetCookie(session, stateDomain));
    headers.append("Set-Cookie", clearStateCookie(stateDomain));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("WorkOS callback failed", error);
    return redirectWithAuthError(siteBase, safeAuthErrorCode(error), null, stateDomain);
  }
};

// Allow-list the error codes that may appear in the user-visible /login URL.
// Anything else (e.g. an unexpected runtime error whose message could carry
// internal detail) collapses to a single generic code.
const KNOWN_AUTH_ERRORS = new Set([
  "workos_state_invalid",
  "workos_token_exchange_failed",
  "workos_missing_email",
  "workos_missing_user_id",
  "missing_env:SESSION_SECRET",
  "missing_env:WORKOS_CLIENT_ID",
  "missing_env:WORKOS_API_KEY"
]);

function safeAuthErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return KNOWN_AUTH_ERRORS.has(message) ? message : "workos_exchange_failed";
}

function redirectWithAuthError(siteBase: string, error: string, detail: string | null, domain?: string) {
  const params = new URLSearchParams({ auth_error: error });
  if (detail) params.set("auth_error_detail", detail);
  const headers = new Headers({ Location: `${siteBase}/login?${params.toString()}` });
  headers.append("Set-Cookie", clearStateCookie(domain));
  return new Response(null, { status: 302, headers });
}
