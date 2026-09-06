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
 * Handles OAuth callback requests for supported providers.
 *
 * @returns A response that completes authentication, redirects to the login page on failure, or reports an unavailable or unsupported provider.
 */
async function handleCallback(context: EventContext<OAuthEnv, "provider", unknown>) {
  const provider = context.params.provider;

  if (provider === "apple") {
    return noStoreJson(
      {
        ok: false,
        error: "direct_oauth_retired",
        detail: "Apple direct OAuth is disabled. Use the Fenrir Better Auth Worker at /auth/apple when it is live, or Better Auth at /api/frisky-auth when FRISKY_AUTH_ENABLED=1 (marketing may still list Apple; it is not live until Apple env + callbacks are set)."
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
