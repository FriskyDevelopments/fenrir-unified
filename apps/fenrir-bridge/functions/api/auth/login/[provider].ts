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
import { publicFenrirAuthWorkerIsLive } from "../../../_lib/fenrir-login";

export const onRequestGet: PagesFunction<OAuthEnv> = async (context) => {
  const provider = context.params.provider;
  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  const origin = siteOrigin(context.request, context.env);
  const requestUrl = new URL(context.request.url);
  const returnTo = safeReturnPath(
    requestUrl.searchParams.get("return_to") || requestUrl.searchParams.get("redirect") || "/main",
  );

  if (await publicFenrirAuthWorkerIsLive()) {
    const target = new URL(`/auth/${provider}`, origin);
    target.searchParams.set("redirect", returnTo);
    return Response.redirect(target.toString(), 302);
  }

  switch (provider) {
    case "apple":
      return noStoreJson(
        {
          ok: false,
          error: "direct_oauth_retired",
          detail: "Apple sign-in is the Better Auth Worker at /auth/apple when that Worker is ready.",
        },
        { status: 410 },
      );
    case "google":
    case "microsoft":
    case "authentik": {
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
    }
    default: {
      const _exhaustive: never = provider;
      void _exhaustive;
      return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
    }
  }
};
