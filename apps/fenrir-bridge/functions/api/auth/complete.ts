import { sessionSetCookie, signSession } from "../../_lib/auth";
import { cookieDomain, siteOrigin } from "../../_lib/billing-env";
import { readSessionTransfer, safeReturnPath, type OAuthEnv } from "../../_lib/oauth";

export const onRequestGet: PagesFunction<OAuthEnv> = async (context) => {
  const url = new URL(context.request.url);
  const transfer = await readSessionTransfer(url.searchParams.get("token") ?? "", context.env);
  const siteBase = siteOrigin(context.request, context.env);

  if (!transfer) {
    return Response.redirect(`${siteBase}/login?auth_error=oauth_transfer_invalid`, 302);
  }

  const session = await signSession(transfer.session, context.env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${siteBase}${safeReturnPath(transfer.returnTo)}`,
      "Set-Cookie": sessionSetCookie(session, cookieDomain(context.request, context.env))
    }
  });
};
