import type { BillingEnv } from "./billing-env";

export type TelegramStarsOrderRow = {
  payload: string;
  telegram_user_id: string;
  telegram_chat_id: string;
  amount: number;
  status: string;
  telegram_payment_charge_id: string | null;
  created_at: string;
  paid_at: string | null;
};

const nowIso = () => new Date().toISOString();

export function starsPrice(env: BillingEnv) {
  const parsed = Number.parseInt(env.FENRIR_STARS_PRICE ?? "250", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
}

export function starsBotUsername(env: BillingEnv) {
  return (env.FENRIR_TELEGRAM_BOT_USERNAME ?? env.MYFENRIR_TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").trim();
}

function botToken(env: BillingEnv, channel?: string | null) {
  if (channel === "dev") return env.TELEGRAM_DEV_BOT_TOKEN?.trim() || env.TELEGRAM_BOT_TOKEN?.trim();
  if (channel === "prod") return env.TELEGRAM_PROD_BOT_TOKEN?.trim() || env.TELEGRAM_BOT_TOKEN?.trim();
  return env.TELEGRAM_BOT_TOKEN?.trim() || env.TELEGRAM_PROD_BOT_TOKEN?.trim();
}

export function hasStarsBotToken(env: BillingEnv) {
  return Boolean(env.TELEGRAM_BOT_TOKEN?.trim() || env.TELEGRAM_PROD_BOT_TOKEN?.trim());
}

export function hasStarsBotUsername(env: BillingEnv) {
  return Boolean(env.FENRIR_TELEGRAM_BOT_USERNAME?.trim() || env.MYFENRIR_TELEGRAM_BOT_USERNAME?.trim());
}

export function starsDeepLink(env: BillingEnv) {
  return `https://t.me/${starsBotUsername(env)}?start=fenrir_stars`;
}

export function starsTitle(env: BillingEnv) {
  return env.FENRIR_STARS_TITLE?.trim() || "Fenrir Protocol Access";
}

export function starsDescription(env: BillingEnv) {
  return env.FENRIR_STARS_DESCRIPTION?.trim() || "Unlock Fenrir Protocol access with Telegram Stars while card billing is being reviewed.";
}

export function starsLabel(env: BillingEnv) {
  return env.FENRIR_STARS_LABEL?.trim() || "Fenrir Protocol Access";
}

export async function createStarsOrder(db: D1Database, telegramUserId: string, telegramChatId: string, amount: number) {
  const payload = `fenrir_stars:${telegramUserId}:${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO telegram_stars_orders (
        payload, telegram_user_id, telegram_chat_id, amount, status, created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?)`
    )
    .bind(payload, telegramUserId, telegramChatId, amount, ts)
    .run();
  return payload;
}

export async function getStarsOrder(db: D1Database, payload: string) {
  return db
    .prepare(`SELECT * FROM telegram_stars_orders WHERE payload = ?`)
    .bind(payload)
    .first<TelegramStarsOrderRow>();
}

export async function markStarsPaid(
  db: D1Database,
  input: {
    payload: string;
    telegramUserId: string;
    telegramChatId: string;
    amount: number;
    currency: string;
    telegramPaymentChargeId: string;
  }
) {
  const ts = nowIso();
  await db
    .prepare(
      `UPDATE telegram_stars_orders
       SET status = 'paid', telegram_payment_charge_id = ?, paid_at = ?
       WHERE payload = ?`
    )
    .bind(input.telegramPaymentChargeId, ts, input.payload)
    .run();

  await db
    .prepare(
      `INSERT INTO telegram_stars_entitlements (
        telegram_user_id, telegram_chat_id, status, stars_amount, currency,
        telegram_payment_charge_id, payload, created_at, updated_at
      ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        telegram_chat_id = excluded.telegram_chat_id,
        status = 'active',
        stars_amount = excluded.stars_amount,
        currency = excluded.currency,
        telegram_payment_charge_id = excluded.telegram_payment_charge_id,
        payload = excluded.payload,
        updated_at = excluded.updated_at`
    )
    .bind(
      input.telegramUserId,
      input.telegramChatId,
      input.amount,
      input.currency,
      input.telegramPaymentChargeId,
      input.payload,
      ts,
      ts
    )
    .run();
}

export async function telegramApi(env: BillingEnv, method: string, body: Record<string, unknown>, channel?: string | null) {
  const token = botToken(env, channel);
  if (!token) throw new Error("missing_env:TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(`telegram_api_failed:${method}`);
  }
  return data as { ok: true; result: unknown };
}
