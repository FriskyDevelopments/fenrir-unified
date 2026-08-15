const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) }
  });

const nowIso = () => new Date().toISOString();

const starsPrice = (env) => {
  const parsed = Number.parseInt(env.FENRIR_STARS_PRICE || "1150", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1150;
};

const botUsername = (env) => (env.FENRIR_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();

const botToken = (env, channel) => {
  if (channel === "dev") return (env.TELEGRAM_DEV_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "").trim();
  return (env.TELEGRAM_PROD_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || "").trim();
};

function billingRequestAuthorized(request, env) {
  const configured = normalizeText(env.COMMUNITY_BRIDGE_BILLING_SECRET);
  const supplied = normalizeText(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  return Boolean(configured && supplied && configured === supplied);
}

export function isValidFoundersStripeSession(session, userId, orgId) {
  const billingPeriod = session?.metadata?.billing_period;
  const expectedAmount = billingPeriod === "annual" ? 14990 : 1499;
  return Boolean(
    session?.payment_status === "paid" &&
      session?.mode === "subscription" &&
      session?.client_reference_id === orgId &&
      session?.metadata?.frisky_org_id === orgId &&
      session?.metadata?.frisky_user_id === userId &&
      session?.metadata?.plan === "standard" &&
      session?.currency === "usd" &&
      session?.amount_total === expectedAmount &&
      session?.metadata?.offer === "founder_forever" &&
      (billingPeriod === "monthly" || billingPeriod === "annual") &&
      normalizeText(session?.subscription)
  );
}

export function isValidStarsPayment(payment, order, telegramUserId) {
  return Boolean(
    payment?.invoice_payload?.startsWith("fenrir_stars:") &&
      order &&
      order.status === "pending" &&
      String(order.telegram_user_id) === String(telegramUserId) &&
      payment.currency === "XTR" &&
      payment.total_amount === Number(order.amount)
  );
}

async function stripeRequest(env, path, params) {
  const key = normalizeText(env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("stripe_not_configured");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {})
    },
    body: params ? new URLSearchParams(params) : undefined
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`stripe_${response.status}:${body?.error?.code || "request_failed"}`);
  return body;
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortDeep(value[key]);
    return result;
  }, {});
}

async function verifyNowPaymentsIpn(request, env, body) {
  const secret = normalizeText(env.NOWPAYMENTS_IPN_SECRET);
  const supplied = normalizeText(request.headers.get("x-nowpayments-sig")).toLowerCase();
  if (!secret || !supplied) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(sortDeep(body))));
  const expected = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return expected.length === supplied.length && expected.split("").every((char, index) => char === supplied[index]);
}

async function handleFoundersNowPaymentsCheckout(request, env) {
  if (!billingRequestAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
  const apiKey = normalizeText(env.NOWPAYMENTS_API_KEY);
  if (!apiKey || !normalizeText(env.NOWPAYMENTS_IPN_SECRET)) throw new Error("nowpayments_not_configured");
  const body = await request.json().catch(() => null);
  const userId = normalizeText(body?.userId);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ ok: false, error: "invalid_identity" }, { status: 400 });
  const orderId = `mf-${userId}-${Date.now()}`;
  const response = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      price_amount: 15,
      price_currency: "usd",
      order_id: orderId,
      order_description: "MyFenrir Standard · Founders Deal · 5 Gates",
      ipn_callback_url: "https://fenrir-stars-payments.hrgrrtks2p.workers.dev/api/nowpayments/ipn",
      success_url: "https://communities.myfenrir.com/upgrade?nowpayments=processing",
      cancel_url: "https://communities.myfenrir.com/upgrade?nowpayments=cancel",
      partially_paid_url: "https://communities.myfenrir.com/upgrade?nowpayments=partial",
      is_fixed_rate: true,
      is_fee_paid_by_user: false
    })
  });
  const invoice = await response.json().catch(() => null);
  if (!response.ok || !invoice?.invoice_url) throw new Error(`nowpayments_${response.status}`);
  return json({ ok: true, url: invoice.invoice_url });
}

async function handleNowPaymentsIpn(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !(await verifyNowPaymentsIpn(request, env, body))) return json({ ok: false, error: "invalid_signature" }, { status: 401 });
  if (!new Set(["finished", "confirmed"]).has(normalizeText(body.payment_status).toLowerCase())) return json({ ok: true, activated: false });
  const match = /^mf-([0-9a-f-]{36})-\d+$/i.exec(normalizeText(body.order_id));
  if (
    !match ||
    normalizeText(body.price_currency).toLowerCase() !== "usd" ||
    Math.abs(Number(body.price_amount) - 15) > 0.000001
  ) {
    return json({ ok: false, error: "invalid_order" }, { status: 400 });
  }
  const userId = match[1];
  const paymentId = normalizeText(String(body.payment_id || body.invoice_id || ""));
  if (!paymentId) return json({ ok: false, error: "missing_payment_id" }, { status: 400 });
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO billing_subscriptions (
      stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
      current_period_end, cancel_at_period_end, created_at, updated_at
    ) VALUES (?, ?, ?, 'standard', 'active', NULL, 0, ?, ?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET
      frisky_org_id = excluded.frisky_org_id,
      plan = 'standard',
      status = 'active',
      updated_at = excluded.updated_at`
  ).bind(`nowpayments:${paymentId}`, userId, `nowpayments_${paymentId}`, ts, ts).run();
  return json({ ok: true, activated: true });
}

async function handleFoundersCheckout(request, env) {
  if (!billingRequestAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const userId = normalizeText(body?.userId);
  const orgId = normalizeText(body?.orgId);
  const email = normalizeText(body?.email).toLowerCase();
  const billingPeriod = body?.billingPeriod === "annual" ? "annual" : "monthly";
  const priceId = billingPeriod === "annual"
    ? "price_1U4bO5LxUF54S071qvkmFT0V"
    : "price_1U45nNLxUF54S071oRPYXOec";
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(orgId) || !email.includes("@")) {
    return json({ ok: false, error: "invalid_identity" }, { status: 400 });
  }
  const successUrl = "https://communities.myfenrir.com/upgrade?stripe=success&session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = "https://communities.myfenrir.com/upgrade?stripe=cancel";
  const session = await stripeRequest(env, "/checkout/sessions", {
    mode: "subscription",
    customer_email: email,
    client_reference_id: orgId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price]": priceId,
    "metadata[frisky_user_id]": userId,
    "metadata[frisky_org_id]": orgId,
    "metadata[plan]": "standard",
    "metadata[offer]": "founder_forever",
    "metadata[billing_period]": billingPeriod,
    "subscription_data[metadata][frisky_user_id]": userId,
    "subscription_data[metadata][frisky_org_id]": orgId,
    "subscription_data[metadata][plan]": "standard",
    "subscription_data[metadata][offer]": "founder_forever"
  });
  if (!session?.url || !session?.id) throw new Error("stripe_checkout_missing_url");
  return json({ ok: true, url: session.url, sessionId: session.id });
}

async function handleFoundersConfirm(request, env) {
  if (!billingRequestAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const sessionId = normalizeText(body?.sessionId);
  const userId = normalizeText(body?.userId);
  const orgId = normalizeText(body?.orgId);
  if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) return json({ ok: false, error: "invalid_session" }, { status: 400 });
  const session = await stripeRequest(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  const valid = isValidFoundersStripeSession(session, userId, orgId);
  if (!valid) return json({ ok: false, error: "payment_not_confirmed" }, { status: 409 });
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO billing_subscriptions (
      stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
      current_period_end, cancel_at_period_end, created_at, updated_at
    ) VALUES (?, ?, ?, 'standard', 'active', NULL, 0, ?, ?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET
      frisky_org_id = excluded.frisky_org_id,
      plan = 'standard',
      status = 'active',
      updated_at = excluded.updated_at`
  ).bind(normalizeText(session.subscription), orgId, normalizeText(session.customer) || `checkout_${session.id}`, ts, ts).run();
  return json({ ok: true, plan: "standard", status: "active" });
}

async function handleCommunityBillingStatus(request, env) {
  if (!billingRequestAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const userId = normalizeText(body?.userId);
  const telegramUserId = normalizeText(body?.telegramUserId);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ ok: false, error: "invalid_identity" }, { status: 400 });

  if (/^\d{5,20}$/.test(telegramUserId)) {
    const [entitlement, identityLink] = await Promise.all([
      getEntitlement(env, telegramUserId),
      env.DB.prepare(
        `SELECT frisky_user_id, frisky_org_id
         FROM telegram_identity_links
         WHERE telegram_user_id = ?
         LIMIT 1`
      ).bind(telegramUserId).first()
    ]);
    const identityMatches =
      identityLink?.frisky_user_id === userId && identityLink?.frisky_org_id === userId;
    if (entitlement?.status === "active" && identityMatches) {
      const ts = nowIso();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO billing_subscriptions (
            stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
            current_period_end, cancel_at_period_end, created_at, updated_at
          ) VALUES (?, ?, ?, 'standard', 'active', NULL, 0, ?, ?)
          ON CONFLICT(stripe_subscription_id) DO UPDATE SET
            frisky_org_id = excluded.frisky_org_id, status = 'active', plan = 'standard', updated_at = excluded.updated_at`
        ).bind(`stars:${telegramUserId}`, userId, `stars_${telegramUserId}`, ts, ts),
        env.DB.prepare(
          `UPDATE telegram_stars_entitlements SET frisky_org_id = ?, frisky_user_id = ?, plan = 'standard', updated_at = ? WHERE telegram_user_id = ?`
        ).bind(userId, userId, ts, telegramUserId)
      ]);
    }
  }

  const subscription = await env.DB.prepare(
    `SELECT plan, status FROM billing_subscriptions
     WHERE frisky_org_id = ? AND status IN ('active','trialing','past_due')
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(userId).first();
  return json({
    ok: true,
    paid: Boolean(subscription),
    plan: subscription?.plan || "free",
    status: subscription?.status || null
  });
}

const normalizeText = (value) => (value || "").trim();
const BRIDGE_TARGET = "bridge.myfenrir.com";
// Account linking is owned by Fenrir Bridge. Community Bridge's /activate
// screen previously asked for a six-character code that this bot never minted.
const MYFENRIR_APP_URL = "https://www.myfenrir.com/gate/miniapp";
const MYFENRIR_FRONTEND_URL = "https://fenrir-bridge.pages.dev/gate/app";
const BOT_OS_WELCOME_VIDEO_URL = "https://www.myfenrir.com/bot-os/media/fenrir-welcome.mp4";
// Approved no-audio celebration clip for a successful Telegram-identity link.
// Sent via sendAnimation (autoplay GIF). Reuses an existing approved bot-os clip.
const BOT_OS_LINK_SUCCESS_ANIM_URL = "https://www.myfenrir.com/bot-os/media/fenrir-access.mp4";
const LINK_SUCCESS_CAPTION = [
  "🐺 *Linked in.* Your Telegram is now bound to your Frisky ID.",
  "",
  "Fenrir can connect this account to your workspace — you're clear to run the pack.",
  "",
  "Next: open MyFenrir to finish setup."
].join("\n");

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
  "If user asks to pay: Stripe is the primary US$14.99/month card route at https://communities.myfenrir.com/upgrade. Telegram Stars at 1,150 Stars is the in-bot alternative.",
  "Do not ask for card details. Do not pretend payment is complete.",
  "STATUS BEHAVIOR:",
  "If user asks status/access/active/paid/subscription/entitlement: use backend entitlement_status. If active, say Fenrir Protocol is active. If inactive, say access is not active yet and invite them to subscribe.",
  "SETUP BEHAVIOR:",
  "Setup path: choose Fenrir subdomain or custom domain; add Fenrir bot to Telegram group; make bot admin; allow create/revoke invite links; create bridge slug; share stable public URL; rotate/revoke raw Telegram invites when needed.",
  "DNS WIZARD:",
  "TXT: Type TXT, Name _fenrir, Value fenrir-verify=<token>, TTL Auto, Purpose proves domain ownership.",
  `CNAME: Type CNAME, Name join, Value ${BRIDGE_TARGET}, TTL Auto, Purpose routes the customer subdomain to Fenrir.`,
  "PACKS:",
  "Unpaid: no new Gates. Membership is required from Gate 1.",
  "Standard Founders Deal: US$14.99/month by Stripe or 1,150 Telegram Stars; 5 Gates in one active community.",
  "Owner: 20 Gates across multiple communities; assigned only to authorized owners.",
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

async function applyStarsMembership(env, telegramUserId) {
  const [link, entitlement] = await Promise.all([
    env.DB.prepare(
      `SELECT frisky_org_id, frisky_user_id FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
    ).bind(String(telegramUserId)).first(),
    env.DB.prepare(
      `SELECT telegram_user_id, status, stars_amount, payload, telegram_payment_charge_id
       FROM telegram_stars_entitlements WHERE telegram_user_id = ? AND status = 'active' LIMIT 1`
    ).bind(String(telegramUserId)).first()
  ]);
  if (!link || !entitlement) return { applied: false, reason: "telegram_not_linked" };

  const plan = normalizeText(env.FENRIR_STARS_PLAN).toLowerCase() || "standard";
  const safePlan = plan === "pro" || plan === "operator" ? plan : "standard";
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO billing_subscriptions (
        stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
        current_period_end, cancel_at_period_end, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', NULL, 0, ?, ?)
      ON CONFLICT(stripe_subscription_id) DO UPDATE SET
        frisky_org_id = excluded.frisky_org_id,
        stripe_customer_id = excluded.stripe_customer_id,
        plan = excluded.plan,
        status = 'active',
        current_period_end = NULL,
        cancel_at_period_end = 0,
        updated_at = excluded.updated_at`
    ).bind(`stars:${telegramUserId}`, link.frisky_org_id, `stars_${telegramUserId}`, safePlan, ts, ts),
    env.DB.prepare(
      `UPDATE telegram_stars_entitlements
       SET frisky_org_id = ?, frisky_user_id = ?, plan = ?, updated_at = ?
       WHERE telegram_user_id = ?`
    ).bind(link.frisky_org_id, link.frisky_user_id, safePlan, ts, String(telegramUserId))
  ]);
  return { applied: true, plan: safePlan };
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
  await applyStarsMembership(env, telegramUserId);
  return { ok: true, friskyUserId: pending.frisky_user_id, friskyOrgId: pending.frisky_org_id };
}

async function notifyLinkConfirm(env, payload) {
  const url = (env.FENRIR_LINK_CONFIRM_URL || "").trim();
  const secret = (env.TELEGRAM_LINK_CONFIRM_SECRET || "").trim();
  if (!url || !secret) return;
  const body = JSON.stringify(payload);
  const signature = await hmacHex(secret, body);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fenrir-link-signature": signature },
    body
  });
  if (!response.ok) throw new Error(`confirm_${response.status}`);
}

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function linkCodeFromStart(text) {
  const match = text.match(/^\/start\s+link_([a-z0-9_-]{8,64})$/i);
  return match?.[1] || "";
}

function maskEmail(email) {
  const [local, domain] = normalizeText(email).split("@");
  if (!local || !domain) return "MyFenrir account";
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

async function sendIdentityWelcome(env, channel, message) {
  const telegramUserId = String(message.from?.id || message.chat.id);
  const linked = await env.DB.prepare(
    `SELECT email FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
  ).bind(telegramUserId).first();
  const name = normalizeText(message.from?.first_name) || "there";

  if (linked) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: [
        `🐺 Welcome, ${name}.`,
        "",
        "✅ Account linked with Frisky Dev",
        `MyFenrir account · ${maskEmail(linked.email)}`,
        "",
        "Your verified Telegram identity is ready for Community Gates.",
        "",
        "Tap Confirm access in MyFenrir below to finish setup."
      ].join("\n"),
      reply_markup: { inline_keyboard: [[{ text: "Confirm access in MyFenrir", web_app: { url: MYFENRIR_APP_URL } }]] }
    });
    return;
  }

  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      `🐺 Welcome, ${name}.`,
      "",
      "Your Telegram identity is not linked yet.",
      "Open MyFenrir and choose Link Telegram securely. Return through the generated one-time link to confirm this account."
    ].join("\n"),
    reply_markup: { inline_keyboard: [[{ text: "Link with MyFenrir", web_app: { url: MYFENRIR_APP_URL } }]] }
  });
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
    title: env.FENRIR_STARS_TITLE || "MyFenrir Standard Pack · Founders Deal",
    description:
      env.FENRIR_STARS_DESCRIPTION ||
      "Activate Standard membership: 5 Gates for one active community. Card alternative: $15 USD.",
    payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: env.FENRIR_STARS_LABEL || "Standard Pack", amount }],
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

function commandForThisBot(text, command, env) {
  const match = text.match(new RegExp(`^/${command}(?:@([A-Za-z0-9_]+))?(?:\\s|$)`, "i"));
  if (!match) return false;
  const target = normalizeText(match[1]).toLowerCase();
  return !target || target === botUsername(env).toLowerCase();
}

async function sendTelegramLinkStart(env, channel, message) {
  if (message.chat?.type && message.chat.type !== "private") {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: "For security, send /link to me in a private chat."
    });
    return;
  }

  const menuButton = {
    type: "web_app",
    text: "Open MyFenrir",
    web_app: { url: MYFENRIR_APP_URL }
  };
  try {
    await telegramApi(env, channel, "setChatMenuButton", { menu_button: menuButton });
  } catch (error) {
    console.error("telegram_menu_button_failed", String(error));
  }
  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      "MyFenrir account linking",
      "",
      "1. Open MyFenrir and sign in.",
      "2. In your dashboard, tap Link Telegram ID.",
      "3. Telegram opens automatically to confirm — there is no code to copy.",
      "",
      "The Open MyFenrir Mini App button is now enabled in this chat."
    ].join("\n"),
    reply_markup: {
      inline_keyboard: [[{ text: "Open MyFenrir", web_app: { url: MYFENRIR_APP_URL } }]]
    }
  });
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
  const payload = {
    chat_id: message.chat.id,
    caption: modularMenuText(message.text || "", entitlement),
    video: BOT_OS_WELCOME_VIDEO_URL,
    supports_streaming: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "MOD 01 · Setup", callback_data: "fenrir_setup" },
          { text: "MOD 02 · Plans", callback_data: "fenrir_plans" }
        ],
        [
          { text: "MOD 03 · Stars", callback_data: "fenrir_subscribe" },
          { text: "MOD 04 · Status", callback_data: "fenrir_status" }
        ]
      ]
    }
  };
  try {
    await telegramApi(env, channel, "sendVideo", payload);
  } catch (error) {
    console.error("bot_os_welcome_video_failed", String(error));
    await telegramApi(env, channel, "sendMessage", {
      chat_id: payload.chat_id,
      text: payload.caption,
      reply_markup: payload.reply_markup
    });
  }
}

// Celebratory render for a successful Telegram-identity link: an approved
// no-audio clip autoplayed as a GIF via sendAnimation, with the upgraded copy
// and an "Open MyFenrir" CTA. Falls back to a plain message if the animation
// cannot be delivered (mirrors the sendBotMenu fallback pattern).
async function sendLinkLinkedAnimation(env, channel, message) {
  const reply_markup = {
    inline_keyboard: [[{ text: "Confirm access in MyFenrir →", web_app: { url: MYFENRIR_APP_URL } }]]
  };
  try {
    await telegramApi(env, channel, "sendAnimation", {
      chat_id: message.chat.id,
      animation: BOT_OS_LINK_SUCCESS_ANIM_URL,
      caption: LINK_SUCCESS_CAPTION,
      parse_mode: "Markdown",
      reply_markup
    });
  } catch (error) {
    console.error("link_success_animation_failed", String(error));
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: "🐺 Linked in. Your Telegram is now bound to your Frisky ID. Fenrir can connect this account to your workspace — open MyFenrir to finish setup.",
      reply_markup
    });
  }
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
      "MYFENRIR | Community Packs",
      "",
      "Standard Founders Deal — $15 USD by Stripe or 1,150 Telegram Stars.",
      "Includes 5 Gates for one active community.",
      "Membership is required from Gate 1.",
      "",
      "Owner profiles receive 20 Gates across multiple communities."
    ].join("\n");
  }

  if (stripeIntent(text)) {
    return [
      "MYFENRIR | Secure checkout",
      "Primary gateway: Stripe",
      "Price: $15 USD",
      "",
      "Open https://communities.myfenrir.com/upgrade to pay by card.",
      "Or use /subscribe for the 1,150 Stars in-bot alternative.",
      "Fenrir activates Standard only after the selected payment provider confirms payment."
    ].join("\n");
  }

  if (setupIntent(text)) {
    if (spanishIntent(text)) {
      return [
        "Si. Fenrir te da un link stable y dejas de compartir invitaciones crudas de Telegram.",
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
  // Config problems on OUR side must never answer non-200, or Telegram retries the
  // same update forever and the bot re-sends the same reply (the spam loop).
  if (!env.DB) { console.error("stars_webhook_db_not_configured"); return json({ ok: true }); }
  const channel = url.searchParams.get("bot") === "dev" ? "dev" : "prod";
  if (!botToken(env, channel)) { console.error("stars_webhook_missing_token"); return json({ ok: true }); }

  const configuredSecret = normalizeText(env.TELEGRAM_WEBHOOK_SECRET);
  if (configuredSecret && request.headers.get("x-telegram-bot-api-secret-token") !== configuredSecret) {
    // Reject WITHOUT processing, but answer 200 — a returned 401 would make
    // Telegram retry the same update, re-triggering the spam loop on any secret drift.
    console.error("stars_webhook_bad_secret");
    return json({ ok: true });
  }

  const update = await request.json().catch(() => null);
  if (!update) { console.error("stars_webhook_invalid_update"); return json({ ok: true }); }

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
    const telegramUserId = String(message.from?.id || message.chat.id);
    const valid = isValidStarsPayment(payment, order, telegramUserId);
    if (!valid) {
      console.error("stars_payment_validation_failed", telegramUserId);
      await telegramApi(env, channel, "sendMessage", {
        chat_id: message.chat.id,
        text: "This payment did not match an active MyFenrir invoice. Membership was not changed. Run /subscribe for a fresh invoice."
      });
      return json({ ok: true });
    }
    await markPaid(env, payment, message, order);
    const membership = await applyStarsMembership(env, telegramUserId);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: membership.applied
        ? `MyFenrir Standard Pack activated.\n\nAccess: active\nGates: 5\nActive communities: 1\nStars: ${payment.total_amount}\nPayment rail: Telegram Stars`
        : `Stars payment confirmed.\n\nStars: ${payment.total_amount}\nNext: open MyFenrir → Settings → Link Telegram. Standard will activate automatically after linking.`
    });
    return json({ ok: true });
  }

  const text = normalizeText(message?.text);
  if (!text) return json({ ok: true });

  const entitlement = await getEntitlement(env, message.from?.id || message.chat.id);

  if (/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+gate)?$/i.test(text)) {
    await sendIdentityWelcome(env, channel, message);
    return json({ ok: true });
  }

  if (commandForThisBot(text, "link", env)) {
    await sendTelegramLinkStart(env, channel, message);
    return json({ ok: true });
  }

  const linkCode = linkCodeFromStart(text);
  if (linkCode) {
    const result = await consumeTelegramLinkCode(env, linkCode, message);
    if (result.ok) {
      await notifyLinkConfirm(env, {
        code: linkCode,
        telegramId: String(message.from?.id || message.chat.id),
        telegramUsername: message.from?.username || null,
        telegramFirstName: message.from?.first_name || null
      }).catch((error) => console.error("link_confirm_failed", String(error)));
      await sendLinkLinkedAnimation(env, channel, message);
    } else {
      await telegramApi(env, channel, "sendMessage", {
        chat_id: message.chat.id,
        text: "This Fenrir link code is expired or invalid. Open MyFenrir and generate a fresh Telegram link."
      });
    }
    return json({ ok: true });
  }

  if (menuIntent(text)) {
    await sendBotMenu(env, channel, message, entitlement);
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

  if (setupIntent(text)) {
    const answer = fallbackMind(text, entitlement);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: answer
    });
    return json({ ok: true });
  }

  if (pricingIntent(text)) {
    const answer = fallbackMind(text, entitlement);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: answer
    });
    return json({ ok: true });
  }

  if (statusIntent(text)) {
    const answer = fallbackMind(text, entitlement);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: answer
    });
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

    if (url.pathname === "/api/telegram/bot-health" && request.method === "GET") {
      try {
        const me = await telegramApi(env, "prod", "getMe", {});
        let webhook = await telegramApi(env, "prod", "getWebhookInfo", {});
        const canonicalWebhook = `${url.origin}/api/telegram/webhook?bot=prod`;
        const registeredWebhook = normalizeText(webhook.result?.url);
        if (registeredWebhook !== canonicalWebhook) {
          const webhookSecret = normalizeText(env.TELEGRAM_WEBHOOK_SECRET);
          if (!webhookSecret) throw new Error("telegram_webhook_secret_missing");
          await telegramApi(env, "prod", "setWebhook", {
            url: canonicalWebhook,
            secret_token: webhookSecret,
            allowed_updates: ["message", "pre_checkout_query"]
          });
          webhook = await telegramApi(env, "prod", "getWebhookInfo", {});
        }
        // Keep Telegram's global/default menu aligned with the canonical
        // account-linking surface. This is idempotent and repairs BotFather or
        // dashboard drift whenever the health monitor runs.
        await telegramApi(env, "prod", "setChatMenuButton", {
          menu_button: {
            type: "web_app",
            text: "Open MyFenrir",
            web_app: { url: MYFENRIR_APP_URL }
          }
        });
        const menu = await telegramApi(env, "prod", "getChatMenuButton", {});
        const registered = normalizeText(webhook.result?.url);
        const registeredUrl = registered ? new URL(registered) : null;
        return json({
          ok: true,
          username: me.result?.username || null,
          webhook: registeredUrl ? `${registeredUrl.origin}${registeredUrl.pathname}` : null,
          pending: webhook.result?.pending_update_count ?? 0,
          lastError: webhook.result?.last_error_message || null,
          menuButton: menu.result || null
        });
      } catch {
        return json({ ok: false, error: "telegram_bot_auth_failed" }, { status: 503 });
      }
    }

    if (url.pathname === "/api/internal/founders-checkout" && request.method === "POST") {
      try { return await handleFoundersCheckout(request, env); }
      catch (error) { console.error("founders_checkout_failed", String(error)); return json({ ok: false, error: "stripe_checkout_failed" }, { status: 502 }); }
    }
    if (url.pathname === "/api/internal/billing-options" && request.method === "POST") {
      if (!billingRequestAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
      return json({
        ok: true,
        stripe: Boolean(normalizeText(env.STRIPE_SECRET_KEY)),
        nowpayments: Boolean(normalizeText(env.NOWPAYMENTS_API_KEY) && normalizeText(env.NOWPAYMENTS_IPN_SECRET)),
        stars: Boolean(botToken(env, "prod"))
      });
    }
    if (url.pathname === "/api/internal/founders-nowpayments-checkout" && request.method === "POST") {
      try { return await handleFoundersNowPaymentsCheckout(request, env); }
      catch (error) { console.error("founders_nowpayments_checkout_failed", String(error)); return json({ ok: false, error: "nowpayments_checkout_failed" }, { status: 502 }); }
    }
    if (url.pathname === "/api/nowpayments/ipn" && request.method === "POST") {
      try { return await handleNowPaymentsIpn(request, env); }
      catch (error) { console.error("nowpayments_ipn_failed", String(error)); return json({ ok: false, error: "ipn_failed" }, { status: 500 }); }
    }
    if (url.pathname === "/api/internal/founders-confirm" && request.method === "POST") {
      try { return await handleFoundersConfirm(request, env); }
      catch (error) { console.error("founders_confirm_failed", String(error)); return json({ ok: false, error: "stripe_confirmation_failed" }, { status: 502 }); }
    }
    if (url.pathname === "/api/internal/community-billing-status" && request.method === "POST") {
      try { return await handleCommunityBillingStatus(request, env); }
      catch (error) { console.error("community_billing_status_failed", String(error)); return json({ ok: false, error: "billing_status_failed" }, { status: 502 }); }
    }

    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      // KILL SWITCH: BOT_SILENCE=1 → accept every update with 200 and send nothing
      // (halts a runaway spam loop instantly). Then ALWAYS 200: any thrown error
      // must not surface as 500, or Telegram retries the same update → the bot
      // re-sends the same reply repeatedly. Catch everything and 200.
      if (normalizeText(env.BOT_SILENCE) === "1") {
        return json({ ok: true });
      }
      try {
        return await handleTelegramWebhook(request, env, url);
      } catch (err) {
        console.error("stars_webhook_unhandled_error", String((err && err.stack) || err));
        return json({ ok: true });
      }
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

    // Telegram Mini App links must open the app shell, not the worker health response.
    if ((url.pathname === "/" || url.pathname === "/app" || url.pathname === "/gate/app") && request.method === "GET") {
      return Response.redirect(MYFENRIR_FRONTEND_URL, 302);
    }

    return json({ ok: true, service: "fenrir-stars-payments" });
  }
};
