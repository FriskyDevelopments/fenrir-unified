import { clearCookieHeader, sessionCookieName } from "../../_lib/auth";
import { cookieDomain, type BillingEnv } from "../../_lib/billing-env";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const headers = new Headers({ "Cache-Control": "no-store" });
  // Clear both variants. Older releases minted a host-only cookie while newer
  // releases use the parent domain; either one can otherwise keep /main alive.
  headers.append("Set-Cookie", clearCookieHeader(sessionCookieName()));
  const domain = cookieDomain(context.request, context.env);
  if (domain) headers.append("Set-Cookie", clearCookieHeader(sessionCookieName(), domain));
  return Response.json({ ok: true }, { headers });
};
