import { siteOrigin, type BillingEnv } from '../../_lib/billing-env';
import { consumeTelegramAccountLinkCode } from '../../_lib/telegram-identity';
import { applyStarsEntitlementForTelegramUser } from '../../_lib/stars-billing';
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
  telegramApi,
} from '../../_lib/telegram-stars';

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
  chat: { id: number };
  from?: { id: number; username?: string; first_name?: string };
  successful_payment?: {
    currency: string;
    total_amount: number;
    invoice_payload: string;
    telegram_payment_charge_id: string;
  };
};

// Telegram re-delivers any update it gets a non-2xx response for, which turns a rejected
// request into a retry storm and lets the status code fingerprint the endpoint. Every path
// therefore returns 200; processing is gated on the secret-token header, and anything
// unauthenticated or unprocessable is quietly acknowledged and dropped.
const ackWebhook = () => Response.json({ ok: true });

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const configuredSecret = context.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const received = context.request.headers.get('x-telegram-bot-api-secret-token');
  if (!configuredSecret) {
    console.error('stars_webhook_secret_not_configured');
    return ackWebhook();
  }
  if (received !== configuredSecret) {
    console.error('stars_webhook_bad_secret');
    return ackWebhook();
  }
  if (!context.env.DB) {
    console.error('stars_webhook_db_not_configured');
    return ackWebhook();
  }

  const url = new URL(context.request.url);
  const channel = url.searchParams.get('bot') === 'dev' ? 'dev' : 'prod';
  const channelToken =
    channel === 'dev'
      ? context.env.TELEGRAM_DEV_BOT_TOKEN?.trim() || context.env.TELEGRAM_BOT_TOKEN?.trim()
      : context.env.TELEGRAM_PROD_BOT_TOKEN?.trim() || context.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!channelToken) {
    console.error('stars_webhook_missing_token', { channel });
    return ackWebhook();
  }

  const update = await context.request.json<TelegramUpdate>().catch(() => null);
  if (!update) {
    console.error('stars_webhook_invalid_update');
    return ackWebhook();
  }

  if (update.pre_checkout_query) {
    try {
      await handlePreCheckout(context.env, update.pre_checkout_query, channel);
    } catch (e) {
      console.error('handlePreCheckout error:', e);
    }
    return Response.json({ ok: true });
  }

  if (update.message?.successful_payment) {
    try {
      await handleSuccessfulPayment(context.env, update.message, channel);
    } catch (e) {
      console.error('handleSuccessfulPayment error:', e);
    }
    return Response.json({ ok: true });
  }

  if (update.message?.text) {
    try {
      await handleMessage(
        context.env,
        update.message,
        channel,
        siteOrigin(context.request, context.env)
      );
    } catch (e) {
      console.error('handleMessage error:', e);
    }
  }

  return Response.json({ ok: true });
};

async function handleMessage(
  env: BillingEnv,
  message: TelegramMessage,
  channel: string,
  origin: string
) {
  const text = (message.text ?? '').trim().toLowerCase();
  const linkCode = linkCodeFromStart(text);
  if (linkCode) {
    const result = await consumeTelegramAccountLinkCode(env, env.DB!, linkCode, {
      telegramUserId: String(message.from?.id ?? message.chat.id),
      telegramChatId: String(message.chat.id),
      telegramUsername: message.from?.username,
      telegramFirstName: message.from?.first_name,
    });
    await telegramApi(
      env,
      'sendMessage',
      {
        chat_id: message.chat.id,
        text: result.ok
          ? 'Telegram identity linked to MyFenrir. Fenrir can now connect this Telegram account to your workspace and admin roster.'
          : 'This Fenrir link code is expired or invalid. Open MyFenrir and generate a fresh Telegram link.',
      },
      channel
    );
    return;
  }

  if (
    !text.startsWith('/subscribe') &&
    !text.startsWith('/unlock') &&
    !text.startsWith('/start fenrir_stars')
  ) {
    if (text.startsWith('/start')) {
      await telegramApi(
        env,
        'sendMessage',
        {
          chat_id: message.chat.id,
          text: [
            'MyFenrir bot is online.',
            '',
            'Use the one-time link from MyFenrir to connect your Telegram identity.',
            'For Foundry Pod or Neon Nexus access, open the early-access invitation.',
          ].join('\n'),
          reply_markup: {
            inline_keyboard: startActionButtons(env, origin),
          },
        },
        channel
      );
    }
    return;
  }

  const telegramUserId = String(message.from?.id ?? message.chat.id);
  const telegramChatId = String(message.chat.id);
  const amount = starsPrice(env);
  const payload = await createStarsOrder(env.DB!, telegramUserId, telegramChatId, amount);

  await telegramApi(
    env,
    'sendInvoice',
    {
      chat_id: message.chat.id,
      title: starsTitle(env),
      description: starsDescription(env),
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: starsLabel(env), amount }],
      protect_content: true,
    },
    channel
  );
}

function linkCodeFromStart(text: string) {
  const match = text.match(/^\/start\s+link_([a-z0-9_-]{8,64})$/i);
  return match?.[1] ?? '';
}

function startActionButtons(env: BillingEnv, origin: string) {
  const baseUrl = origin.replace(/\/$/, '');
  const buttons = [
    [{ text: 'Open MyFenrir', url: baseUrl }],
    [{ text: 'Open early-access invitation', url: `${baseUrl}/invitation/` }],
  ];

  if (hasStarsBotUsername(env)) {
    buttons.push([{ text: 'Unlock with Telegram Stars', url: starsDeepLink(env) }]);
  }

  return buttons;
}

async function handlePreCheckout(
  env: BillingEnv,
  query: NonNullable<TelegramUpdate['pre_checkout_query']>,
  channel: string
) {
  const order = await getStarsOrder(env.DB!, query.invoice_payload);
  const valid =
    query.invoice_payload.startsWith('fenrir_stars:') &&
    order &&
    order.status === 'pending' &&
    String(query.from.id) === String(order.telegram_user_id) &&
    query.currency === 'XTR' &&
    query.total_amount === Number(order.amount);

  await telegramApi(
    env,
    'answerPreCheckoutQuery',
    {
      pre_checkout_query_id: query.id,
      ok: Boolean(valid),
      error_message: valid
        ? undefined
        : 'This Fenrir Stars invoice expired. Please run /subscribe again.',
    },
    channel
  );
}

async function handleSuccessfulPayment(env: BillingEnv, message: TelegramMessage, channel: string) {
  // successful_payment is a field of Message; the payer is message.from (SuccessfulPayment has
  // no `from`). telegram_payment_charge_id is the idempotency key — Telegram may re-deliver the
  // same payment, so a charge id already recorded against this order must be a no-op.
  const payment = message.successful_payment!;
  const order = await getStarsOrder(env.DB!, payment.invoice_payload);
  const telegramUserId = String(message.from?.id ?? order?.telegram_user_id ?? message.chat.id);

  const replaySameCharge =
    !!order &&
    order.status === 'paid' &&
    order.telegram_payment_charge_id === payment.telegram_payment_charge_id;
  if (replaySameCharge) {
    console.log('stars_webhook_replay_ignored', { charge: payment.telegram_payment_charge_id });
    return;
  }

  const valid =
    payment.invoice_payload.startsWith('fenrir_stars:') &&
    order &&
    order.status === 'pending' &&
    String(order.telegram_user_id) === telegramUserId &&
    payment.currency === 'XTR' &&
    payment.total_amount === Number(order.amount);

  if (!valid) {
    console.error('stars_webhook_rejected', {
      payload: payment.invoice_payload.slice(0, 40),
      status: order?.status ?? 'no_order',
      payer: telegramUserId,
      amount: `${payment.total_amount} ${payment.currency}`,
    });
    await telegramApi(
      env,
      'sendMessage',
      {
        chat_id: message.chat.id,
        text: 'Fenrir received a payment signal that did not match an active order. Access was not changed. Run /subscribe again if you need a fresh invoice.',
      },
      channel
    );
    return;
  }

  await markStarsPaid(env.DB!, {
    payload: payment.invoice_payload,
    telegramUserId,
    telegramChatId: String(message.chat.id),
    amount: payment.total_amount,
    currency: payment.currency,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
  });

  const entitlement = await applyStarsEntitlementForTelegramUser(env.DB!, env, telegramUserId, {
    starsAmount: payment.total_amount,
    payload: payment.invoice_payload,
    chargeId: payment.telegram_payment_charge_id,
  });

  const linkHint = entitlement.applied
    ? `Workspace plan: ${entitlement.plan}`
    : 'Open MyFenrir → Settings → Link Telegram so Stars unlock your workspace.';

  await telegramApi(
    env,
    'sendMessage',
    {
      chat_id: message.chat.id,
      text: `Fenrir Protocol unlocked with Telegram Stars.\n\nStatus: active\nStars: ${payment.total_amount}\n${linkHint}`,
    },
    channel
  );
}
