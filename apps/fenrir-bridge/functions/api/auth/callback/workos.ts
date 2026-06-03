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

  if (!isWorkOSConfigured(context.env)) {
    return redirectWithAuthError(siteBase, "workos_not_configured", null);
  }

  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");

  if (providerError) {
    return redirectWithAuthError(siteBase, providerError, providerErrorDescription);
  }
  if (!code) {
    return redirectWithAuthError(siteBase, "missing_code", null);
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
    const returnTo = safeReturnPath(stored.returnTo);
    const finalLocation = returnTo.startsWith("http") ? returnTo : `${siteBase}${returnTo}`;

    const headers = new Headers({ Location: finalLocation });
    headers.append("Set-Cookie", sessionSetCookie(session, cookieDomain(context.request, context.env)));
    headers.append("Set-Cookie", clearStateCookie());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("WorkOS callback failed", error);
    return redirectWithAuthError(siteBase, error instanceof Error ? error.message : "workos_exchange_failed", null);
  }
};

function redirectWithAuthError(siteBase: string, error: string, detail: string | null) {
  const params = new URLSearchParams({ auth_error: error });
  if (detail) params.set("auth_error_detail", detail);
  const headers = new Headers({ Location: `${siteBase}/login?${params.toString()}` });
  headers.append("Set-Cookie", clearStateCookie());
  return new Response(null, { status: 302, headers });
}
