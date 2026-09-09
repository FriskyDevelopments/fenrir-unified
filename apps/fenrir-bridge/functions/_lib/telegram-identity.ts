import type { SessionPayload } from "./auth";
import type { BillingEnv } from "./billing-env";
import { syncPendingStarsForFriskyUser } from "./stars-billing";

export type TelegramIdentityLinkRow = {
  telegram_user_id: string;
  frisky_user_id: string;
  frisky_org_id: string;
  email: string;
  telegram_username: string | null;
  telegram_first_name: string | null;
  linked_at: string;
  updated_at: string;
};

type TelegramAccountLinkCodeRow = {
  code: string;
  frisky_user_id: string;
  frisky_org_id: string;
  email: string;
  status: string;
  expires_at: string;
};

export type TelegramLinkClaim = {
  telegramUserId: string;
  telegramChatId: string;
  telegramUsername?: string;
  telegramFirstName?: string;
};

export type TelegramIdentityLinkInput = {
  telegramUserId: string;
  friskyUserId: string;
  friskyOrgId: string;
  email: string;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  linkedAt?: string;
  updatedAt?: string;
};

const nowIso = () => new Date().toISOString();

export function telegramBotUsername(env: BillingEnv) {
  return (
    env.FENRIR_TELEGRAM_BOT_USERNAME ??
    env.MYFENRIR_TELEGRAM_BOT_USERNAME ??
    ""
  )
    .replace(/^@/, "")
    .trim();
}

export async function createTelegramAccountLinkCode(
  db: D1Database,
  session: SessionPayload
) {
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO telegram_account_link_codes (
        code, frisky_user_id, frisky_org_id, email, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(
      code,
      session.frisky_user_id,
      session.frisky_org_id,
      session.email,
      createdAt,
      expiresAt
    )
    .run();

  return { code, expiresAt };
}

export async function getTelegramIdentityLink(
  db: D1Database,
  friskyUserId: string
) {
  return db
    .prepare(`SELECT * FROM telegram_identity_links WHERE frisky_user_id = ?`)
    .bind(friskyUserId)
    .first<TelegramIdentityLinkRow>();
}

export async function consumeTelegramAccountLinkCode(
  env: BillingEnv,
  db: D1Database,
  code: string,
  claim: TelegramLinkClaim
) {
  const ts = nowIso();
  const pending = await db
    .prepare(
      `UPDATE telegram_account_link_codes
       SET status = 'claimed',
           telegram_user_id = ?,
           telegram_chat_id = ?,
           telegram_username = ?,
           telegram_first_name = ?,
           claimed_at = ?
       WHERE code = ? AND status = 'pending' AND expires_at > ?
       RETURNING code, frisky_user_id, frisky_org_id, email, status, expires_at`
    )
    .bind(
      claim.telegramUserId,
      claim.telegramChatId,
      claim.telegramUsername ?? null,
      claim.telegramFirstName ?? null,
      ts,
      code,
      ts
    )
    .first<TelegramAccountLinkCodeRow>();

  if (!pending) {
    const current = await db
      .prepare(
        `SELECT status, expires_at FROM telegram_account_link_codes WHERE code = ? LIMIT 1`
      )
      .bind(code)
      .first<Pick<TelegramAccountLinkCodeRow, "status" | "expires_at">>();
    if (!current) return { ok: false as const, reason: "not_found" };
    if (current.status !== "pending")
      return { ok: false as const, reason: "not_found" };
    await db
      .prepare(
        `UPDATE telegram_account_link_codes SET status = 'expired' WHERE code = ? AND status = 'pending' AND expires_at <= ?`
      )
      .bind(code, ts)
      .run();
    return { ok: false as const, reason: "expired" };
  }

  try {
    await db.batch([
      db
        .prepare(
          `DELETE FROM telegram_identity_links WHERE frisky_user_id = ? OR telegram_user_id = ?`
        )
        .bind(pending.frisky_user_id, claim.telegramUserId),
      upsertTelegramIdentityLinkStatement(db, {
        telegramUserId: claim.telegramUserId,
        friskyUserId: pending.frisky_user_id,
        friskyOrgId: pending.frisky_org_id,
        email: pending.email,
        telegramUsername: claim.telegramUsername ?? null,
        telegramFirstName: claim.telegramFirstName ?? null,
        linkedAt: ts,
        updatedAt: ts,
      }),
    ]);
  } catch (error) {
    await db
      .prepare(
        `UPDATE telegram_account_link_codes
         SET status = 'pending', telegram_user_id = NULL, telegram_chat_id = NULL,
             telegram_username = NULL, telegram_first_name = NULL, claimed_at = NULL
         WHERE code = ? AND status = 'claimed' AND telegram_user_id = ? AND claimed_at = ?`
      )
      .bind(code, claim.telegramUserId, ts)
      .run()
      .catch(() => null);
    throw error;
  }

  const starsSync = await syncPendingStarsForFriskyUser(
    db,
    env,
    pending.frisky_user_id
  );

  return {
    ok: true as const,
    friskyUserId: pending.frisky_user_id,
    friskyOrgId: pending.frisky_org_id,
    email: pending.email,
    starsApplied: starsSync.applied,
  };
}

export function upsertTelegramIdentityLinkStatement(
  db: D1Database,
  input: TelegramIdentityLinkInput
) {
  const linkedAt = input.linkedAt ?? nowIso();
  const updatedAt = input.updatedAt ?? linkedAt;
  return db
    .prepare(
      `INSERT INTO telegram_identity_links (
        telegram_user_id, frisky_user_id, frisky_org_id, email,
        telegram_username, telegram_first_name, linked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        frisky_user_id = excluded.frisky_user_id,
        frisky_org_id = excluded.frisky_org_id,
        email = excluded.email,
        telegram_username = excluded.telegram_username,
        telegram_first_name = excluded.telegram_first_name,
        linked_at = excluded.linked_at,
        updated_at = excluded.updated_at`
    )
    .bind(
      input.telegramUserId,
      input.friskyUserId,
      input.friskyOrgId,
      input.email,
      input.telegramUsername ?? null,
      input.telegramFirstName ?? null,
      linkedAt,
      updatedAt
    );
}
