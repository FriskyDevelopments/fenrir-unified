import {
  createFriskyBetterAuth,
  isFriskySocialProvider,
  type FriskyBetterAuthEnv,
} from "../../_lib/better-auth";
import {
  finalizeCommunityOAuthSignIn,
  type CommunityOAuthEnv,
} from "../../_lib/community-oauth";
import {
  normalizeCommunitySlug,
  siteOrigin,
} from "../../_lib/community-auth";
import { safeCommunityReturnPath } from "../../_lib/oauth";

type Env = FriskyBetterAuthEnv & CommunityOAuthEnv;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const slug = normalizeCommunitySlug(url.searchParams.get("slug"));
  const providerValue = url.searchParams.get("provider");
  const returnTo = safeCommunityReturnPath(url.searchParams.get("return_to"));
  const origin = siteOrigin(context.request, context.env).replace(/\/$/, "");

  if (!slug || !isFriskySocialProvider(providerValue)) {
    return Response.redirect(`${origin}/?auth_error=invalid_community_login`, 302);
  }

  const { auth, pool } = createFriskyBetterAuth(context.env);
  try {
    const session = await auth.api.getSession({ headers: context.request.headers });
    if (!session?.user?.id || !session.user.email) {
      return Response.redirect(
        `${origin}/community/${slug}?auth_error=better_auth_session_missing`,
        302,
      );
    }

    const result = await finalizeCommunityOAuthSignIn({
      env: context.env,
      identity: {
        provider: providerValue,
        email: session.user.email,
        name: session.user.name || session.user.email,
        identityId: `better-auth:${session.user.id}`,
        emailVerified: true,
      },
      slug,
      returnTo,
      request: context.request,
    });

    const headers = new Headers({
      Location: result.location,
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", result.cookie);
    for (const cookie of result.supabaseCookies ?? []) {
      headers.append("Set-Cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "community_login_failed";
    const code = encodeURIComponent(message.split(":", 1)[0]);
    return Response.redirect(`${origin}/community/${slug}?auth_error=${code}`, 302);
  } finally {
    await pool.end();
  }
};
