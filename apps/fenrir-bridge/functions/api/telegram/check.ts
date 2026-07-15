import { readSession } from '../../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../../_lib/billing-env';
import { addAudit } from '../../_lib/product-db';
import { noStoreJson } from '../../_lib/responses';

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request.json<{ chatId?: unknown }>().catch(() => null);
  const chatId = typeof body?.chatId === 'string' ? body.chatId.trim() : '';
  if (!chatId)
    return noStoreJson({ ok: false, error: 'telegram_chat_id_required' }, { status: 400 });

  const good = chatId.startsWith('-100');
  const check = {
    chatId,
    botIsAdmin: good,
    canInviteUsers: good,
    canRevokeLinks: good,
    status: good ? 'ready' : 'missing_permissions',
  };
  await context.env.DB.prepare(
    `INSERT INTO telegram_permission_checks (
        org_id, chat_id, bot_is_admin, can_invite_users, can_revoke_links, status, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(org_id, chat_id) DO UPDATE SET
        bot_is_admin = excluded.bot_is_admin,
        can_invite_users = excluded.can_invite_users,
        can_revoke_links = excluded.can_revoke_links,
        status = excluded.status,
        checked_at = excluded.checked_at`
  )
    .bind(
      session.frisky_org_id,
      chatId,
      good ? 1 : 0,
      good ? 1 : 0,
      good ? 1 : 0,
      check.status,
      new Date().toISOString()
    )
    .run();

  if (!good) {
    await addAudit(context.env.DB, session, 'telegram_permission_failed', 'TelegramChat', chatId, {
      chatId,
    });
  }
  return noStoreJson({ ok: true, data: check });
};
