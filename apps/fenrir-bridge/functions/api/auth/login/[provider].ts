import {
  betterAuthEnabled,
  betterAuthOrigin,
  configuredBetterAuthProviders,
  isFriskySocialProvider,
  type FriskyBetterAuthEnv,
} from "../../../_lib/better-auth";
import {
  createOAuthTransaction,
  getAuthorizationUrl,
  isDirectOAuthAvailable,
  isOAuthProvider,
  safeReturnPath,
  transactionSetCookie,
  type OAuthEnv,
} from "../../../_lib/oauth";
import { authOrigin } from "../../../_lib/billing-env";
import { noStoreJson } from "../../../_lib/responses";

export const onRequestGet: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  const provider = context.params.provider;
  if (!betterAuthEnabled(context.env)) {
    const legacyEnv = context.env as OAuthEnv;
    if (!isOAuthProvider(provider)) {
      return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
    }
    if (!isDirectOAuthAvailable(provider, legacyEnv)) {
      return noStoreJson({ ok: false, error: "direct_oauth_disabled" }, { status: 410 });
    }
    const requestUrl = new URL(context.request.url);
    const authBase = authOrigin(context.request, context.env);
    const tx = await createOAuthTransaction(
      provider,
      legacyEnv,
      safeReturnPath(requestUrl.searchParams.get("return_to")),
    );
    const redirectUri = `${authBase}/api/auth/callback/${provider}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: await getAuthorizationUrl(provider, legacyEnv, redirectUri, tx),
        "Set-Cookie": await transactionSetCookie(tx, legacyEnv),
      },
    });
  }
  if (!isFriskySocialProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  if (!configuredBetterAuthProviders(context.env).includes(provider)) {
    return noStoreJson(
      {
        ok: false,
        error: "better_auth_provider_disabled",
        detail: "The provider is not configured in Better Auth."
      },
      { status: 503 }
    );
  }

  const requestUrl = new URL(context.request.url);
  const returnTo = safeReturnPath(requestUrl.searchParams.get("return_to"));
  const target = new URL("/sign-in", betterAuthOrigin(context.env));
  target.searchParams.set("provider", provider);
  target.searchParams.set("return_to", returnTo);

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString(), "Cache-Control": "no-store" }
  });
};
