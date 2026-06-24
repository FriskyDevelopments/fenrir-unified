import { noStoreJson } from "../../../_lib/responses";
import {
  clearTransactionCookie,
  exchangeCodeForSession,
  isDirectOAuthAvailable,
  isOAuthProvider,
  readOAuthTransaction,
  safeReturnPath,
  signSessionTransfer,
  validateOAuthTransaction,
  type OAuthEnv
} from "../../../_lib/oauth";
import { authOrigin, siteOrigin } from "../../../_lib/billing-env";
import { ensureDefaultWorkspace } from "../../../_lib/workspaces";
import { upsertProfileForSession } from "../../../_lib/supabase-profiles";
import { resolveFriskyAccountId, type SupabaseAdminEnv } from "../../../_lib/frisky-account";

async function handleCallback(context: EventContext<OAuthEnv, "provider", unknown>) {
  const provider = context.params.provider;
  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  const siteBase = siteOrigin(context.request, context.env);
  if (!isDirectOAuthAvailable(provider, context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: "direct_oauth_disabled",
        detail: "Set the direct OAuth client ID/secret environment variables for this provider."
      },
      { status: 410 }
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
  const callbackUri = `${authBase}/api/auth/callback/${provider}`;

  try {
    const tx = await readOAuthTransaction(context.request, context.env);
    validateOAuthTransaction(tx, provider, state);
    const result = await exchangeCodeForSession(provider, context.env, code, callbackUri, tx!);
    const sessionPayload = result.session;

    // Fenrir Protocol: collapse this verified email onto the one canonical
    // master account (Supabase auth.users UUID), exactly like the WorkOS
    // callback. Without this, a human who signs in via direct Google/Apple
    // OAuth gets a session with NO frisky_account_id while the same human via
    // WorkOS gets one — defeating "one login across products". Never blocks
    // login: resolveFriskyAccountId returns null when the admin API is
    // unconfigured/unreachable, and we keep the legacy synthetic id.
    const accountId = await resolveFriskyAccountId(
      context.env as unknown as SupabaseAdminEnv,
      sessionPayload.email
    ).catch(() => null);
    if (accountId) {
      sessionPayload.frisky_account_id = accountId;
    }

    if (context.env.DB) {
      await ensureDefaultWorkspace(context.env.DB, sessionPayload);
    }
    await upsertProfileForSession(context.env, sessionPayload, result.identityId);

    const returnToUrl = tx?.returnTo ?? "/main";
    let finalLocation: string;

    if (returnToUrl.startsWith("http")) {
      const targetUrl = new URL(returnToUrl);
      const targetOrigin = `${targetUrl.protocol}//${targetUrl.host}`;
      finalLocation = `${targetOrigin}/api/auth/complete?token=${encodeURIComponent(await signSessionTransfer(sessionPayload, returnToUrl, context.env))}`;
    } else {
      finalLocation = `${siteBase}/api/auth/complete?token=${encodeURIComponent(await signSessionTransfer(sessionPayload, returnToUrl, context.env))}`;
    }

    const headers = new Headers({
      Location: finalLocation
    });
    headers.append("Set-Cookie", clearTransactionCookie());
    return new Response(null, {
      status: 302,
      headers
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
      "Set-Cookie": clearTransactionCookie()
    }
  });
}
