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
    await enableMyFenrirMiniApp(env, channel, message.chat.id);
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
            "Open MyFenrir from this chat — there is no code to copy.",
            "",
            "_One verified link. Tap Link Telegram ID on /main if you ever need to reconnect._"
          ].join("\n")
        : [
            "⚠️ That link code expired or is invalid.",
            "",
            "Open MyFenrir, tap Link Telegram ID, and generate a fresh one-time Telegram link."
          ].join("\n"),
      reply_markup: result.ok
        ? myFenrirOpenKeyboard()
        : myFenrirOpenKeyboard({ miniApp: true })
    }, channel);
    return;
  }

  if (/^\/start\s+link$/i.test(text)) {
    await enableMyFenrirMiniApp(env, channel, message.chat.id);
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
            "Your identity is confirmed. Open MyFenrir from this chat whenever you need the dashboard."
          ].join("\n")
        : [
            `🐺 *Welcome, ${name}*`,
            "",
            "Your Telegram account is not linked to Frisky Dev yet.",
            "Open MyFenrir, sign in, then tap Link Telegram ID. There is no code to copy."
          ].join("\n"),
      reply_markup: account
        ? myFenrirOpenKeyboard()
        : myFenrirOpenKeyboard({ miniApp: true })
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
        "Link Telegram from the MyFenrir dashboard (Link Telegram ID). Telegram opens automatically — there is no code to copy.",
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
      await enableMyFenrirMiniApp(env, channel, message.chat.id);
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

const MYFENRIR_APP_URL = "https://www.myfenrir.com/main";

function myFenrirOpenKeyboard(options: { miniApp?: boolean } = {}) {
  const rows: Array<Array<Record<string, unknown>>> = [[{ text: "Open MyFenrir", url: MYFENRIR_APP_URL }]];
  if (options.miniApp) {
    rows.push([{ text: "Open MyFenrir Mini App", web_app: { url: MYFENRIR_APP_URL } }]);
  }
  return { inline_keyboard: rows };
}

async function enableMyFenrirMiniApp(env: BillingEnv, channel: string, chatId?: number) {
  await telegramApi(env, "setChatMenuButton", {
    ...(chatId ? { chat_id: chatId } : {}),
    menu_button: {
      type: "web_app",
      text: "Open MyFenrir",
      web_app: { url: MYFENRIR_APP_URL }
    }
  }, channel).catch((error) => console.error("set_chat_menu_button_failed", String(error)));
}

async function handleLinkCommand(env: BillingEnv, message: TelegramMessage, channel: string) {
  if (message.chat.type && message.chat.type !== "private") {
    await telegramApi(env, "sendMessage", {
      chat_id: message.chat.id,
      text: "For security, send /link to me in a private chat."
    }, channel);
    return;
  }

  await enableMyFenrirMiniApp(env, channel, message.chat.id);
  await telegramApi(env, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      "MyFenrir account linking",
      "",
      "1. Open MyFenrir and sign in.",
      "2. In your dashboard, tap \"Link Telegram ID\".",
      "3. Telegram opens automatically to confirm — there is no code to copy.",
      "",
      "The Open MyFenrir Mini App button is now enabled in this chat."
    ].join("\n"),
    reply_markup: myFenrirOpenKeyboard({ miniApp: true })
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
  const loginUrl = `${origin.replace(/\/$/, "")}/login`;
  const buttons = [
    [{ text: "🐺 Open MyFenrir", url: MYFENRIR_APP_URL }],
    [{ text: "🔐 Sign in", url: loginUrl }]
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
    : "Next: open MyFenrir → tap Link Telegram ID so Stars unlock this workspace.";

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
