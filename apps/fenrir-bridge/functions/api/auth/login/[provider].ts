import { noStoreJson } from "../../../_lib/responses";
import {
  createOAuthTransaction,
  getAuthorizationUrl,
  isDirectOAuthAvailable,
  isOAuthProvider,
  safeReturnPath,
  transactionSetCookie,
  type OAuthEnv,
} from "../../../_lib/oauth";
import { authOrigin, siteOrigin } from "../../../_lib/billing-env";
import { friskyAuthEnabled } from "../../../_lib/frisky-auth";
import { FRISKY_AUTH_BASE_PATH } from "@frisky/auth";
import { publicFenrirAuthWorkerIsLive } from "../../../_lib/fenrir-login";

export const onRequestGet: PagesFunction<OAuthEnv> = async (context) => {
  const provider = context.params.provider;
  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  if (friskyAuthEnabled(context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: "use_frisky_auth",
        detail: `App login uses Better Auth at ${FRISKY_AUTH_BASE_PATH}. Direct /api/auth/login/* is leftover and not the identity plane.`,
      },
      { status: 410 },
    );
  }

  const origin = siteOrigin(context.request, context.env);
  const requestUrl = new URL(context.request.url);
  const returnTo = safeReturnPath(
    requestUrl.searchParams.get("return_to") || requestUrl.searchParams.get("redirect") || "/main",
  );

  if (await publicFenrirAuthWorkerIsLive(origin)) {
    const target = new URL(`/auth/${provider}`, origin);
    target.searchParams.set("redirect", returnTo);
    return Response.redirect(target.toString(), 302);
  }

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

  const redirectUri = `${authOrigin(context.request, context.env)}/api/auth/callback/${provider}`;
  const tx = await createOAuthTransaction(provider, context.env, returnTo);
  const url = await getAuthorizationUrl(provider, context.env, redirectUri, tx);

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": await transactionSetCookie(tx, context.env),
    },
  });
};
