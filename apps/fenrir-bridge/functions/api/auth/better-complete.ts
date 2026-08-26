import {
  createFriskyBetterAuth,
  isFriskySocialProvider,
  type FriskyBetterAuthEnv,
} from "../../_lib/better-auth";
import { createSessionPayload, sessionSetCookie, signSession } from "../../_lib/auth";
import { cookieDomain, siteOrigin } from "../../_lib/billing-env";
import { safeReturnPath } from "../../_lib/oauth";
import { upsertProfileForSession } from "../../_lib/supabase-profiles";
import { ensureDefaultWorkspace } from "../../_lib/workspaces";

export const onRequestGet: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  const url = new URL(context.request.url);
  const siteBase = siteOrigin(context.request, context.env);
  const returnTo = safeReturnPath(url.searchParams.get("return_to"));
  const providerValue = url.searchParams.get("provider");
  const provider = isFriskySocialProvider(providerValue) ? providerValue : "microsoft";

  const { auth, pool } = createFriskyBetterAuth(context.env);
  try {
    const session = await auth.api.getSession({ headers: context.request.headers });
    if (!session?.user?.id || !session.user.email) {
      return Response.redirect(`${siteBase}/login?auth_error=better_auth_session_missing`, 302);
    }

    const candidate = createSessionPayload({
      email: session.user.email,
      name: session.user.name || session.user.email,
      provider,
      identityId: `better-auth:${session.user.id}`,
    });
    const canonical = context.env.DB
      ? await ensureDefaultWorkspace(context.env.DB, candidate)
      : candidate;
    await upsertProfileForSession(context.env, canonical, session.user.id);

    const legacyToken = await signSession(canonical, context.env);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${siteBase}${returnTo}`,
        "Set-Cookie": sessionSetCookie(
          legacyToken,
          cookieDomain(context.request, context.env),
        ),
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await pool.end();
  }
};
