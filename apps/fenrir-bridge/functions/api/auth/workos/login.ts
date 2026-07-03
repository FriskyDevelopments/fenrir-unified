import { noStoreJson } from "../../../_lib/responses";
import { authOrigin, cookieDomain } from "../../../_lib/billing-env";
import {
  buildAuthorizationUrl,
  createStatePayload,
  isWorkOSConfigured,
  isWorkOSProviderHint,
  safeReturnPath,
  stateSetCookie,
  type WorkOSEnv
} from "../../../_lib/workos";
import { isDirectOAuthAvailable, isOAuthProvider, type OAuthEnv } from "../../../_lib/oauth";

export const onRequestGet: PagesFunction<WorkOSEnv> = async (context) => {
  if (!isWorkOSConfigured(context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: "workos_not_configured",
        detail: "Set WORKOS_CLIENT_ID and WORKOS_API_KEY in the server environment."
      },
      { status: 410 }
    );
  }

  try {
    const requestUrl = new URL(context.request.url);
    const providerParam = requestUrl.searchParams.get("provider");
    const providerHint = isWorkOSProviderHint(providerParam) ? providerParam : undefined;
    const returnTo = safeReturnPath(requestUrl.searchParams.get("return_to"));

    // Prefer direct provider OAuth when the connection's client credentials are
    // configured (e.g. Google). Jumping straight to the provider skips WorkOS's
    // generic hosted AuthKit selector — the "workos box" — and lands the user on
    // Google/Microsoft/Apple's own branded sign-in. Providers without direct
    // credentials fall through to the AuthKit path below, which is the robust
    // default (AuthKit shows exactly the methods the environment has enabled).
    if (
      providerParam &&
      providerParam !== "workos" &&
      isOAuthProvider(providerParam) &&
      isDirectOAuthAvailable(providerParam, context.env as unknown as OAuthEnv)
    ) {
      const direct = new URL(`/api/auth/login/${providerParam}`, requestUrl.origin);
      if (returnTo) direct.searchParams.set("return_to", returnTo);
      return new Response(null, { status: 302, headers: { Location: direct.toString() } });
    }

    const origin = authOrigin(context.request, context.env);
    const redirectUri = `${origin}/api/auth/callback/workos`;

    const statePayload = createStatePayload(returnTo);
    const url = await buildAuthorizationUrl(context.env, redirectUri, statePayload.state, providerHint);

    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // Scope the state cookie to the registrable domain so a login started on
        // www/apex is still sent to the auth-subdomain callback. A host-only state
        // cookie is the recurring root cause of workos_state_invalid.
        "Set-Cookie": await stateSetCookie(statePayload, context.env, cookieDomain(context.request, context.env))
      }
    });
  } catch (error) {
    // A misconfigured environment must not surface as an opaque 500 on the
    // login button; bounce back to /login with a diagnosable error code.
    console.error("WorkOS login initiation failed", error);
    const message = error instanceof Error ? error.message : "workos_login_init_failed";
    const requestUrl = new URL(context.request.url);
    const siteBase = `${requestUrl.protocol}//${requestUrl.host}`;
    const params = new URLSearchParams({ auth_error: "workos_login_init_failed", auth_error_detail: message });
    return new Response(null, {
      status: 302,
      headers: { Location: `${siteBase}/login?${params.toString()}` }
    });
  }
};
