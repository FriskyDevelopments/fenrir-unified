import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { createTelegramAccountLinkCode, getTelegramIdentityLink, telegramBotUsername } from "../../_lib/telegram-identity";

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const link = await getTelegramIdentityLink(context.env.DB, session.frisky_user_id);
  return noStoreJson({
    ok: true,
    linked: Boolean(link),
    telegramUserId: link?.telegram_user_id ?? null,
    telegramUsername: link?.telegram_username ?? null,
    linkedAt: link?.linked_at ?? null
  });
};

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const username = telegramBotUsername(context.env);
  if (!username) return missingEnvResponse("FENRIR_TELEGRAM_BOT_USERNAME");

  const link = await createTelegramAccountLinkCode(context.env.DB, session);
  return noStoreJson({
    ok: true,
    linked: false,
    code: link.code,
    expiresAt: link.expiresAt,
    url: `https://t.me/${username}?start=link_${link.code}`
  });
};
