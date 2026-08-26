import { noStoreJson } from "./responses";
import {
  clearTransactionCookie,
  exchangeCodeForSession,
  isDirectOAuthAvailable,
  isOAuthProvider,
  readOAuthTransaction,
  signSessionTransfer,
  validateOAuthTransaction,
  type OAuthEnv,
} from "./oauth";
import { authOrigin, siteOrigin } from "./billing-env";
import { ensureDefaultWorkspace } from "./workspaces";
import { upsertProfileForSession } from "./supabase-profiles";

export async function handleLegacyAuthCallback(
  context: EventContext<OAuthEnv, "provider", unknown>,
) {
  const provider = context.params.provider;
  if (provider === "apple") {
    return noStoreJson(
      {
        ok: false,
        error: "direct_oauth_retired",
        detail: "Apple direct OAuth has been retired. Use the configured Apple broker.",
      },
      { status: 410 },
    );
  }
  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  const siteBase = siteOrigin(context.request, context.env);
  if (!isDirectOAuthAvailable(provider, context.env)) {
    return noStoreJson({ ok: false, error: "direct_oauth_disabled" }, { status: 410 });
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
  if (!code) return redirectWithAuthError(siteBase, "missing_code", null);

  const redirectUri = `${authOrigin(context.request, context.env)}/api/auth/callback/${provider}`;
  try {
    const tx = await readOAuthTransaction(context.request, context.env);
    validateOAuthTransaction(tx, provider, state);
    const result = await exchangeCodeForSession(provider, context.env, code, redirectUri, tx!);
    const sessionPayload = context.env.DB
      ? await ensureDefaultWorkspace(context.env.DB, result.session)
      : result.session;
    await upsertProfileForSession(context.env, sessionPayload, result.identityId);

    const token = await signSessionTransfer(
      sessionPayload,
      tx?.returnTo ?? "/main",
      context.env,
    );
    const headers = new Headers({
      Location: `${siteBase}/api/auth/complete?token=${encodeURIComponent(token)}`,
    });
    headers.append("Set-Cookie", clearTransactionCookie());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return redirectWithAuthError(
      siteBase,
      error instanceof Error ? error.message : "oauth_exchange_failed",
      null,
    );
  }
}

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
