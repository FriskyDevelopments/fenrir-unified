import { clearCookieHeader, sessionCookieName } from "../../_lib/auth";
import { cookieDomain, type BillingEnv } from "../../_lib/billing-env";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const headers = new Headers({ "Cache-Control": "no-store" });
  // Supabase completion sets a host-only cookie; older login paths also set a
  // parent-domain cookie. Expire both so neither survives a successful logout.
  headers.append("Set-Cookie", clearCookieHeader(sessionCookieName()));
  const domain = cookieDomain(context.request, context.env);
  if (domain) headers.append("Set-Cookie", clearCookieHeader(sessionCookieName(), domain));
  return Response.json(
    { ok: true },
    { headers }
  );
};
