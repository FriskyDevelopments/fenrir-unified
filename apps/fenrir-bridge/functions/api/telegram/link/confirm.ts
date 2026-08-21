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
import { consumeLinkCode, resolveSupabaseUserId, upsertAccountLink } from "../../../_lib/account-links";
import { sendBillingEmail } from "../../../_lib/transactional-email";
import { consumeTelegramAccountLinkCode, getTelegramIdentityLink } from "../../../_lib/telegram-identity";

type ConfirmBody = {
  code?: string;
  telegramId?: string | number;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramChatId?: string | number | null;
};

export const onRequestPost: PagesFunction<BillingEnv & { TELEGRAM_LINK_CONFIRM_SECRET?: string; FENRIR_GATEKEEPER_INTERNAL_SECRET?: string }> = async (context) => {
  const raw = await context.request.text();
  const hmacSecret = context.env.TELEGRAM_LINK_CONFIRM_SECRET?.trim();
  const internalSecret = context.env.FENRIR_GATEKEEPER_INTERNAL_SECRET?.trim();
  if (!hmacSecret && !internalSecret) return missingEnvResponse("TELEGRAM_LINK_CONFIRM_SECRET");

  const bearer = context.request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const bearerValid = Boolean(internalSecret && bearer && timingSafeEqualText(bearer, internalSecret));
  const provided = context.request.headers.get("x-fenrir-link-signature") ?? "";
  const expected = hmacSecret ? await hmacHex(hmacSecret, raw) : "";
  const hmacValid = Boolean(hmacSecret && provided && timingSafeEqualHex(provided, expected));
  if (!bearerValid && !hmacValid) {
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

  const d1Result = context.env.DB ? await consumeTelegramAccountLinkCode(context.env, context.env.DB, String(body.code), {
    telegramUserId: String(body.telegramId),
    telegramChatId: String(body.telegramChatId ?? body.telegramId),
    telegramUsername: body.telegramUsername ?? undefined,
    telegramFirstName: body.telegramFirstName ?? undefined
  }) : null;

  let result: Awaited<ReturnType<typeof consumeLinkCode>>;
  if (d1Result?.ok) {
    const supabaseUserId = await resolveSupabaseUserId(context.env, {
      email: d1Result.email,
      friskyUserId: d1Result.friskyUserId,
      telegramId: body.telegramId
    });
    if (supabaseUserId) {
      await upsertAccountLink(context.env, {
        supabaseUserId,
        telegramId: body.telegramId,
        telegramUsername: body.telegramUsername ?? null,
        telegramFirstName: body.telegramFirstName ?? null,
        friskyUserId: d1Result.friskyUserId,
        friskyOrgId: d1Result.friskyOrgId,
        email: d1Result.email
      });
    }
    result = {
      ok: true,
      supabaseUserId: supabaseUserId ?? "",
      friskyUserId: d1Result.friskyUserId,
      friskyOrgId: d1Result.friskyOrgId,
      email: d1Result.email
    };
  } else {
    result = await consumeLinkCode(context.env, {
      code: String(body.code),
      telegramId: body.telegramId,
      telegramUsername: body.telegramUsername ?? null,
      telegramFirstName: body.telegramFirstName ?? null
    });
    if (!result.ok && context.env.DB) {
      const existing = await getTelegramIdentityLink(context.env.DB, String(body.telegramId));
      if (existing) {
        result = {
          ok: true,
          supabaseUserId: await resolveSupabaseUserId(context.env, {
            email: existing.email,
            friskyUserId: existing.frisky_user_id,
            telegramId: body.telegramId
          }) ?? "",
          friskyUserId: existing.frisky_user_id,
          friskyOrgId: existing.frisky_org_id,
          email: existing.email
        };
      }
    }
  }

  if (!result.ok) {
    const status = result.reason === "not_found" || result.reason === "expired" ? 409 : 503;
    return noStoreJson({ ok: false, error: result.reason }, { status });
  }

  if (result.email) {
    await sendBillingEmail(context.env, {
      to: result.email,
      subject: "MyFenrir · Telegram linked",
      title: "Telegram linked securely",
      body: "Your Telegram identity is now connected to your Frisky Dev account.",
      status: "IDENTITY LINKED",
      detail: `Telegram ID ${String(body.telegramId)} · You can now continue your MyFenrir community setup.`
    }).catch((error) => console.error("telegram link confirmation email failed", error));
  }

  return noStoreJson({
    ok: true,
    linked: true,
    email: result.email,
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

function timingSafeEqualText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
