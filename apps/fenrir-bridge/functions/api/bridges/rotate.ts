import { readSession } from '../../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../../_lib/billing-env';
import {
  addAudit,
  createProductId,
  getBridgeForOrg,
  mapBridge,
  mapInvite,
} from '../../_lib/product-db';
import { noStoreJson } from '../../_lib/responses';

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request.json<{ bridgeId?: unknown }>().catch(() => null);
  const bridgeId = typeof body?.bridgeId === 'string' ? body.bridgeId : '';
  const bridge = await getBridgeForOrg(context.env.DB, session.frisky_org_id, bridgeId);
  if (!bridge) return noStoreJson({ ok: false, error: 'bridge_not_found' }, { status: 404 });

  const inviteId = createProductId('invite', bridge.slug);
  const ts = new Date().toISOString();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE frisky_invites SET status = 'revoked', revoked_at = ? WHERE id = ?`
    ).bind(ts, bridge.currentInviteId),
    context.env.DB.prepare(
      `INSERT INTO frisky_invites (id, bridge_id, invite_link, status, created_at) VALUES (?, ?, ?, 'active', ?)`
    ).bind(inviteId, bridge.id, `https://t.me/+pending-${inviteId}`, ts),
    context.env.DB.prepare(
      `UPDATE frisky_bridges SET current_invite_id = ?, status = 'active', rotated_at = ?, revoked_at = NULL WHERE id = ? AND org_id = ?`
    ).bind(inviteId, ts, bridge.id, session.frisky_org_id),
  ]);

  await addAudit(context.env.DB, session, 'invite_rotated', 'FriskyBridge', bridge.id, {
    publicUrl: bridge.publicUrl,
  });
  const [updated, invite] = await Promise.all([
    context.env.DB.prepare(`SELECT * FROM frisky_bridges WHERE id = ?`)
      .bind(bridge.id)
      .first<any>(),
    context.env.DB.prepare(`SELECT * FROM frisky_invites WHERE id = ?`).bind(inviteId).first<any>(),
  ]);
  return noStoreJson({ ok: true, data: mapBridge(updated), invite: mapInvite(invite) });
};
