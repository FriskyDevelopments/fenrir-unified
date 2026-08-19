// GET /api/telegram/link/start
// Browser navigation endpoint used by Community Bridge. It authenticates on
// the canonical MyFenrir origin, mints the same single-use link as POST
// /api/telegram/link, then redirects straight to Telegram.

import { readSession } from "../../../_lib/auth";
import {
  dbNotConfiguredResponse,
  missingEnvResponse,
  type BillingEnv,
} from "../../../_lib/billing-env";
import {
  createTelegramAccountLinkCode,
  telegramBotUsername,
} from "../../../_lib/telegram-identity";
import {
  accountLinksConfigured,
  createLinkCode,
  resolveSupabaseUserId,
} from "../../../_lib/account-links";

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) {
    const login = new URL("/main", context.request.url);
    login.searchParams.set("next", "/api/telegram/link/start");
    return Response.redirect(login.toString(), 302);
  }

  if (!context.env.DB) return dbNotConfiguredResponse();

  const username = telegramBotUsername(context.env);
  if (!username) return missingEnvResponse("FENRIR_TELEGRAM_BOT_USERNAME");

  const link = await createTelegramAccountLinkCode(context.env.DB, session);

  if (accountLinksConfigured(context.env)) {
    const supabaseUserId = await resolveSupabaseUserId(context.env, {
      email: session.email,
      friskyUserId: session.frisky_user_id,
    });
    if (supabaseUserId) {
      await createLinkCode(context.env, {
        code: link.code,
        supabaseUserId,
        friskyUserId: session.frisky_user_id,
        friskyOrgId: session.frisky_org_id,
        email: session.email,
        expiresAt: link.expiresAt,
      });
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://t.me/${username}?start=link_${link.code}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
};
