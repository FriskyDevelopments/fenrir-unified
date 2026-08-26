import { clearCookieHeader, sessionCookieName } from "../../_lib/auth";
import {
  betterAuthOrigin,
  createFriskyBetterAuth,
  type FriskyBetterAuthEnv,
} from "../../_lib/better-auth";
import { cookieDomain } from "../../_lib/billing-env";

export const onRequestPost: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

  if (context.env.BETTER_AUTH_SECRET && context.env.NEON_DATABASE_URL) {
    const { auth, pool } = createFriskyBetterAuth(context.env);
    try {
      const signOutRequest = new Request(
        `${betterAuthOrigin(context.env)}/api/auth/sign-out`,
        {
          method: "POST",
          headers: {
            Cookie: context.request.headers.get("Cookie") ?? "",
            Origin: betterAuthOrigin(context.env),
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      const signOutResponse = await auth.handler(signOutRequest);
      for (const cookie of signOutResponse.headers.getSetCookie()) {
        headers.append("Set-Cookie", cookie);
      }
    } finally {
      await pool.end();
    }
  }

  headers.append(
    "Set-Cookie",
    clearCookieHeader(
      sessionCookieName(),
      cookieDomain(context.request, context.env),
    ),
  );
  return new Response(JSON.stringify({ ok: true }), { headers });
};
