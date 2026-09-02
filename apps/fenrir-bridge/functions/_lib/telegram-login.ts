import { createSessionPayload } from "./auth";
import type { BillingEnv } from "./billing-env";
import { getTelegramIdentityLink, upsertTelegramIdentityLinkStatement } from "./telegram-identity";

/**
 * Telegram signs two different things with two different key derivations, and
 * they are not interchangeable:
 *
 *   Login Widget (browser)  secret = SHA256(bot_token)
 *   Mini App  (initData)    secret = HMAC_SHA256("WebAppData", bot_token)
 *
 * This module used to implement the Widget scheme only. The MyFenrir gate at
 * www.myfenrir.com/miniapp is a Mini App and sends initData, so every valid
 * payload failed. Both schemes are supported now; the payload shape decides.
 */

/** The verifier cannot run — missing config. Never the caller's fault. */
export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramConfigError";
  }
}

/** The body is not a shape we know how to verify. */
export class TelegramPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramPayloadError";
  }
}

/** Well-formed, but it did not verify: bad signature, or expired. */
export class TelegramAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramAuthError";
  }
}

export type TelegramLoginPayload = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number | string;
  hash?: string;
  /** Mini App: the raw `window.Telegram.WebApp.initData` query string. */
  initData?: string;
  query_id?: string;
};

export type TelegramUser = {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

const AUTH_DATE_MAX_AGE_SECONDS = 60 * 60 * 24;

export async function verifyTelegramLoginPayload(
  payload: TelegramLoginPayload,
  env: BillingEnv
): Promise<TelegramUser> {
  const token = telegramLoginBotToken(env);

  if (typeof payload?.initData === "string" && payload.initData.length > 0) {
    return verifyMiniAppInitData(payload.initData, token);
  }
  if (typeof payload?.hash === "string" && payload.hash.trim().length > 0) {
    return verifyLoginWidget(payload, token);
  }
  throw new TelegramPayloadError("telegram_payload_unrecognised");
}

/** Mini App: secret = HMAC_SHA256("WebAppData", bot_token). */
async function verifyMiniAppInitData(initData: string, token: string): Promise<TelegramUser> {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    throw new TelegramPayloadError("telegram_initdata_unparseable");
  }

  const providedHash = (params.get("hash") ?? "").trim().toLowerCase();
  if (!providedHash) throw new TelegramPayloadError("telegram_initdata_hash_missing");

  assertFreshAuthDate(params.get("auth_date"));

  const secretKey = await hmacRaw(new TextEncoder().encode("WebAppData"), token);

  // Telegram documents removing only `hash` from the data-check-string. Some
  // clients also send `signature` (used for third-party Ed25519 checks), and
  // reports differ on whether it belongs in the HMAC input. Try the documented
  // form first, then the variant without `signature`, rather than guessing.
  const withSignature = dataCheckString(params, ["hash"]);
  if (await hmacHex(secretKey, withSignature) === providedHash) {
    return miniAppUser(params);
  }
  if (params.has("signature")) {
    const withoutSignature = dataCheckString(params, ["hash", "signature"]);
    if (await hmacHex(secretKey, withoutSignature) === providedHash) {
      return miniAppUser(params);
    }
  }
  throw new TelegramAuthError("telegram_initdata_hash_invalid");
}

function miniAppUser(params: URLSearchParams): TelegramUser {
  const raw = params.get("user");
  if (!raw) throw new TelegramPayloadError("telegram_initdata_user_missing");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new TelegramPayloadError("telegram_initdata_user_unparseable");
  }
  const id = parsed["id"];
  if (id === undefined || id === null || String(id).length === 0) {
    throw new TelegramPayloadError("telegram_initdata_user_id_missing");
  }
  return {
    id: String(id),
    first_name: String(parsed["first_name"] ?? ""),
    last_name: optionalString(parsed["last_name"]),
    username: optionalString(parsed["username"]),
    photo_url: optionalString(parsed["photo_url"])
  };
}

/** Login Widget: secret = SHA256(bot_token). Kept so the web path still works. */
async function verifyLoginWidget(payload: TelegramLoginPayload, token: string): Promise<TelegramUser> {
  const providedHash = String(payload.hash ?? "").trim().toLowerCase();
  if (!providedHash) throw new TelegramPayloadError("telegram_login_hash_missing");
  if (payload.id === undefined || payload.id === null || String(payload.id).length === 0) {
    throw new TelegramPayloadError("telegram_login_id_missing");
  }

  assertFreshAuthDate(payload.auth_date);

  const pairs = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && key !== "initData" && value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort();

  const secretKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  if (await hmacHex(secretKey, pairs.join("\n")) !== providedHash) {
    throw new TelegramAuthError("telegram_login_hash_invalid");
  }

  return {
    id: String(payload.id),
    first_name: String(payload.first_name ?? ""),
    last_name: optionalString(payload.last_name),
    username: optionalString(payload.username),
    photo_url: optionalString(payload.photo_url)
  };
}

function assertFreshAuthDate(value: unknown) {
  const authDate = Number(value);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new TelegramPayloadError("telegram_login_auth_date_invalid");
  }
  if (Math.floor(Date.now() / 1000) - authDate > AUTH_DATE_MAX_AGE_SECONDS) {
    throw new TelegramAuthError("telegram_login_expired");
  }
}

function dataCheckString(params: URLSearchParams, omit: string[]) {
  return [...params.entries()]
    .filter(([key]) => !omit.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
}

async function hmacRaw(keyData: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyData as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

async function hmacHex(keyData: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  return bytesToHex(new Uint8Array(await hmacRaw(keyData, message)));
}

function optionalString(value: unknown): string | undefined {
  const text = (value ?? "").toString().trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Production must not silently fall back to the development bot. A key derived
 * from the wrong bot fails every HMAC, and the failure looks like a rejected
 * user instead of a misconfigured deployment — which is exactly how this bug
 * stayed hidden. Falling back now requires saying so out loud.
 */
function telegramLoginBotToken(env: BillingEnv) {
  const production = env.TELEGRAM_BOT_TOKEN?.trim() || env.TELEGRAM_PROD_BOT_TOKEN?.trim();
  if (production) return production;

  const development = env.TELEGRAM_DEV_BOT_TOKEN?.trim();
  if (development) {
    if (env.TELEGRAM_ALLOW_DEV_BOT_TOKEN?.trim() === "true") return development;
    throw new TelegramConfigError("telegram_bot_token_production_missing");
  }
  throw new TelegramConfigError("missing_env:TELEGRAM_BOT_TOKEN");
}

export async function createSessionFromTelegramLogin(
  db: D1Database,
  env: BillingEnv,
  payload: TelegramLoginPayload
) {
  const user = await verifyTelegramLoginPayload(payload, env);
  const telegramUserId = user.id;
  const telegramUsername = normalizeTelegramHandle(user.username);
  const telegramFirstName = normalizeTelegramName(user.first_name);
  const telegramLastName = normalizeTelegramName(user.last_name);
  const telegramName =
    [telegramFirstName, telegramLastName].filter(Boolean).join(" ").trim() ||
    telegramUsername ||
    `Telegram ${telegramUserId}`;
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

  return { session, telegramUserId };
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
