import { sessionSetCookie, signSession } from "../../_lib/auth";
import { cookieDomain, siteOrigin } from "../../_lib/billing-env";
import { readSessionTransfer, safeReturnPath, type OAuthEnv } from "../../_lib/oauth";

export const onRequestGet: PagesFunction<OAuthEnv> = async (context) => {
  const url = new URL(context.request.url);
  const transfer = await readSessionTransfer(url.searchParams.get("token") ?? "", context.env);
  const currentUrl = new URL(context.request.url);
  const currentOrigin = `${currentUrl.protocol}//${currentUrl.host}`;
  const siteBase = siteOrigin(context.request, context.env);

  if (!transfer) {
    return Response.redirect(`${siteBase}/login?auth_error=oauth_transfer_invalid`, 302);
  }

  const session = await signSession(transfer.session, context.env);
  const returnTo = safeReturnPath(transfer.returnTo);
  
  // If returnTo is an absolute URL, use it directly.
  // Otherwise, use the current origin + returnTo.
  const finalLocation = returnTo.startsWith("http") ? returnTo : `${currentOrigin}${returnTo}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: finalLocation,
      "Set-Cookie": sessionSetCookie(session, cookieDomain(context.request, context.env))
    }
  });
};
