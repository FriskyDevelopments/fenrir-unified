import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { encodeSession, serializeCookie, SESSION_COOKIE, SESSION_MAX_AGE, type CommunityIdentity } from "@/lib/authentik.server";
import { resolveCommunityIdentityForLogin } from "@/lib/community-identity.server";
import { verifyNeonCommunityHandoff } from "@/lib/neon-handoff.server";

export const Route = createFileRoute("/auth/neon-callback")({
  server: { handlers: { GET: async ({ request }) => finishNeonSocial(request) } },
});

async function finishNeonSocial(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const handoff = await verifyNeonCommunityHandoff(token);
    const resolved = await resolveCommunityIdentityForLogin({ sub: `neon:${handoff.user_id}`, email: handoff.email, name: null });
    const identity: CommunityIdentity = {
      sub: `neon:${handoff.user_id}`,
      user_id: resolved.user_id,
      email: handoff.email,
      name: null,
      iss: "https://myfenrir.com/neon-community",
      community_id: handoff.community_org_id,
      brand_id: "myfenrir",
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    };
    const session = await encodeSession(identity);
    return new Response(null, { status: 302, headers: {
      Location: handoff.destination,
      "Set-Cookie": serializeCookie(SESSION_COOKIE, session, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE }),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    } });
  } catch (error) {
    const reason = error instanceof Error && error.message === "neon_handoff_replayed" ? "handoff_replayed" : "handoff_invalid";
    return Response.redirect(`/login?error=${reason}`, 302);
  }
}
