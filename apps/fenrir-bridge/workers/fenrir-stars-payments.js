const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) }
  });

const nowIso = () => new Date().toISOString();

const starsPrice = (env) => {
  const parsed = Number.parseInt(env.FENRIR_STARS_PRICE || "250", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 250;
};

const botUsername = (env) => (env.FENRIR_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();

const botToken = (env, channel) => {
  if (channel === "dev") return (env.TELEGRAM_DEV_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "").trim();
  return (env.TELEGRAM_PROD_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "").trim();
};

const normalizeText = (value) => (value || "").trim();
const BRIDGE_TARGET = "bridge.myfenrir.com";

const FENRIR_BOT_BRIEF = [
  "You are Fenrir Bot by Frisky.",
  "You are NOT Pupbot. You are NOT Gemini Pupbot. You are NOT a generic assistant.",
  "You are the intelligence layer for Fenrir Protocol and Fenrir Bridge.",
  "Fenrir Bridge helps Telegram group admins, creators, operators, and small businesses stop sharing raw Telegram invite links.",
  "Primary promise: stop sharing raw Telegram invite links. Use one stable branded domain link, rotate private Telegram invites anytime, and keep control.",
  "Stable link examples: https://customer.myfenrir.com/main and https://join.customer-domain.com/main.",
  "If a private invite leaks, Fenrir rotates or revokes the Telegram invite while the public URL keeps working.",
  "Brand: Frisky Developments. Product: Fenrir Bridge. Tone: sharp, calm, operational, premium, direct.",
  "Visual/message style: sleek modular Telegram 2026 update energy, dark command center, clean sections, compact operational labels.",
  "Default to English. If the user writes Spanish, answer in Spanish. If French, answer in French. If German, answer in German.",
  "CONTROL RULES:",
  "You do not directly control Telegram. You do not directly process payment. You do not directly verify payment. You do not own entitlement truth.",
  "The Fenrir Worker controls the bot. Telegram Stars handles the payment box. D1 stores payment and access truth.",
  "Never claim payment or access is active unless backend entitlement_status is active.",
  "Never invent payment status. Never expose bot tokens, API keys, secrets, raw invite links, or internal IDs.",
  "Never tell users to transfer their domain. Never say Cloudflare is required as registrar.",
  "Users can keep any registrar. DNS can still route through Cloudflare.",
  "Never reference fenrirprotocol.com as live infrastructure. Use myfenrir.com as the owned Fenrir domain.",
  `The canonical bridge target is ${BRIDGE_TARGET} unless changed in production config.`,
  "PAYMENT BEHAVIOR:",
  "If user asks to buy, pay, upgrade, subscribe, unlock, activate, use Stars, or similar: say you are opening the official Fenrir payment box.",
  "Explain Telegram Stars handles the transaction and Fenrir verifies access after Telegram confirms payment.",
  "If user asks for Stripe: explain Stripe Direct Billing is the professional card/invoice route for Pro and Operator, but only open it when the Stripe backend is configured. Otherwise say it is pending and offer Stars.",
  "Do not ask for card details. Do not pretend payment is complete.",
  "STATUS BEHAVIOR:",
  "If user asks status/access/active/paid/subscription/entitlement: use backend entitlement_status. If active, say Fenrir Protocol is active. If inactive, say access is not active yet and invite them to subscribe.",
  "SETUP BEHAVIOR:",
  "Setup path: choose Fenrir subdomain or custom domain; add Fenrir bot to Telegram group; make bot admin; allow create/revoke invite links; create bridge slug; share stable public URL; rotate/revoke raw Telegram invites when needed.",
  "DNS WIZARD:",
  "TXT: Type TXT, Name _fenrir, Value fenrir-verify=<token>, TTL Auto, Purpose proves domain ownership.",
  `CNAME: Type CNAME, Name join, Value ${BRIDGE_TARGET}, TTL Auto, Purpose routes the customer subdomain to Fenrir.`,
  "PLANS:",
  "Free $0: 1 Telegram Lock, 1 Fenrir subdomain, no custom domain, testing.",
  "Starter $3/mo or equivalent Stars: 3 Telegram Locks, Fenrir subdomains, small communities.",
  "Pro $7/mo or equivalent Stars: 10 Telegram Locks, custom domain support, paid groups, creators, small businesses.",
  "Operator $15/mo or equivalent Stars: unlimited Telegram Locks, multi-admin workflows, audit logs, agencies/operators.",
  "Upsells: done-for-you setup $25 one-time, domain concierge $15 one-time, emergency invite rotation $10 one-time.",
  "Recommendation map: one group -> Starter; paid group/course/VIP/client community -> Pro; many groups/clients/ops -> Operator; testing -> Free.",
  "Keep replies concise. Use clean bullets when useful. No corporate fluff."
].join("\n");

async function telegramApi(env, channel, method, body) {
  const token = botToken(env, channel);
  if (!token) throw new Error("missing_telegram_token");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(`telegram_api_failed:${method}`);
  return data;
}

async function createOrder(env, telegramUserId, telegramChatId, amount) {
  const payload = `fenrir_stars:${telegramUserId}:${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  await env.DB.prepare(
    `INSERT INTO telegram_stars_orders (
      payload, telegram_user_id, telegram_chat_id, amount, status, created_at
    ) VALUES (?, ?, ?, ?, 'pending', ?)`
  )
    .bind(payload, telegramUserId, telegramChatId, amount, nowIso())
    .run();
  return payload;
}

async function getOrder(env, payload) {
  return env.DB.prepare(`SELECT * FROM telegram_stars_orders WHERE payload = ?`).bind(payload).first();
}

async function getEntitlement(env, telegramUserId) {
  return env.DB.prepare(`SELECT * FROM telegram_stars_entitlements WHERE telegram_user_id = ?`)
    .bind(String(telegramUserId))
    .first();
}

async function consumeTelegramLinkCode(env, code, message) {
  const pending = await env.DB.prepare(
    `SELECT * FROM telegram_account_link_codes
     WHERE code = ? AND status = 'pending'
     LIMIT 1`
  )
    .bind(code)
    .first();
  if (!pending) return { ok: false, reason: "not_found" };
  if (Date.parse(pending.expires_at) <= Date.now()) {
    await env.DB.prepare(`UPDATE telegram_account_link_codes SET status = 'expired' WHERE code = ?`).bind(code).run();
    return { ok: false, reason: "expired" };
  }

  const ts = nowIso();
  const telegramUserId = String(message.from?.id || message.chat.id);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM telegram_identity_links WHERE frisky_user_id = ? OR telegram_user_id = ?`).bind(
      pending.frisky_user_id,
      telegramUserId
    ),
    env.DB.prepare(
      `INSERT INTO telegram_identity_links (
        telegram_user_id, frisky_user_id, frisky_org_id, email,
        telegram_username, telegram_first_name, linked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        frisky_user_id = excluded.frisky_user_id,
        frisky_org_id = excluded.frisky_org_id,
        email = excluded.email,
        telegram_username = excluded.telegram_username,
        telegram_first_name = excluded.telegram_first_name,
        updated_at = excluded.updated_at`
    ).bind(
      telegramUserId,
      pending.frisky_user_id,
      pending.frisky_org_id,
      pending.email,
      message.from?.username || null,
      message.from?.first_name || null,
      ts,
      ts
    ),
    env.DB.prepare(
      `UPDATE telegram_account_link_codes
       SET status = 'claimed',
           telegram_user_id = ?,
           telegram_chat_id = ?,
           telegram_username = ?,
           telegram_first_name = ?,
           claimed_at = ?
       WHERE code = ?`
    ).bind(
      telegramUserId,
      String(message.chat.id),
      message.from?.username || null,
      message.from?.first_name || null,
      ts,
      code
    )
  ]);
  return { ok: true, friskyUserId: pending.frisky_user_id, friskyOrgId: pending.frisky_org_id };
}

function linkCodeFromStart(text) {
  const match = text.match(/^\/start\s+link_([a-z0-9_-]{8,64})$/i);
  return match?.[1] || "";
}

async function markPaid(env, payment, message, order) {
  const ts = nowIso();
  const telegramUserId = String(message.from?.id || order?.telegram_user_id || message.chat.id);
  await env.DB.prepare(
    `UPDATE telegram_stars_orders
     SET status = 'paid', telegram_payment_charge_id = ?, paid_at = ?
     WHERE payload = ?`
  )
    .bind(payment.telegram_payment_charge_id, ts, payment.invoice_payload)
    .run();

  await env.DB.prepare(
    `INSERT INTO telegram_stars_entitlements (
      telegram_user_id, telegram_chat_id, status, stars_amount, currency,
      telegram_payment_charge_id, payload, created_at, updated_at
    ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      telegram_chat_id = excluded.telegram_chat_id,
      status = 'active',
      stars_amount = excluded.stars_amount,
      currency = excluded.currency,
      telegram_payment_charge_id = excluded.telegram_payment_charge_id,
      payload = excluded.payload,
      updated_at = excluded.updated_at`
  )
    .bind(
      telegramUserId,
      String(message.chat.id),
      payment.total_amount,
      payment.currency,
      payment.telegram_payment_charge_id,
      payment.invoice_payload,
      ts,
      ts
    )
    .run();
}

async function sendStarsInvoice(env, channel, message) {
  const amount = starsPrice(env);
  const payload = await createOrder(env, String(message.from?.id || message.chat.id), String(message.chat.id), amount);
  await telegramApi(env, channel, "sendInvoice", {
    chat_id: message.chat.id,
    title: env.FENRIR_STARS_TITLE || "Fenrir Protocol Access",
    description:
      env.FENRIR_STARS_DESCRIPTION ||
      "Unlock Fenrir Protocol access with Telegram Stars while card billing is being reviewed.",
    payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: env.FENRIR_STARS_LABEL || "Fenrir Protocol Access", amount }],
    protect_content: true
  });
}

function paymentIntent(text) {
  return /\b(buy|pay|payment|subscribe|unlock|upgrade|pro|starter|operator|stars|checkout|pagar|comprar|suscribir|desbloquear|me interesa)\b/i.test(
    text
  );
}

function statusIntent(text) {
  return /^\/status\b/i.test(text) || /\b(status|access|active|paid|entitlement|estado|activo|pagado)\b/i.test(text);
}

function setupIntent(text) {
  return /^\/setup\b/i.test(text) || /\b(setup|domain|dns|telegram|bridge|link|cloudflare|dominio|configurar|grupo)\b/i.test(text);
}

function pricingIntent(text) {
  return /\b(price|pricing|plan|plans|free|starter|pro|operator|cost|cuanto|precio|planes|tarifa)\b/i.test(text);
}

function stripeIntent(text) {
  return /\b(stripe|card|credit|debit|invoice|billing portal|stripe pro|stripe operator|tarjeta|factura)\b/i.test(text);
}

function menuIntent(text) {
  return /^\/(start|menu|help)\b/i.test(text) || /\b(menu|commands|modulos|módulos|ayuda|help)\b/i.test(text);
}

function spanishIntent(text) {
  return /\b(si|sí|como|cómo|cuanto|precio|pagar|comprar|dominio|grupo|configurar|estado|activo|pagado|quiero|tengo)\b/i.test(text);
}

function modularMenuText(text, entitlement) {
  const active = entitlement?.status === "active";
  if (spanishIntent(text)) {
    return [
      "FENRIR BOT OS | Menu",
      `Estado: ${active ? "activo" : "pendiente"}`,
      "",
      "MOD 01 | Setup",
      "Dominio, DNS, bot admin y primer bridge.",
      "",
      "MOD 02 | Planes",
      "Free, Starter, Pro, Operator.",
      "",
      "MOD 03 | Pago",
      "Abre la caja oficial de Telegram Stars.",
      "",
      "MOD 04 | Estado",
      "Verifica si tu acceso esta activo.",
      "",
      "Comandos: /setup /plans /subscribe /status"
    ].join("\n");
  }
  return [
    "FENRIR BOT OS | Menu",
    `Status: ${active ? "active" : "pending"}`,
    "",
    "MOD 01 | Setup",
    "Domain, DNS, bot admin permissions, and first bridge.",
    "",
    "MOD 02 | Plans",
    "Free, Starter, Pro, Operator.",
    "",
    "MOD 03 | Payment",
    "Open the official Telegram Stars payment box.",
    "",
    "MOD 04 | Status",
    "Check whether backend entitlement is active.",
    "",
    "Commands: /setup /plans /subscribe /status"
  ].join("\n");
}

async function sendBotMenu(env, channel, message, entitlement) {
  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: modularMenuText(message.text || "", entitlement),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⚙️ MOD 01 · Setup", callback_data: "fenrir_setup" },
          { text: "📋 MOD 02 · Plans", callback_data: "fenrir_plans" }
        ],
        [
          { text: "⭐ MOD 03 · Stars", callback_data: "fenrir_subscribe" },
          { text: "📊 MOD 04 · Status", callback_data: "fenrir_status" }
        ]
      ]
    }
  });
}

function fallbackMind(text, entitlement) {
  if (menuIntent(text)) return modularMenuText(text, entitlement);

  if (statusIntent(text)) {
    if (spanishIntent(text)) {
      return entitlement?.status === "active"
        ? `Fenrir Protocol esta activo.\n\nAcceso: activo\nStars: ${entitlement.stars_amount}\nModo: Telegram Stars`
        : "Fenrir Protocol todavia no esta activo.\n\nDi “comprar” o usa /subscribe y abro la caja oficial de Telegram Stars.";
    }
    return entitlement?.status === "active"
      ? `Fenrir Protocol is active.\n\nAccess: unlocked\nStars: ${entitlement.stars_amount}\nMode: Telegram Stars`
      : "Fenrir Protocol is not active yet.\n\nSay “buy” or use /subscribe and I’ll open the Stars payment box.";
  }

  if (pricingIntent(text)) {
    return [
      "FENRIR PROTOCOL | Plans",
      "",
      "Free — $0: 1 Telegram Lock, 1 Fenrir subdomain, for testing.",
      "Starter — $3/mo or Stars: 3 Telegram Locks, Fenrir subdomains.",
      "Pro — $7/mo or Stars: 10 Telegram Locks, custom domain support.",
      "Operator — $15/mo or Stars: unlimited Locks, multi-admin workflows, audit logs.",
      "",
      "One group: Starter. Paid VIP/course/client community: Pro. Many groups or clients: Operator."
    ].join("\n");
  }

  if (stripeIntent(text)) {
    return [
      "FENRIR PROTOCOL | Direct Billing",
      "Gateway: Stripe Secure",
      "Status: pending backend activation",
      "",
      "Stripe Direct Billing is the professional card and invoice route for Pro and Operator users.",
      "",
      "What it supports once active:",
      "• Card, Apple Pay, and Google Pay through Stripe Checkout",
      "• Stripe Customer Portal",
      "• Business invoices",
      "• Pro and Operator subscriptions",
      "",
      "For now, I can open the official Telegram Stars payment box. Telegram handles the transaction, and Fenrir activates access after confirmation."
    ].join("\n");
  }

  if (setupIntent(text)) {
    if (spanishIntent(text)) {
      return [
        "Si. Fenrir te da un link estable y dejas de compartir invitaciones crudas de Telegram.",
        "",
        "Ruta de setup:",
        "1. Usa un subdominio Fenrir o tu dominio.",
        "2. Agrega Fenrir Bot al grupo.",
        "3. Hazlo admin.",
        "4. Permite crear y revocar invites.",
        "5. Crea el slug del bridge.",
        "6. Comparte el link estable.",
        "",
        `DNS custom: CNAME join -> ${BRIDGE_TARGET}. No tienes que transferir tu dominio.`
      ].join("\n");
    }
    return [
      "Fenrir Bridge setup path:",
      "",
      "1. Choose a Fenrir subdomain or custom domain.",
      "2. Add Fenrir Bot to the Telegram group.",
      "3. Make the bot admin.",
      "4. Allow it to create and revoke invite links.",
      "5. Create a bridge slug.",
      "6. Share the stable public URL.",
      "",
      `Custom DNS: CNAME join -> ${BRIDGE_TARGET}. You can keep any registrar.`,
      "",
      "Say “buy” when you want me to open the Stars payment box."
    ].join("\n");
  }

  return [
    "FENRIR BOT OS | Menu",
    "Status: online",
    "",
    "MOD 01 | Setup",
    "Telegram bridge setup, DNS, bot permissions.",
    "",
    "MOD 02 | Plans",
    "Pricing and access limits.",
    "",
    "MOD 03 | Payment",
    "Official Telegram Stars payment box.",
    "",
    "MOD 04 | Status",
    "Backend entitlement check.",
    "",
    "Commands: /setup /plans /subscribe /status"
  ].join("\n");
}

async function geminiMind(env, input, entitlement) {
  const key = normalizeText(env.GEMINI_API_KEY || env.GOOGLE_AI_STUDIO_API_KEY);
  if (!key) return fallbackMind(input.text, entitlement);

  const model = normalizeText(env.GEMINI_MODEL) || "gemini-3-flash-preview";
  const prompt = [
    FENRIR_BOT_BRIEF,
    "",
    `entitlement_status: ${entitlement?.status || "none"}`,
    `stars_amount: ${entitlement?.stars_amount || 0}`,
    `user_message: ${input.text}`
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 420
      }
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return fallbackMind(input.text, entitlement);
  const answer = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n").trim();
  return answer || fallbackMind(input.text, entitlement);
}

async function handleTelegramWebhook(request, env, url) {
  if (!env.DB) return json({ ok: false, error: "db_not_configured" }, { status: 500 });
  const channel = url.searchParams.get("bot") === "dev" ? "dev" : "prod";
  if (!botToken(env, channel)) return json({ ok: false, error: "missing_telegram_token" }, { status: 500 });

  const configuredSecret = normalizeText(env.TELEGRAM_WEBHOOK_SECRET);
  if (configuredSecret && request.headers.get("x-telegram-bot-api-secret-token") !== configuredSecret) {
    return json({ ok: false, error: "invalid_telegram_webhook_secret" }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  if (!update) return json({ ok: false, error: "invalid_update" }, { status: 400 });

  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    const order = await getOrder(env, query.invoice_payload);
    const valid =
      query.invoice_payload?.startsWith("fenrir_stars:") &&
      order &&
      order.status === "pending" &&
      String(query.from.id) === String(order.telegram_user_id) &&
      query.currency === "XTR" &&
      query.total_amount === Number(order.amount);

    await telegramApi(env, channel, "answerPreCheckoutQuery", {
      pre_checkout_query_id: query.id,
      ok: Boolean(valid),
      error_message: valid ? undefined : "This Fenrir Stars invoice expired. Please run /subscribe again."
    });
    return json({ ok: true });
  }

  if (update.callback_query) {
    const query = update.callback_query;
    const callbackMessage = query.message || { chat: { id: query.from.id }, from: query.from, text: "" };
    const entitlement = await getEntitlement(env, query.from?.id || callbackMessage.chat.id);
    await telegramApi(env, channel, "answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Fenrir module selected."
    });

    if (query.data === "fenrir_subscribe") {
      await telegramApi(env, channel, "sendMessage", {
        chat_id: callbackMessage.chat.id,
        text: "Fenrir Protocol payment box opening. Telegram Stars handles the transaction; Fenrir verifies access after payment."
      });
      await sendStarsInvoice(env, channel, callbackMessage);
      return json({ ok: true });
    }

    const moduleText = {
      fenrir_setup: "/setup",
      fenrir_plans: "/plans",
      fenrir_status: "/status"
    }[query.data] || "/menu";
    const answer = fallbackMind(moduleText, entitlement);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: callbackMessage.chat.id,
      text: answer
    });
    return json({ ok: true });
  }

  const message = update.message;
  if (message?.successful_payment) {
    const payment = message.successful_payment;
    const order = await getOrder(env, payment.invoice_payload);
    await markPaid(env, payment, message, order);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: `Fenrir Protocol activated.\n\nAccess: active\nStars: ${payment.total_amount}\nPayment rail: Telegram Stars`
    });
    return json({ ok: true });
  }

  const text = normalizeText(message?.text);
  if (!text) return json({ ok: true });

  const entitlement = await getEntitlement(env, message.from?.id || message.chat.id);

  if (menuIntent(text)) {
    await sendBotMenu(env, channel, message, entitlement);
    return json({ ok: true });
  }

  const linkCode = linkCodeFromStart(text);
  if (linkCode) {
    const result = await consumeTelegramLinkCode(env, linkCode, message);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: result.ok
        ? "Telegram identity linked to your Frisky ID. Fenrir can now connect this Telegram account to your workspace."
        : "This Fenrir link code is expired or invalid. Open MyFenrir and generate a fresh Telegram link."
    });
    return json({ ok: true });
  }

  if (/^\/subscribe\b/i.test(text) || /^\/unlock\b/i.test(text) || /^\/start\s+fenrir_stars\b/i.test(text) || paymentIntent(text)) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: "Fenrir Protocol payment box opening. Telegram Stars handles the transaction; Fenrir verifies access after payment."
    });
    await sendStarsInvoice(env, channel, message);
    return json({ ok: true });
  }

  const answer = await geminiMind(env, { text, channel }, entitlement);
  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: answer
  });

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env, url);
    }

    if (url.pathname === "/api/telegram/stars" && request.method === "GET") {
      const username = botUsername(env);
      if (!username || !botToken(env, "prod")) {
        return json({ ok: false, error: "telegram_stars_not_configured" }, { status: 500 });
      }
      return json({
        ok: true,
        botUsername: username,
        url: `https://t.me/${username}?start=fenrir_stars`,
        stars: starsPrice(env),
        mode: "telegram_stars"
      });
    }

    if (url.pathname === "/api/readiness" && request.method === "GET") {
      return json({
        ok: true,
        service: "fenrir-stars-payments",
        billing: {
          telegramStarsConfigured: Boolean(botUsername(env) && botToken(env, "prod")),
          telegramWebhookSecretConfigured: Boolean(normalizeText(env.TELEGRAM_WEBHOOK_SECRET))
        },
        mind: {
          geminiConfigured: Boolean(normalizeText(env.GEMINI_API_KEY || env.GOOGLE_AI_STUDIO_API_KEY)),
          model: normalizeText(env.GEMINI_MODEL) || "gemini-3-flash-preview",
          fallbackEnabled: true
        }
      });
    }

    return json({ ok: true, service: "fenrir-stars-payments" });
  }
};
