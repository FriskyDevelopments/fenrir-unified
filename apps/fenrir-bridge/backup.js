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

const ADMIN_HEADER = "x-fenrir-admin-token";

const ALLOWED_WEBHOOK_TARGETS = [
  "https://fenrir-bridge.pages.dev/api/telegram/webhook",
  "https://www.myfenrir.com/api/telegram/webhook",
  "https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/telegram/webhook"
];

// If FENRIR_ADMIN_TOKEN is set, admin routes require it. If unset, the routes stay
// usable but constrained to read-only diagnostics and the idempotent canonical
// webhook sync below — neither exposes secrets nor allows arbitrary targets.
const adminAuthorized = (env, request) => {
  const configured = normalizeText(env.FENRIR_ADMIN_TOKEN);
  return !configured || request.headers.get(ADMIN_HEADER) === configured;
};

const CANONICAL_WEBHOOK_TARGET = "https://fenrir-bridge.pages.dev/api/telegram/webhook";

const maskId = (value) => {
  const s = String(value || "");
  return s.length <= 4 ? "…" : `${s.slice(0, 2)}…${s.slice(-2)}`;
};

async function telegramDiag(env, channel) {
  const token = botToken(env, channel);
  if (!token) return { configured: false };
  const call = async (method) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`);
    return response.json().catch(() => null);
  };
  const me = await call("getMe");
  const hook = await call("getWebhookInfo");
  return {
    configured: true,
    bot: me?.ok
      ? { id: me.result.id, username: me.result.username }
      : { error: me?.description || "getMe_failed" },
    webhook: hook?.ok
      ? {
          url: hook.result.url || "",
          pending_update_count: hook.result.pending_update_count,
          last_error_date: hook.result.last_error_date || null,
          last_error_message: hook.result.last_error_message || null
        }
      : { error: hook?.description || "getWebhookInfo_failed" }
  };
}

async function syncTelegramWebhook(env, channel, initialTargetUrl) {
  let targetUrl = initialTargetUrl;
  const token = botToken(env, channel);
  if (!token) return { ok: false, error: "missing_telegram_token" };
  const secret = normalizeText(env.TELEGRAM_WEBHOOK_SECRET);
  if (!secret) return { ok: false, error: "missing_webhook_secret" };
  if (!ALLOWED_WEBHOOK_TARGETS.some((allowed) => targetUrl.startsWith(allowed))) {
    return { ok: false, error: "target_not_allowed" };
  }
  if (channel === "dev" && !targetUrl.includes("bot=dev")) {
    targetUrl = `${targetUrl}?bot=dev`;
  }

  // The target must accept this worker's secret before Telegram is pointed at it,
  // otherwise every real update would bounce with a 401.
  const probe = await fetch(targetUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ update_id: 0 })
  });
  if (probe.status !== 200) return { ok: false, error: "target_probe_failed", probeStatus: probe.status };

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: targetUrl,
      secret_token: secret,
      allowed_updates: ["message", "pre_checkout_query", "callback_query"]
    })
  });
  const data = await response.json().catch(() => null);
  if (!data?.ok) return { ok: false, error: data?.description || "setWebhook_failed" };
  return { ok: true, url: targetUrl };
}

async function starsHealth(env) {
  const [orders, lastOrders, entitlements, linkCodes, identityLinks] = await Promise.all([
    env.DB.prepare(`SELECT status, COUNT(*) AS n FROM telegram_stars_orders GROUP BY status`).all(),
    env.DB.prepare(
      `SELECT telegram_user_id, status, amount, created_at, paid_at
       FROM telegram_stars_orders ORDER BY created_at DESC LIMIT 5`
    ).all(),
    env.DB.prepare(`SELECT status, COUNT(*) AS n FROM telegram_stars_entitlements GROUP BY status`).all(),
    env.DB.prepare(`SELECT status, COUNT(*) AS n FROM telegram_account_link_codes GROUP BY status`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM telegram_identity_links`).first()
  ]);
  const tally = (rows) => Object.fromEntries((rows.results || []).map((r) => [r.status, r.n]));
  return {
    ok: true,
    service: "fenrir-stars-payments",
    generated_at: nowIso(),
    orders: tally(orders),
    entitlements: tally(entitlements),
    link_codes: tally(linkCodes),
    identity_links: identityLinks?.n ?? 0,
    recent_orders: (lastOrders.results || []).map((r) => ({
      telegram_user_id: maskId(r.telegram_user_id),
      status: r.status,
      amount: r.amount,
      created_at: r.created_at,
      paid_at: r.paid_at || null
    }))
  };
}

function starsHealthHtml(health) {
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  const dict = (obj) =>
    Object.entries(obj).length
      ? Object.entries(obj)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : "none";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fenrir Stars Health</title>
<style>body{font-family:ui-monospace,monospace;background:#0b0e14;color:#e6e6e6;padding:24px}
table{border-collapse:collapse;margin-top:12px}td,th{border:1px solid #333;padding:6px 12px;text-align:left}
h1{font-size:18px}code{color:#7fd4ff}</style></head><body>
<h1>Fenrir Stars — Entitlement Pipeline Health</h1>
<p>Generated <code>${health.generated_at}</code></p>
<table>
<tr><th>Metric</th><th>Value</th></tr>
${row(["Orders by status", dict(health.orders)])}
${row(["Entitlements by status", dict(health.entitlements)])}
${row(["Link codes by status", dict(health.link_codes)])}
${row(["Identity links (claimed)", health.identity_links])}
</table>
<h1>Last 5 orders</h1>
<table><tr><th>User</th><th>Status</th><th>Stars</th><th>Created</th><th>Paid</th></tr>
${health.recent_orders.map((o) => row([o.telegram_user_id, o.status, o.amount, o.created_at, o.paid_at || "—"])).join("")}
</table></body></html>`;
}

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
  if (!payment.invoice_payload?.startsWith("fenrir_stars:")) {
    console.error("stars_webhook_rejected_foreign_payload", { payload: String(payment.invoice_payload || "").slice(0, 40) });
    return { ok: false, reason: "foreign_payload" };
  }
  if (!order) {
    console.error("stars_webhook_order_not_found", { payload: String(payment.invoice_payload || "").slice(0, 40) });
    return { ok: false, reason: "order_not_found" };
  }
  if (String(order.telegram_user_id) !== telegramUserId) {
    console.error("stars_webhook_payer_order_mismatch", { payer: telegramUserId, order: String(order.telegram_user_id) });
    return { ok: false, reason: "payer_mismatch" };
  }
  const replaySameCharge =
    order.status === "paid" && order.telegram_payment_charge_id === payment.telegram_payment_charge_id;
  if (order.status !== "pending" && !replaySameCharge) {
    console.error("stars_webhook_order_not_pending", { payload: order.payload, status: order.status });
    return { ok: false, reason: "order_not_pending" };
  }
  if (payment.currency !== "XTR" || payment.total_amount !== Number(order.amount)) {
    console.error("stars_webhook_amount_mismatch", {
      got: `${payment.total_amount} ${payment.currency}`,
      expected: `${order.amount} XTR`
    });
    return { ok: false, reason: "amount_mismatch" };
  }
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
  return { ok: true };
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
  await telegramApi(env, channel, 'sendVideo', {
    chat_id: message.chat.id,
    video: 'https://fenrir-bridge.pages.dev/assets/fenrir_bot_entry.mp4',
    caption: modularMenuText(message.text || '', entitlement),
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔵 Setup', callback_data: 'fenrir_setup' },
          { text: '🟢 Plans', callback_data: 'fenrir_plans' },
        ],
        [
          { text: '⭐️ Subscribe', callback_data: 'fenrir_subscribe' },
          { text: '🔴 Status', callback_data: 'fenrir_status' },
        ],
      ],
    },
  });
}

function fallbackMind(text, entitlement) {
  if (menuIntent(text)) return modularMenuText(text, entitlement);

  if (statusIntent(text)) {
    if (spanishIntent(text)) {
      return entitlement?.status === 'active'
        ? `🟢 𝗙𝗘𝗡𝗥𝗜𝗥 𝗔𝗖𝗧𝗜𝗩𝗢\n━━━━━━━━━━━━━━━━━━\nEl Protocolo Fenrir está operando.\n\n🔹 Acceso: Desbloqueado\n🔹 Stars: ${entitlement.stars_amount}\n\n📖 Wiki: wiki.myfenrir.com`
        : `🔴 𝗔𝗖𝗖𝗘𝗦𝗢 𝗗𝗘𝗡𝗘𝗚𝗔𝗗𝗢\n━━━━━━━━━━━━━━━━━━\nEl Protocolo requiere activación.\n\nUsa /subscribe para abrir la caja oficial de Telegram Stars.\n\n📖 Wiki: wiki.myfenrir.com`;
    }
    return entitlement?.status === 'active'
      ? `🟢 𝗙𝗘𝗡𝗥𝗜𝗥 𝗔𝗖𝗧𝗜𝗩𝗘\n━━━━━━━━━━━━━━━━━━\nFenrir Protocol is operating normally.\n\n🔹 Access: Unlocked\n🔹 Stars: ${entitlement.stars_amount}\n\n📖 Wiki: wiki.myfenrir.com`
      : `🔴 𝗔𝗖𝗖𝗘𝗦𝗦 𝗗𝗘𝗡𝗜𝗘𝗗\n━━━━━━━━━━━━━━━━━━\nFenrir Protocol requires activation.\n\nUse /subscribe to open the official Telegram Stars payment box.\n\n📖 Wiki: wiki.myfenrir.com`;
  }

  if (pricingIntent(text)) {
    return [
      '🟢 𝗙𝗘𝗡𝗥𝗜𝗥 𝗣𝗟𝗔𝗡𝗦',
      '━━━━━━━━━━━━━━━━━━',
      '⚪️ Free ($0): 1 Telegram Lock, 1 Subdomain',
      '🔵 Starter ($3/mo): 3 Locks, Subdomains',
      '🔴 Pro ($7/mo): 10 Locks, Custom Domain',
      '💎 Operator ($15/mo): Unlimited Locks, Audit Logs',
      '',
      '📖 Plan comparisons: wiki.myfenrir.com',
    ].join('\n');
  }

  if (stripeIntent(text)) {
    return [
      '🔵 𝗗𝗜𝗥𝗘𝗖𝗧 𝗕𝗜𝗟𝗟𝗜𝗡𝗚',
      '━━━━━━━━━━━━━━━━━━',
      'Gateway: Stripe Secure',
      'Status: Pending backend activation',
      '',
      'Stripe Direct Billing is the professional card and invoice route for Pro and Operator users.',
      '',
      'For now, I can open the official Telegram Stars payment box to instantly activate your tier.',
      '',
      '📖 Read more: wiki.myfenrir.com',
    ].join('\n');
  }

  if (setupIntent(text)) {
    if (spanishIntent(text)) {
      return [
        '🔵 𝗦𝗬𝗦𝗧𝗘𝗠 𝗦𝗘𝗧𝗨𝗣',
        '━━━━━━━━━━━━━━━━━━',
        'Para conectar tu dominio y grupos:',
        '1. Mapea DNS (CNAME join -> bridge.myfenrir.com)',
        '2. Agrega el bot Fenrir a tu grupo como Admin',
        '3. Genera un Bridge slug seguro',
        '',
        '📖 Guía completa: [wiki.myfenrir.com](https://wiki.myfenrir.com)',
      ].join('\n');
    }
    return [
      '🔵 𝗦𝗬𝗦𝗧𝗘𝗠 𝗦𝗘𝗧𝗨𝗣',
      '━━━━━━━━━━━━━━━━━━',
      'To securely link your domain and groups:',
      '1. Map DNS (CNAME join -> bridge.myfenrir.com)',
      '2. Add Fenrir bot to your Telegram group as Admin',
      '3. Generate a secure Bridge slug',
      '',
      '📖 Full setup guide: [wiki.myfenrir.com](https://wiki.myfenrir.com)',
    ].join('\n');
  }

  return modularMenuText(text, entitlement);
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
  if (!configuredSecret) {
    return json({ ok: false, error: "webhook_secret_not_configured" }, { status: 500 });
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== configuredSecret) {
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
      // Payer must be the human who tapped the button; callbackMessage.from is the bot itself.
      await sendStarsInvoice(env, channel, { chat: callbackMessage.chat, from: query.from });
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
    const result = await markPaid(env, payment, message, order);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: result.ok
        ? `Fenrir Protocol activated.\n\nAccess: active\nStars: ${payment.total_amount}\nPayment rail: Telegram Stars`
        : "We received a Stars payment signal that did not match an active Fenrir order, so access was not changed. It has been logged for review — run /subscribe if you need a fresh invoice."
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

    if (url.pathname === "/health/stars" && request.method === "GET") {
      if (!env.DB) return json({ ok: false, error: "db_not_configured" }, { status: 500 });
      const health = await starsHealth(env);
      if (url.searchParams.get("format") === "html" || (request.headers.get("accept") || "").includes("text/html")) {
        return new Response(starsHealthHtml(health), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return json(health);
    }

    if (url.pathname === "/api/admin/telegram/diagnostics" && request.method === "GET") {
      if (!adminAuthorized(env, request)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
      return json({ ok: true, prod: await telegramDiag(env, "prod"), dev: await telegramDiag(env, "dev") });
    }

    if (url.pathname === "/api/admin/telegram/sync-webhook" && request.method === "POST") {
      if (!adminAuthorized(env, request)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
      const body = await request.json().catch(() => ({}));
      const channel = body.channel === "dev" ? "dev" : "prod";
      const requested = normalizeText(body.target_url);
      // Without an admin token only the canonical target is accepted, so the worst
      // an unauthenticated caller can do is enforce the correct configuration.
      const targetUrl = normalizeText(env.FENRIR_ADMIN_TOKEN) ? requested || CANONICAL_WEBHOOK_TARGET : CANONICAL_WEBHOOK_TARGET;
      const current = (await telegramDiag(env, channel)).webhook;
      if (current?.url === `${targetUrl}?bot=${channel}` || current?.url === targetUrl) {
        return json({ ok: true, unchanged: true, webhook: current });
      }
      const result = await syncTelegramWebhook(env, channel, targetUrl);
      if (!result.ok) return json(result, { status: 422 });
      return json({ ...result, webhook: (await telegramDiag(env, channel)).webhook });
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
