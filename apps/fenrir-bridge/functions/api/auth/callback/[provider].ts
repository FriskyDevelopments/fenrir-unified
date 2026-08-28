import { noStoreJson } from "../../../_lib/responses";
import {
  clearTransactionCookie,
  exchangeCodeForSession,
  isDirectOAuthAvailable,
  isOAuthProvider,
  readOAuthTransaction,
  signSessionTransfer,
  validateOAuthTransaction,
  type OAuthEnv,
} from "../../../_lib/oauth";
import { authOrigin, siteOrigin } from "../../../_lib/billing-env";
import { ensureDefaultWorkspace } from "../../../_lib/workspaces";
import { upsertProfileForSession } from "../../../_lib/supabase-profiles";

/**
 * Processes an OAuth callback and redirects the user after authentication.
 *
 * @returns An HTTP response indicating provider availability or redirecting to the login or completion page.
 */
async function handleCallback(context: EventContext<OAuthEnv, "provider", unknown>) {
  const provider = context.params.provider;

  if (provider === "apple") {
    return noStoreJson(
      {
        ok: false,
        error: "direct_oauth_retired",
        detail: "Apple sign-in is the Better Auth Worker at /auth/apple when that Worker is live.",
      },
      { status: 410 },
    );
  }

  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  const siteBase = siteOrigin(context.request, context.env);
  if (!isDirectOAuthAvailable(provider, context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: "direct_oauth_disabled",
        detail: "Set the direct OAuth client ID/secret environment variables for this provider.",
      },
      { status: 410 },
    );
  }

  let code: string | null = null;
  let state: string | null = null;
  let providerError: string | null = null;
  let providerErrorDescription: string | null = null;
  const url = new URL(context.request.url);

  if (context.request.method === "POST") {
    const formData = await context.request.formData();
    code = formData.get("code") as string | null;
    state = formData.get("state") as string | null;
    providerError = formData.get("error") as string | null;
    providerErrorDescription = formData.get("error_description") as string | null;
  } else {
    code = url.searchParams.get("code");
    state = url.searchParams.get("state");
    providerError = url.searchParams.get("error");
    providerErrorDescription = url.searchParams.get("error_description");
  }

  if (providerError) {
    return redirectWithAuthError(siteBase, providerError, providerErrorDescription);
  }

  if (!code) {
    return redirectWithAuthError(siteBase, "missing_code", null);
  }

  const authBase = authOrigin(context.request, context.env);
  const redirectUri = `${authBase}/api/auth/callback/${provider}`;

  try {
    const tx = await readOAuthTransaction(context.request, context.env);
    validateOAuthTransaction(tx, provider, state);
    const result = await exchangeCodeForSession(provider, context.env, code, redirectUri, tx!);
    const sessionPayload = context.env.DB
      ? await ensureDefaultWorkspace(context.env.DB, result.session)
      : result.session;
    await upsertProfileForSession(context.env, sessionPayload, result.identityId);

    const headers = new Headers({
      Location: `${siteBase}/api/auth/complete?token=${encodeURIComponent(await signSessionTransfer(sessionPayload, tx?.returnTo ?? "/main", context.env))}`,
    });
    headers.append("Set-Cookie", clearTransactionCookie());
    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (error) {
    return redirectWithAuthError(siteBase, error instanceof Error ? error.message : "oauth_exchange_failed", null);
  }
}

export const onRequestGet: PagesFunction<OAuthEnv> = handleCallback;
export const onRequestPost: PagesFunction<OAuthEnv> = handleCallback;

/**
 * Redirects the user to the login page with OAuth error details.
 *
 * @param siteBase - The base URL of the site.
 * @param error - The authentication error code.
 * @param detail - Additional error information, when available.
 * @returns A redirect response that clears the OAuth transaction cookie.
 */
function redirectWithAuthError(siteBase: string, error: string, detail: string | null) {
  const params = new URLSearchParams({ auth_error: error });
  if (detail) params.set("auth_error_detail", detail);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${siteBase}/login?${params.toString()}`,
      "Set-Cookie": clearTransactionCookie(),
    },
  });
}
