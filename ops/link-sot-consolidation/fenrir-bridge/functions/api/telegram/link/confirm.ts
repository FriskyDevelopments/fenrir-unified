// POST /api/telegram/link/confirm  —  THE single canonical writer surface.
//
// Server-to-server endpoint the Telegram bot calls after a user completes the
// deep-link ( /start link_<code> ). It authenticates the bot with an HMAC over
// the raw request body (shared secret TELEGRAM_LINK_CONFIRM_SECRET — set via
// wrangler secret / 1Password, NEVER in git), then consumes the SoT link_code
// and upserts public.account_links. The bot no longer writes the link truth
// itself; its Cloudflare D1 copy is only a cache/queue.
//
// Auth: header  x-fenrir-link-signature: <hex HMAC-SHA256(secret, rawBody)>
// Body: { code, telegramId, telegramUsername?, telegramFirstName?, telegramChatId? }

import { noStoreJson } from "../../../_lib/responses";
import { missingEnvResponse, type BillingEnv } from "../../../_lib/billing-env";
import { consumeLinkCode } from "../../../_lib/account-links";

type ConfirmBody = {
  code?: string;
  telegramId?: string | number;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramChatId?: string | number | null;
};

export const onRequestPost: PagesFunction<BillingEnv & { TELEGRAM_LINK_CONFIRM_SECRET?: string }> = async (context) => {
  const secret = context.env.TELEGRAM_LINK_CONFIRM_SECRET?.trim();
  if (!secret) return missingEnvResponse("TELEGRAM_LINK_CONFIRM_SECRET");

  const raw = await context.request.text();
  const provided = context.request.headers.get("x-fenrir-link-signature") ?? "";
  const expected = await hmacHex(secret, raw);
  if (!provided || !timingSafeEqualHex(provided, expected)) {
    return noStoreJson({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let body: ConfirmBody | null = null;
  try {
    body = JSON.parse(raw) as ConfirmBody;
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body?.code || body.telegramId === undefined || body.telegramId === null) {
    return noStoreJson({ ok: false, error: "missing_code_or_telegram_id" }, { status: 400 });
  }

  const result = await consumeLinkCode(context.env, {
    code: String(body.code),
    telegramId: body.telegramId,
    telegramUsername: body.telegramUsername ?? null,
    telegramFirstName: body.telegramFirstName ?? null
  });

  if (!result.ok) {
    const status = result.reason === "not_found" || result.reason === "expired" ? 409 : 503;
    return noStoreJson({ ok: false, error: result.reason }, { status });
  }

  return noStoreJson({
    ok: true,
    linked: true,
    supabaseUserId: result.supabaseUserId,
    friskyUserId: result.friskyUserId,
    friskyOrgId: result.friskyOrgId
  });
};

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const av = a.trim().toLowerCase();
  const bv = b.trim().toLowerCase();
  if (av.length !== bv.length) return false;
  let out = 0;
  for (let i = 0; i < av.length; i += 1) out |= av.charCodeAt(i) ^ bv.charCodeAt(i);
  return out === 0;
}
