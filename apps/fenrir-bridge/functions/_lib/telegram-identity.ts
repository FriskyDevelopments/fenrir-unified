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
  return (env.FENRIR_TELEGRAM_BOT_USERNAME ?? env.MYFENRIR_TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").trim();
}

export async function createTelegramAccountLinkCode(db: D1Database, session: SessionPayload) {
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
    .bind(code, session.frisky_user_id, session.frisky_org_id, session.email, createdAt, expiresAt)
    .run();

  return { code, expiresAt };
}

export async function getTelegramIdentityLink(db: D1Database, friskyUserId: string) {
  return db
    .prepare(`SELECT * FROM telegram_identity_links WHERE frisky_user_id = ?`)
    .bind(friskyUserId)
    .first<TelegramIdentityLinkRow>();
}

/**
 * Look up the identity link by Telegram user id (the table's ON CONFLICT key).
 * The Telegram webhook uses this to distinguish a first-time verification
 * (no row yet) from a returning, already-verified user (row present) — with no
 * schema change. NOTE: consumeTelegramAccountLinkCode() deletes + re-inserts the
 * row on every link, so `linked_at` is NOT a reliable first-time signal; the
 * pre-consume existence check is. Once MyFenrir's canonical Supabase
 * `account_links` table lands, this can be reconciled against it.
 */
export async function getTelegramIdentityLinkByTelegramUserId(db: D1Database, telegramUserId: string) {
  return db
    .prepare(`SELECT * FROM telegram_identity_links WHERE telegram_user_id = ?`)
    .bind(telegramUserId)
    .first<TelegramIdentityLinkRow>();
}

export async function consumeTelegramAccountLinkCode(env: BillingEnv, db: D1Database, code: string, claim: TelegramLinkClaim) {
  const pending = await db
    .prepare(
      `SELECT * FROM telegram_account_link_codes
       WHERE code = ? AND status = 'pending'
       LIMIT 1`
    )
    .bind(code)
    .first<TelegramAccountLinkCodeRow>();

  if (!pending) return { ok: false as const, reason: "not_found" };
  if (Date.parse(pending.expires_at) <= Date.now()) {
    await db
      .prepare(`UPDATE telegram_account_link_codes SET status = 'expired' WHERE code = ?`)
      .bind(code)
      .run();
    return { ok: false as const, reason: "expired" };
  }

  const ts = nowIso();
  await db.batch([
    db
      .prepare(`DELETE FROM telegram_identity_links WHERE frisky_user_id = ? OR telegram_user_id = ?`)
      .bind(pending.frisky_user_id, claim.telegramUserId),
    upsertTelegramIdentityLinkStatement(db, {
      telegramUserId: claim.telegramUserId,
      friskyUserId: pending.frisky_user_id,
      friskyOrgId: pending.frisky_org_id,
      email: pending.email,
      telegramUsername: claim.telegramUsername ?? null,
      telegramFirstName: claim.telegramFirstName ?? null,
      linkedAt: ts,
      updatedAt: ts
    }),
    db
      .prepare(
        `UPDATE telegram_account_link_codes
         SET status = 'claimed',
             telegram_user_id = ?,
             telegram_chat_id = ?,
             telegram_username = ?,
             telegram_first_name = ?,
             claimed_at = ?
         WHERE code = ?`
      )
      .bind(
        claim.telegramUserId,
        claim.telegramChatId,
        claim.telegramUsername ?? null,
        claim.telegramFirstName ?? null,
        ts,
        code
      )
  ]);

  const starsSync = await syncPendingStarsForFriskyUser(db, env, pending.frisky_user_id);

  return {
    ok: true as const,
    friskyUserId: pending.frisky_user_id,
    friskyOrgId: pending.frisky_org_id,
    email: pending.email,
    starsApplied: starsSync.applied
  };
}

export function upsertTelegramIdentityLinkStatement(db: D1Database, input: TelegramIdentityLinkInput) {
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
