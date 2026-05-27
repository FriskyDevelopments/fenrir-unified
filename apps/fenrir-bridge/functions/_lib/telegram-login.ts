import { createSessionPayload } from "./auth";
import type { BillingEnv } from "./billing-env";
import { getTelegramIdentityLink, upsertTelegramIdentityLinkStatement } from "./telegram-identity";

export type TelegramLoginPayload = {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

export async function verifyTelegramLoginPayload(payload: TelegramLoginPayload, env: BillingEnv) {
  const token = telegramLoginBotToken(env);
  const telegramHash = String(payload.hash ?? "").trim().toLowerCase();
  if (!telegramHash) throw new Error("telegram_login_hash_missing");

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error("telegram_login_auth_date_invalid");
  if (Math.floor(Date.now() / 1000) - authDate > 60 * 60 * 24) {
    throw new Error("telegram_login_expired");
  }

  const dataCheckString = telegramDataCheckString(payload);
  const secretKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const key = await crypto.subtle.importKey("raw", secretKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dataCheckString));
  const expectedHash = bytesToHex(new Uint8Array(signature));
  if (expectedHash !== telegramHash) {
    throw new Error("telegram_login_hash_invalid");
  }
}

export async function createSessionFromTelegramLogin(db: D1Database, env: BillingEnv, payload: TelegramLoginPayload) {
  await verifyTelegramLoginPayload(payload, env);
  const telegramUserId = String(payload.id);
  const telegramUsername = normalizeTelegramHandle(payload.username);
  const telegramFirstName = normalizeTelegramName(payload.first_name);
  const telegramLastName = normalizeTelegramName(payload.last_name);
  const telegramName = [telegramFirstName, telegramLastName].filter(Boolean).join(" ").trim() || telegramUsername || `Telegram ${telegramUserId}`;
  const syntheticEmail = `telegram-${telegramUserId}@telegram.myfenrir.local`;

  const linked = await getTelegramIdentityLink(db, telegramUserId);
  const existing = linked
    ? {
        friskyUserId: linked.frisky_user_id,
        friskyOrgId: linked.frisky_org_id,
        email: linked.email
      }
    : null;
  const session = createSessionPayload({
    email: existing?.email ?? syntheticEmail,
    name: telegramName,
    provider: "telegram",
    identityId: `telegram:${telegramUserId}`,
    friskyUserId: existing?.friskyUserId,
    friskyOrgId: existing?.friskyOrgId
  });

  await db.batch([
    db
      .prepare(`DELETE FROM telegram_identity_links WHERE frisky_user_id = ? OR telegram_user_id = ?`)
      .bind(session.frisky_user_id, telegramUserId),
    upsertTelegramIdentityLinkStatement(db, {
      telegramUserId,
      friskyUserId: session.frisky_user_id,
      friskyOrgId: session.frisky_org_id,
      email: existing?.email ?? syntheticEmail,
      telegramUsername,
      telegramFirstName,
      linkedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  ]);

  return session;
}

function telegramLoginBotToken(env: BillingEnv) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() || env.TELEGRAM_PROD_BOT_TOKEN?.trim() || env.TELEGRAM_DEV_BOT_TOKEN?.trim();
  if (!token) throw new Error("missing_env:TELEGRAM_BOT_TOKEN");
  return token;
}

function telegramDataCheckString(payload: TelegramLoginPayload) {
  const normalized = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return normalized.map(([key, value]) => `${key}=${value}`).join("\n");
}

function normalizeTelegramHandle(value?: string) {
  return (value ?? "").trim().replace(/^@/, "");
}

function normalizeTelegramName(value?: string) {
  return (value ?? "").trim();
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
