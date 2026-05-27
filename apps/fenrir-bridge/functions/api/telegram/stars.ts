import { readSession } from "../../_lib/auth";
import { missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { hasStarsBotToken, hasStarsBotUsername, starsBotUsername, starsDeepLink, starsPrice } from "../../_lib/telegram-stars";

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  if (!hasStarsBotToken(context.env)) {
    return missingEnvResponse("TELEGRAM_PROD_BOT_TOKEN or TELEGRAM_BOT_TOKEN");
  }
  if (!hasStarsBotUsername(context.env)) {
    return missingEnvResponse("FENRIR_TELEGRAM_BOT_USERNAME or MYFENRIR_TELEGRAM_BOT_USERNAME");
  }

  return noStoreJson({
    ok: true,
    botUsername: starsBotUsername(context.env),
    url: starsDeepLink(context.env),
    stars: starsPrice(context.env),
    mode: "telegram_stars"
  });
};
