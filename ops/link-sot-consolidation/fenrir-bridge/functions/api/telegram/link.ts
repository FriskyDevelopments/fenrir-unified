// GET  /api/telegram/link  → is this signed-in user linked?  (reads SoT account_links, D1 fallback)
// POST /api/telegram/link  → mint a one-time deep-link code. Writes the SoT link_codes row
//                            (public.link_codes) AND the D1 cache row, using the SAME code,
//                            then returns t.me/<bot>?start=link_<code>.
//
// This is the user-facing generator. The bot-facing writer is
// POST /api/telegram/link/confirm (see confirm.ts).

import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { createTelegramAccountLinkCode, getTelegramIdentityLink, telegramBotUsername } from "../../_lib/telegram-identity";
import {
  accountLinksConfigured,
  createLinkCode,
  getAccountLinkByFriskyUser,
  resolveSupabaseUserId
} from "../../_lib/account-links";

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });

  // Source of Truth first.
  if (accountLinksConfigured(context.env)) {
    const link = await getAccountLinkByFriskyUser(context.env, session.frisky_user_id);
    if (link) {
      return noStoreJson({
        ok: true,
        linked: true,
        source: "account_links",
        telegramUserId: link.telegram_id ? String(link.telegram_id) : null,
        telegramUsername: link.telegram_username ?? null,
        linkedAt: link.verified_at ?? link.created_at
      });
    }
  }

  // Fallback to the D1 cache during transition.
  if (!context.env.DB) return dbNotConfiguredResponse();
  const d1 = await getTelegramIdentityLink(context.env.DB, session.frisky_user_id);
  return noStoreJson({
    ok: true,
    linked: Boolean(d1),
    source: "d1_cache",
    telegramUserId: d1?.telegram_user_id ?? null,
    telegramUsername: d1?.telegram_username ?? null,
    linkedAt: d1?.linked_at ?? null
  });
};

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const username = telegramBotUsername(context.env);
  if (!username) return missingEnvResponse("FENRIR_TELEGRAM_BOT_USERNAME");

  // 1) D1 cache/queue row (fast path the bot's webhook can read).
  const link = await createTelegramAccountLinkCode(context.env.DB, session);

  // 2) SoT row in Supabase (same code). Best-effort: never block the generator.
  if (accountLinksConfigured(context.env)) {
    const supabaseUserId = await resolveSupabaseUserId(context.env, {
      email: session.email,
      friskyUserId: session.frisky_user_id
    });
    if (supabaseUserId) {
      await createLinkCode(context.env, {
        code: link.code,
        supabaseUserId,
        friskyUserId: session.frisky_user_id,
        friskyOrgId: session.frisky_org_id,
        email: session.email,
        expiresAt: link.expiresAt
      });
    }
  }

  return noStoreJson({
    ok: true,
    linked: false,
    code: link.code,
    expiresAt: link.expiresAt,
    url: `https://t.me/${username}?start=link_${link.code}`
  });
};
