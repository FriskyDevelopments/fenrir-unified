import { clearCookieHeader, sessionCookieName } from '../../_lib/auth';
import { cookieDomain, type BillingEnv } from '../../_lib/billing-env';

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': clearCookieHeader(
          sessionCookieName(),
          cookieDomain(context.request, context.env)
        ),
      },
    }
  );
};
