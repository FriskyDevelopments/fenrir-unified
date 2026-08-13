import { noStoreJson } from "../../../_lib/responses";
import {
  createOAuthTransaction,
  getAuthorizationUrl,
  isDirectOAuthAvailable,
  isOAuthProvider,
  safeReturnPath,
  transactionSetCookie,
  type OAuthEnv
} from "../../../_lib/oauth";
import { authOrigin } from "../../../_lib/billing-env";
import { cookieDomain } from "../../../_lib/billing-env";
import { hasHumanVerification, verificationClearCookie } from "../../../_lib/verification";

export const onRequestGet: PagesFunction<OAuthEnv> = async (context) => {
  const provider = context.params.provider;
  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  if (!await hasHumanVerification(context.request, context.env)) {
    return noStoreJson({ ok: false, error: "human_verification_required" }, { status: 403 });
  }

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

  const origin = authOrigin(context.request, context.env);
  const redirectUri = `${origin}/api/auth/callback/${provider}`;
  const requestUrl = new URL(context.request.url);
  const tx = await createOAuthTransaction(provider, context.env, safeReturnPath(requestUrl.searchParams.get("return_to")));
  const url = await getAuthorizationUrl(provider, context.env, redirectUri, tx);

  const headers = new Headers({ Location: url });
  headers.append("Set-Cookie", await transactionSetCookie(tx, context.env));
  headers.append("Set-Cookie", verificationClearCookie(cookieDomain(context.request, context.env)));
  return new Response(null, { status: 302, headers });
};
