import {
  communityAuthConfigured,
  communityAuthNotConfigured,
  getCommunityMembershipForUser,
  communitySql,
  readCommunitySession,
} from '../../_lib/community-auth';
import { noStoreJson } from '../../_lib/responses';

export async function onRequestGet(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured();

  const session = await readCommunitySession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: true, authenticated: false, product: 'fenrir-community-gate' });

  const sql = await communitySql(context.env);
  const membership = await getCommunityMembershipForUser(
    sql,
    session.user_id,
    session.community_org_id ?? null
  );

  return noStoreJson({
    ok: true,
    authenticated: true,
    product: 'fenrir-community-gate',
    user: {
      id: session.user_id,
      email: session.email,
      role: session.role,
      accessStatus: session.access_status,
    },
    communitySlug: session.community_slug ?? null,
    communityOrgId: session.community_org_id ?? null,
    membership: membership
      ? {
          role: membership.role,
          state: membership.status,
        }
      : null,
  });
}
