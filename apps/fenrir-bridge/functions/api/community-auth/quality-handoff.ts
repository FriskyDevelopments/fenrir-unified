import { readCommunitySession, type CommunityAuthEnv } from "../../_lib/community-auth";
import { COMMUNITY_QUALITY_ORIGIN, safeQualityDestination, signCommunityQualityHandoff } from "../../_lib/community-quality-handoff";

export const onRequestGet: PagesFunction<CommunityAuthEnv> = async (context) => {
  const session = await readCommunitySession(context.request, context.env);
  if (!session) return Response.redirect(`${COMMUNITY_QUALITY_ORIGIN}/login?error=neon_session_missing`, 302);
  const destination = safeQualityDestination(new URL(context.request.url).searchParams.get("destination"));
  const callback = new URL("/auth/neon-callback", COMMUNITY_QUALITY_ORIGIN);
  callback.searchParams.set("token", await signCommunityQualityHandoff(session, destination, context.env));
  return new Response(null, { status: 302, headers: { Location: callback.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
};
