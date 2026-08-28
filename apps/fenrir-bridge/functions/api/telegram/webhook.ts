import { dbNotConfiguredResponse, missingEnvResponse, siteOrigin, type BillingEnv } from "../../_lib/billing-env";
import { consumeTelegramAccountLinkCode } from "../../_lib/telegram-identity";
import { consumeLinkCode, getAccountLinkByTelegramUser } from "../../_lib/account-links";
import { applyStarsEntitlementForTelegramUser } from "../../_lib/stars-billing";
import {
  createStarsOrder,
  getStarsOrder,
  markStarsPaid,
  hasStarsBotUsername,
  starsDeepLink,
  starsDescription,
  starsLabel,
  starsPrice,
  starsTitle,
  telegramApi
} from "../../_lib/telegram-stars";

type TelegramUpdate = {
  message?: TelegramMessage;
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: { id: number; type?: string };
  from?: { id: number; username?: string; first_name?: string };
  successful_payment?: {
    currency: string;
    total_amount: number;
    invoice_payload: string;
    telegram_payment_charge_id: string;
  };
};

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  if (!context.env.DB) return dbNotConfiguredResponse();
  const url = new URL(context.request.url);
  const channel = url.searchParams.get("bot") === "dev" ? "dev" : "prod";
  const configuredSecret = context.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return missingEnvResponse("TELEGRAM_WEBHOOK_SECRET");
  }
  const received = context.request.headers.get("x-telegram-bot-api-secret-token");
  if (received !== configuredSecret) {
    return Response.json({ ok: false, error: "invalid_telegram_webhook_secret" }, { status: 401 });
  }

  const channelToken =
    channel === "dev"
      ? context.env.TELEGRAM_DEV_BOT_TOKEN?.trim() || context.env.TELEGRAM_BOT_TOKEN?.trim()
      : context.env.TELEGRAM_PROD_BOT_TOKEN?.trim() || context.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!channelToken) return missingEnvResponse(channel === "dev" ? "TELEGRAM_DEV_BOT_TOKEN" : "TELEGRAM_BOT_TOKEN");

  const update = await context.request.json<TelegramUpdate>().catch(() => null);
  if (!update) return Response.json({ ok: false, error: "invalid_update" }, { status: 400 });

  if (update.pre_checkout_query) {
    await handlePreCheckout(context.env, update.pre_checkout_query, channel);
    return Response.json({ ok: true });
  }

  if (update.message?.successful_payment) {
    await handleSuccessfulPayment(context.env, update.message, channel);
    return Response.json({ ok: true });
  }

  if (update.message?.text) {
    await handleMessage(context.env, update.message, channel, siteOrigin(context.request, context.env));
  }

  return Response.json({ ok: true });
};

async function handleMessage(env: BillingEnv, message: TelegramMessage, channel: string, origin: string) {
  const text = (message.text ?? "").trim();
  const textLower = text.toLowerCase();
  if (isCommandForBot(text, "link", env)) {
    await handleLinkCommand(env, message, channel);
    return;
  }
  const linkCode = linkCodeFromStart(textLower);
  if (linkCode) {
    const result = await consumeTelegramAccountLinkCode(env, env.DB!, linkCode, {
      telegramUserId: String(message.from?.id ?? message.chat.id),
      telegramChatId: String(message.chat.id),
      telegramUsername: message.from?.username,
      telegramFirstName: message.from?.first_name
    });
    if (result.ok) {
      await consumeLinkCode(env, {
        code: linkCode,
        telegramId: String(message.from?.id ?? message.chat.id),
        telegramUsername: message.from?.username ?? null,
        telegramFirstName: message.from?.first_name ?? null
      }).catch((error) => console.error("account_links_write_failed", String(error)));
    }
    await telegramApi(env, "sendMessage", {
      chat_id: message.chat.id,
      parse_mode: "Markdown",
      text: result.ok
        ? [
            "🐺 *MyFenrir* · Telegram linked",
            "",
            "Your Telegram identity is connected to this Frisky Dev account.",
            "Continue Community Gate setup on communities.myfenrir.com — not the FriskyDev /main dashboard.",
            "",
            "_One verified link, then the Community Bridge walkthrough._"
          ].join("\n")
        : [
            "⚠️ That link code expired or is invalid.",
            "",
            "Open the FriskyDev link-start URL and generate a fresh one-time Telegram link."
          ].join("\n"),
      reply_markup: result.ok
        ? { inline_keyboard: [[{ text: "Continue Community Gate", url: COMMUNITY_BRIDGE_CONTINUE_URL }]] }
        : { inline_keyboard: [[{ text: "Link FriskyDev ID", url: FRISKY_TELEGRAM_LINK_START }]] }
    }, channel);
    return;
  }

  if (/^\/start\s+link$/i.test(text)) {
    const telegramId = String(message.from?.id ?? message.chat.id);
    const account = await getAccountLinkByTelegramUser(env, telegramId);
    const name = escapeMd(message.from?.first_name?.trim() || "there");
    await telegramApi(env, "sendMessage", {
      chat_id: message.chat.id,
      parse_mode: "Markdown",
      text: account
        ? [
            `🐺 *Welcome, ${name}*`,
            "",
            "✅ *Account linked with Frisky Dev*",
            `MyFenrir account · ${escapeMd(maskEmail(account.email))}`,
            "",
            "Your identity is confirmed. Next, add Fenrir to the protected group and map it on communities.myfenrir.com."
          ].join("\n")
        : [
            `🐺 *Welcome, ${name}*`,
            "",
            "Your Telegram account is not linked to Frisky Dev yet.",
            "Open the FriskyDev one-time link. There is no code to copy."
          ].join("\n"),
      reply_markup: {
        inline_keyboard: account
          ? [[{ text: "Continue Community Gate", url: COMMUNITY_BRIDGE_CONTINUE_URL }]]
          : [[{ text: "Link FriskyDev ID", url: FRISKY_TELEGRAM_LINK_START }]]
      }
    }, channel);
    return;
  }

  if (textLower.startsWith("/help") || textLower.startsWith("/commands")) {
    await telegramApi(env, "sendMessage", {
      chat_id: message.chat.id,
      parse_mode: "Markdown",
      text: [
        "🐺 *MyFenrir* · Telegram Lock by Frisky",
        "",
        "Stable branded lock URLs for your Telegram groups — Fenrir rotates and revokes the invite behind them.",
        "",
        "*Commands*",
        "· `/start` — open dashboard + unlock",
        "· `/help` — this message",
        "· `/subscribe` · `/unlock` — open the Telegram Stars box (⭐1,150)",
        "",
        "The Pack is $14.99/month. Card, Stars, or crypto — same price.",
        "",
        "Link Telegram from the MyFenrir dashboard (Settings → Link Telegram), then manage locks there.",
        "",
        "_One verified link, every product._"
      ].join("\n"),
      reply_markup: {
        inline_keyboard: startActionButtons(env, origin)
      }
    }, channel);
    return;
  }

  if (!textLower.startsWith("/subscribe") && !textLower.startsWith("/unlock") && !textLower.startsWith("/start fenrir_stars")) {
    if (textLower.startsWith("/start")) {
      const name = escapeMd(message.from?.first_name?.trim() || "there");
      await telegramApi(env, "sendMessage", {
        chat_id: message.chat.id,
        parse_mode: "Markdown",
        text: [
          `🐺 *MyFenrir* · hey ${name}`,
          "",
          "*Telegram Lock* — share one stable URL. Fenrir keeps the real invite fresh, rotated, and revocable.",
          "",
          "· Open the dashboard to create locks",
          "· Link Telegram so Stars and admin roster match this chat",
          "· Unlock a plan with Stars when you are ready",
          "",
          "_One verified link, every product._"
        ].join("\n"),
        reply_markup: {
          inline_keyboard: startActionButtons(env, origin)
        }
      }, channel);
    }
    return;
  }

  const telegramUserId = String(message.from?.id ?? message.chat.id);
  const telegramChatId = String(message.chat.id);
  const amount = starsPrice(env);
  const payload = await createStarsOrder(env.DB!, telegramUserId, telegramChatId, amount);

  await telegramApi(env, "sendInvoice", {
    chat_id: message.chat.id,
    title: starsTitle(env),
    description: starsDescription(env),
    payload,
    // `provider_token` must be OMITTED for XTR, not sent empty (empty string
    // previously returned PROVIDER_ACCOUNT_INVALID). `subscription_period` is
    // required or Telegram charges once while we advertise "$14.99/month".
    currency: "XTR",
    prices: [{ label: starsLabel(env), amount }],
    subscription_period: 2592000,
    protect_content: true
  }, channel);
}

function isCommandForBot(text: string, command: string, env: BillingEnv) {
  const match = text.match(new RegExp(`^/${command}(?:@([A-Za-z0-9_]+))?(?:\\s|$)`, "i"));
  if (!match) return false;
  const target = (match[1] ?? "").toLowerCase();
  return !target || target === (env.FENRIR_TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").toLowerCase();
}

const FRISKY_TELEGRAM_LINK_START = "https://www.myfenrir.com/api/telegram/link/start";
const COMMUNITY_BRIDGE_CONTINUE_URL = "https://communities.myfenrir.com/gate?onboarding=1";

async function handleLinkCommand(env: BillingEnv, message: TelegramMessage, channel: string) {
  if (message.chat.type && message.chat.type !== "private") {
    await telegramApi(env, "sendMessage", {
      chat_id: message.chat.id,
      text: "For security, send /link to me in a private chat."
    }, channel);
    return;
  }

  await telegramApi(env, "sendMessage", {
    chat_id: message.chat.id,
    text: "Link your FriskyDev ID first. Telegram confirms automatically — there is no code to copy. After that, Community Gate setup continues on communities.myfenrir.com.",
    reply_markup: { inline_keyboard: [[{ text: "Link FriskyDev ID", url: FRISKY_TELEGRAM_LINK_START }]] }
  }, channel);
}

function escapeMd(s: string) {
  return s.replace(/([_*`\[])/g, "\\$1");
}

function maskEmail(email: string | null) {
  if (!email || !email.includes("@")) return "verified identity";
  const [local, domain] = email.split("@", 2);
  const visible = (local || "").slice(0, 2);
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, (local || "").length - visible.length)))}@${domain}`;
}

function linkCodeFromStart(text: string) {
  const match = text.match(/^\/start\s+link_([a-z0-9_-]{8,64})$/i);
  return match?.[1] ?? "";
}

function startActionButtons(env: BillingEnv, origin: string) {
  const baseUrl = origin.replace(/\/$/, "");
  const buttons = [
    [{ text: "🐺 Open MyFenrir", url: baseUrl }],
    [{ text: "🔐 Sign in", url: `${baseUrl}/login` }]
  ];

  if (hasStarsBotUsername(env)) {
    buttons.push([{ text: "⭐ Unlock with Stars", url: starsDeepLink(env) }]);
  }

  return buttons;
}

async function handlePreCheckout(env: BillingEnv, query: NonNullable<TelegramUpdate["pre_checkout_query"]>, channel: string) {
  const order = await getStarsOrder(env.DB!, query.invoice_payload);
  const valid =
    query.invoice_payload.startsWith("fenrir_stars:") &&
    order &&
    order.status === "pending" &&
    String(query.from.id) === String(order.telegram_user_id) &&
    query.currency === "XTR" &&
    query.total_amount === Number(order.amount);

  await telegramApi(env, "answerPreCheckoutQuery", {
    pre_checkout_query_id: query.id,
    ok: Boolean(valid),
    error_message: valid ? undefined : "This Fenrir Stars invoice expired. Please run /subscribe again."
  }, channel);
}

async function handleSuccessfulPayment(env: BillingEnv, message: TelegramMessage, channel: string) {
  const payment = message.successful_payment!;
  const order = await getStarsOrder(env.DB!, payment.invoice_payload);
  const telegramUserId = String(message.from?.id ?? order?.telegram_user_id ?? message.chat.id);
  const valid =
    payment.invoice_payload.startsWith("fenrir_stars:") &&
    order &&
    order.status === "pending" &&
    String(order.telegram_user_id) === telegramUserId &&
    payment.currency === "XTR" &&
    payment.total_amount === Number(order.amount);

  if (!valid) {
    await telegramApi(env, "sendMessage", {
      chat_id: message.chat.id,
      text: "Fenrir received a payment signal that did not match an active order. Access was not changed. Run /subscribe again if you need a fresh invoice."
    }, channel);
    return;
  }

  await markStarsPaid(env.DB!, {
    payload: payment.invoice_payload,
    telegramUserId,
    telegramChatId: String(message.chat.id),
    amount: payment.total_amount,
    currency: payment.currency,
    telegramPaymentChargeId: payment.telegram_payment_charge_id
  });

  const entitlement = await applyStarsEntitlementForTelegramUser(env.DB!, env, telegramUserId, {
    starsAmount: payment.total_amount,
    payload: payment.invoice_payload,
    chargeId: payment.telegram_payment_charge_id
  });

  const linkHint = entitlement.applied
    ? `Workspace plan: *${entitlement.plan}*`
    : "Next: open MyFenrir → *Settings → Link Telegram* so Stars unlock this workspace.";

  await telegramApi(env, "sendMessage", {
    chat_id: message.chat.id,
    parse_mode: "Markdown",
    text: [
      "⭐ *MyFenrir* · Stars unlocked",
      "",
      "Status: *active*",
      `Stars: ${payment.total_amount}`,
      linkHint,
      "",
      "_Telegram Lock is ready when you are._"
    ].join("\n")
  }, channel);
}
