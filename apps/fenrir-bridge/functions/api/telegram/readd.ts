import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { getActiveBridgeForOrg, getActiveBridgeForOrgByChatId } from "../../_lib/product-db";
import { noStoreJson } from "../../_lib/responses";
import { getTelegramIdentityLink } from "../../_lib/telegram-identity";

type TelegramCreateInviteResponse = {
  ok: boolean;
  result?: {
    invite_link?: string;
  };
  description?: string;
};

function telegramBotToken(env: BillingEnv) {
  return env.TELEGRAM_PROD_BOT_TOKEN?.trim() || env.TELEGRAM_BOT_TOKEN?.trim();
}

function sanitizeChatId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeBridgeId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request.json<{ bridgeId?: unknown; chatId?: unknown }>().catch(() => null);
  const bridgeId = sanitizeBridgeId(body?.bridgeId);
  const chatId = sanitizeChatId(body?.chatId);
  if (!bridgeId && !chatId) return noStoreJson({ ok: false, error: "telegram_bridge_required" }, { status: 400 });
  if (chatId && !/^-?\d{5,}$/.test(chatId)) return noStoreJson({ ok: false, error: "invalid_telegram_chat_id" }, { status: 400 });

  const link = await getTelegramIdentityLink(context.env.DB, session.frisky_user_id);
  if (!link) {
    return noStoreJson(
      {
        ok: false,
        error: "telegram_identity_required",
        detail: "Link Telegram before requesting a recovery invite."
      },
      { status: 409 }
    );
  }

  const bridge = bridgeId
    ? await getActiveBridgeForOrg(context.env.DB, session.frisky_org_id, bridgeId)
    : await getActiveBridgeForOrgByChatId(context.env.DB, session.frisky_org_id, chatId);
  if (!bridge) {
    return noStoreJson(
      {
        ok: false,
        error: "telegram_bridge_not_found",
        detail: "Recovery invites can only be created for an active Telegram lock in your Fenrir workspace."
      },
      { status: 404 }
    );
  }

  const token = telegramBotToken(context.env);
  if (!token) return missingEnvResponse("TELEGRAM_BOT_TOKEN");

  const expiresAtUnix = Math.floor(Date.now() / 1000) + 10 * 60;
  const response = await fetch(`https://api.telegram.org/bot${token}/createChatInviteLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: bridge.telegramChatId,
      name: `Fenrir recovery ${link.telegram_user_id}`.slice(0, 32),
      expire_date: expiresAtUnix,
      member_limit: 1,
      creates_join_request: false
    })
  });
  const data = (await response.json().catch(() => null)) as TelegramCreateInviteResponse | null;
  const inviteUrl = data?.result?.invite_link;
  if (!response.ok || !data?.ok || !inviteUrl) {
    return noStoreJson(
      {
        ok: false,
        error: "telegram_readd_failed",
        detail: data?.description ?? "Telegram rejected the recovery invite request."
      },
      { status: 502 }
    );
  }

  return noStoreJson({
    ok: true,
    mode: "telegram_readd",
    linked: true,
    telegramUserId: link.telegram_user_id,
    telegramUsername: link.telegram_username,
    bridgeId: bridge.id,
    chatId: bridge.telegramChatId,
    inviteUrl,
    expiresAt: new Date(expiresAtUnix * 1000).toISOString()
  });
};
