import { readSession } from '../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../_lib/billing-env';
import {
  addAudit,
  cleanSlug,
  createProductId,
  getDomainForOrg,
  mapBridge,
  mapInvite,
  publicUrl,
} from '../_lib/product-db';
import { noStoreJson } from '../_lib/responses';

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request
    .json<{
      domainId?: unknown;
      slug?: unknown;
      telegramChatId?: unknown;
      telegramGroupName?: unknown;
      telegramGroupImageUrl?: unknown;
    }>()
    .catch(() => null);
  const domainId = typeof body?.domainId === 'string' ? body.domainId : '';
  const domain = await getDomainForOrg(context.env.DB, session.frisky_org_id, domainId);
  if (!domain) return noStoreJson({ ok: false, error: 'domain_not_found' }, { status: 404 });

  const slug = cleanSlug(typeof body?.slug === 'string' ? body.slug : 'main');
  const chatId = typeof body?.telegramChatId === 'string' ? body.telegramChatId.trim() : '';
  if (!chatId)
    return noStoreJson({ ok: false, error: 'telegram_chat_id_required' }, { status: 400 });

  const bridgeId = createProductId('bridge', slug);
  const inviteId = createProductId('invite', slug);
  const ts = new Date().toISOString();
  const url = publicUrl(domain.domain, slug);
  const groupName =
    typeof body?.telegramGroupName === 'string' && body.telegramGroupName.trim()
      ? body.telegramGroupName.trim()
      : `${slug} Telegram Group`;
  const groupImageUrl =
    typeof body?.telegramGroupImageUrl === 'string' ? body.telegramGroupImageUrl.trim() : '';

  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO frisky_invites (
          id, bridge_id, invite_link, status, created_at
        ) VALUES (?, ?, ?, 'active', ?)`
    ).bind(inviteId, bridgeId, `https://t.me/+pending-${bridgeId}`, ts),
    context.env.DB.prepare(
      `INSERT INTO frisky_bridges (
          id, org_id, domain_id, slug, public_url, telegram_chat_id, telegram_group_name,
          telegram_group_image_url, current_invite_id, status, created_at, rotated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(
      bridgeId,
      session.frisky_org_id,
      domain.id,
      slug,
      url,
      chatId,
      groupName,
      groupImageUrl,
      inviteId,
      ts,
      ts
    ),
  ]);

  await addAudit(context.env.DB, session, 'bridge_created', 'FriskyBridge', bridgeId, {
    slug,
    telegramChatId: chatId,
  });
  const [bridge, invite] = await Promise.all([
    context.env.DB.prepare(`SELECT * FROM frisky_bridges WHERE id = ?`).bind(bridgeId).first<any>(),
    context.env.DB.prepare(`SELECT * FROM frisky_invites WHERE id = ?`).bind(inviteId).first<any>(),
  ]);
  return noStoreJson({ ok: true, data: mapBridge(bridge), invite: mapInvite(invite) });
};
