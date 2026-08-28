import { clearCookieHeader, sessionCookieName } from "../../_lib/auth";
import { cookieDomain, type BillingEnv } from "../../_lib/billing-env";
import { signOutFriskyAuth } from "../../_lib/frisky-auth";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const headers = new Headers({
    "Set-Cookie": clearCookieHeader(sessionCookieName(), cookieDomain(context.request, context.env)),
  });
  const betterAuthHeaders = await signOutFriskyAuth(context.request, context.env);
  if (betterAuthHeaders) {
    const setCookies =
      typeof betterAuthHeaders.getSetCookie === "function"
        ? betterAuthHeaders.getSetCookie()
        : [];
    for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  }
  return Response.json({ ok: true }, { headers });
};
