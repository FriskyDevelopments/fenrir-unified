import { assertCommunityStaff, authErrorResponse, communityGateConfigured, communityGateNotConfigured, communityGateSql, parseSlug, requireCommunityGateUser } from "../../../_lib/community-gate";
import { noStoreJson } from "../../../_lib/responses";

export async function onRequestGet(context: any) {
  if (!communityGateConfigured(context.env)) return communityGateNotConfigured(context.env);

  const url = new URL(context.request.url);
  const communitySlug = parseSlug(url.searchParams.get("communitySlug") ?? "fenrir");

  try {
    const user = await requireCommunityGateUser(context.request, context.env);
    const { profile } = await assertCommunityStaff(context.env, user, communitySlug);
    const sql = await communityGateSql(context.env);

    // Get community ID
    const [community] = await sql`
      select id, name
      from communities
      where slug = ${communitySlug}
      limit 1
    `;

    if (!community) {
      return noStoreJson({ ok: false, error: "community_not_found" }, { status: 404 });
    }

    // Get total users in community
    const [userCounts] = await sql`
      select
        count(*) as total_users,
        sum(case when status = 'active' then 1 else 0 end) as active_users,
        sum(case when status = 'denied' then 1 else 0 end) as denied_users,
        sum(case when status = 'pending' then 1 else 0 end) as pending_users
      from community_memberships
      where community_id = ${community.id}
    `;

    // Get users with missing Telegram profile data
    const [missingTelegramData] = await sql`
      select
        count(*) as total_members,
        sum(case when p.display_name is null or p.display_name = '' then 1 else 0 end) as missing_display_name
      from community_memberships cm
      join profiles p on p.id = cm.profile_id
      where cm.community_id = ${community.id}
        and cm.status = 'active'
    `;

    // Get verification session statistics
    const [sessionStats] = await sql`
      select
        count(*) as total_sessions,
        sum(case when status = 'granted' then 1 else 0 end) as granted_sessions,
        sum(case when status = 'denied' then 1 else 0 end) as denied_sessions,
        sum(case when status = 'flagged' then 1 else 0 end) as flagged_sessions,
        sum(case when status = 'expired' then 1 else 0 end) as expired_sessions,
        sum(case when status = 'pending' then 1 else 0 end) as pending_sessions
      from verification_sessions
      where community_id = ${community.id}
    `;

    // Calculate Fenrir impact metrics
    const blockedAttempts = (sessionStats.denied_sessions || 0) + (sessionStats.flagged_sessions || 0);
    const usersNeedingProfileFixes = missingTelegramData.missing_display_name || 0;
    const fullyVerifiedUsers = userCounts.active_users || 0;

    const report = {
      community: {
        id: community.id,
        slug: communitySlug,
        name: community.name
      },
      users: {
        total: userCounts.total_users || 0,
        verified: userCounts.active_users || 0,
        blocked: userCounts.denied_users || 0,
        pending: userCounts.pending_users || 0,
        missingDisplayName: missingTelegramData.missing_display_name || 0
      },
      sessions: {
        total: sessionStats.total_sessions || 0,
        successful: sessionStats.granted_sessions || 0,
        failed: sessionStats.denied_sessions || 0,
        blocked: sessionStats.flagged_sessions || 0,
        expired: sessionStats.expired_sessions || 0,
        pending: sessionStats.pending_sessions || 0
      },
      impact: {
        blockedAttempts,
        usersNeedingProfileFixes,
        fullyVerifiedUsers
      },
      generatedAt: new Date().toISOString()
    };

    return noStoreJson({ ok: true, data: report });
  } catch (error) {
    return authErrorResponse(error);
  }
}