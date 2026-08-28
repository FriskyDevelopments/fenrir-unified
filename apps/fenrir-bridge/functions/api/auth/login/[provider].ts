import { noStoreJson } from "../../../_lib/responses";
import { isOAuthProvider, type OAuthEnv } from "../../../_lib/oauth";
import { siteOrigin } from "../../../_lib/billing-env";

export const onRequestGet: PagesFunction<OAuthEnv> = async (context) => {
  const provider = context.params.provider;
  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: "unsupported_provider" }, { status: 404 });
  }

  const origin = siteOrigin(context.request, context.env);
  const requestUrl = new URL(context.request.url);
  const returnTo = requestUrl.searchParams.get("return_to") || requestUrl.searchParams.get("redirect") || "/main";
  const target = new URL(`/auth/${provider}`, origin);
  target.searchParams.set("redirect", returnTo);
  return Response.redirect(target.toString(), 302);
};
