import { sessionSetCookie, signSession } from "../../../_lib/auth";
import { cookieDomain, siteOrigin } from "../../../_lib/billing-env";
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
    if (context.env.DB) {
      await ensureDefaultWorkspace(context.env.DB, sessionPayload);
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
    return redirectWithAuthError(siteBase, error instanceof Error ? error.message : "workos_exchange_failed", null, stateDomain);
  }
};

function redirectWithAuthError(siteBase: string, error: string, detail: string | null, domain?: string) {
  const params = new URLSearchParams({ auth_error: error });
  if (detail) params.set("auth_error_detail", detail);
  const headers = new Headers({ Location: `${siteBase}/login?${params.toString()}` });
  headers.append("Set-Cookie", clearStateCookie(domain));
  return new Response(null, { status: 302, headers });
}
