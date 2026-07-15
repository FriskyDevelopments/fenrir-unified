import {
  assertCommunityStaff,
  authErrorResponse,
  communityGateConfigured,
  communityGateNotConfigured,
  communityGateSql,
  parseSlug,
  requireCommunityGateUser,
} from '../../../_lib/community-gate';
import { noStoreJson } from '../../../_lib/responses';

export async function onRequestGet(context: any) {
  if (!communityGateConfigured(context.env)) return communityGateNotConfigured(context.env);

  const url = new URL(context.request.url);
  const communitySlug = parseSlug(url.searchParams.get('communitySlug') ?? 'fenrir');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '50') || 50, 1), 100);

  try {
    const user = await requireCommunityGateUser(context.request, context.env);
    const { profile } = await assertCommunityStaff(context.env, user, communitySlug);
    const sql = await communityGateSql(context.env);
    const rows =
      profile.role === 'platform_admin'
        ? await sql`
          select al.*
          from audit_logs al
          left join communities c on c.id = al.community_id
          where c.slug = ${communitySlug}
          order by al.created_at desc
          limit ${limit}
        `
        : await sql`
          select al.*
          from audit_logs al
          join communities c on c.id = al.community_id
          join community_memberships cm on cm.community_id = c.id
          where c.slug = ${communitySlug}
            and cm.profile_id = ${profile.id}
            and cm.status = 'active'
            and cm.role in ('community_owner', 'community_staff')
          order by al.created_at desc
          limit ${limit}
        `;

    return noStoreJson({ ok: true, data: rows });
  } catch (error) {
    return authErrorResponse(error);
  }
}
