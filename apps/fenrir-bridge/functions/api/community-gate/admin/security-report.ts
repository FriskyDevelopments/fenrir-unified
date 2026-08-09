import { neon } from "@neondatabase/serverless";
import { readSession } from "../../../_lib/auth";
import { assertCommunityStaff, authErrorResponse, communityGateConfigured, communityGateNotConfigured, communityGateSql, parseSlug } from "../../../_lib/community-gate";
import { noStoreJson } from "../../../_lib/responses";

export async function onRequestGet(context: any) {
  if (!communityGateConfigured(context.env)) return communityGateNotConfigured(context.env);

  const url = new URL(context.request.url);
  const communitySlug = parseSlug(url.searchParams.get("communitySlug") ?? "fenrir");
  if (!communitySlug) {
    return noStoreJson({ ok: false, error: "community_slug_invalid" }, { status: 400 });
  }

  try {
    const user = await readSession(context.request, context.env);
    if (!user) {
      return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
    }

    await assertCommunityStaff(context.env, user, communitySlug);

    if (!context.env.NEON_DATABASE_URL) {
      throw new Error("NEON_DATABASE_URL is not configured.");
    }
    const sql = neon(context.env.NEON_DATABASE_URL);

    const communityRes = await sql`SELECT id, slug, name FROM communities WHERE slug = ${communitySlug} LIMIT 1`;
    if (communityRes.length === 0) {
      return noStoreJson({ ok: false, error: "community_not_found" }, { status: 404 });
    }
    const community = communityRes[0];

    const usersRes = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM users
      WHERE community_id = ${community.id}
    `;

    const profileRes = await sql`
      SELECT COUNT(*) as missing_display_name
      FROM user_profiles
      WHERE community_id = ${community.id} AND (display_name IS NULL OR display_name = '')
    `;

    const sessionsRes = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'successful' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM user_sessions
      WHERE community_id = ${community.id}
    `;

    return noStoreJson({
      ok: true,
      data: {
        community: {
          id: community.id,
          slug: community.slug,
          name: community.name
        },
        users: {
          total: Number(usersRes[0].total) || 0,
          verified: Number(usersRes[0].verified) || 0,
          blocked: Number(usersRes[0].blocked) || 0,
          pending: Number(usersRes[0].pending) || 0,
          missingDisplayName: Number(profileRes[0].missing_display_name) || 0
        },
        sessions: {
          total: Number(sessionsRes[0].total) || 0,
          successful: Number(sessionsRes[0].successful) || 0,
          failed: Number(sessionsRes[0].failed) || 0,
          blocked: Number(sessionsRes[0].blocked) || 0,
          expired: Number(sessionsRes[0].expired) || 0,
          pending: Number(sessionsRes[0].pending) || 0
        },
        impact: {
          blockedAttempts: Number(sessionsRes[0].blocked) || 0,
          usersNeedingProfileFixes: Number(profileRes[0].missing_display_name) || 0,
          fullyVerifiedUsers: Number(usersRes[0].verified) || 0
        },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return authErrorResponse(error);
  }
}
