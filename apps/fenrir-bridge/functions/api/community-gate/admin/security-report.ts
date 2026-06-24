import { neon } from "@neondatabase/serverless";
import {
  assertCommunityStaff,
  authErrorResponse,
  communityGateConfigured,
  communityGateNotConfigured,
  parseSlug,
  requireCommunityGateUser
} from "../../../_lib/community-gate";
import { noStoreJson } from "../../../_lib/responses";

export async function onRequestGet(context: any) {
  if (!communityGateConfigured(context.env)) return communityGateNotConfigured(context.env);

  const url = new URL(context.request.url);
  const communitySlug = parseSlug(url.searchParams.get("communitySlug"));
  if (!communitySlug) {
    return noStoreJson({ ok: false, error: "communitySlug_required" }, { status: 400 });
  }

  // AUTHZ: this is a per-community moderation report (user/session/blocked-attempt
  // analytics). It must be gated to staff of THAT community. Previously it only
  // checked that *some* Fenrir session existed, so any logged-in user could read
  // any community's security report by passing its slug (IDOR). Require the caller
  // to be community_owner/community_staff for the requested slug (or platform_admin).
  let staff;
  try {
    const user = await requireCommunityGateUser(context.request, context.env);
    staff = await assertCommunityStaff(context.env, user, communitySlug);
  } catch (error) {
    return authErrorResponse(error);
  }
  void staff;

  if (!context.env.NEON_DATABASE_URL) {
    return noStoreJson({ ok: false, error: "data_store_not_configured" }, { status: 503 });
  }

  try {
    const sql = neon(context.env.NEON_DATABASE_URL);

    // Run read-only analytical queries against Neon
    const communityRes = await sql`SELECT id, slug, name FROM communities WHERE slug = ${communitySlug} LIMIT 1`;
    if (communityRes.length === 0) {
      return noStoreJson({ ok: false, error: "community_not_found" }, { status: 404 });
    }
    const community = communityRes[0];

    // Get user stats
    const usersRes = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM users
      WHERE community_id = ${community.id}
    `;

    // Profile stats
    const profileRes = await sql`
      SELECT COUNT(*) as missing_display_name
      FROM user_profiles
      WHERE community_id = ${community.id} AND (display_name IS NULL OR display_name = '')
    `;

    // Session stats
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
    // Never fabricate stats: returning mock data as `ok: true` masked real
    // outages and showed operators numbers that were not real. Surface a
    // genuine error instead.
    console.error("security_report_query_failed", error?.message ?? error);
    return noStoreJson({ ok: false, error: "security_report_unavailable" }, { status: 502 });
  }
}
