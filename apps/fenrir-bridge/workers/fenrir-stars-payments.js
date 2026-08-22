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
  // Canon: $14.99/month = 1499 (confirmado por Francisco). No es 1500.
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

// Real readiness: STRIPE_SECRET_KEY being *present* is not the same as *valid*
// (a stale/placeholder key returns HTTP 401 → the /upgrade Stripe button would
// 502). Probe the live price with the actual key and cache for 60s so the
// frontend only shows the card path when Stripe genuinely works, and lights it
// up automatically the moment a correct live key is set — no redeploy needed.
// Live Pack price IDs are the default, but stay overridable per environment so
// the checkout + webhook path can be exercised end-to-end against a Stripe
// sandbox without pointing anything at real money.
// Canon: The Pack is $14.99/month → price_1U45nN…. price_1U44co… ($15.00) and
// price_1U45nI… ($19.99) exist on the same product but are NOT the price.
const LIVE_FOUNDERS_MONTHLY_PRICE = "price_1U45nNLxUF54S071oRPYXOec";
const LIVE_FOUNDERS_ANNUAL_PRICE = "price_1U4bO5LxUF54S071qvkmFT0V";
const NOWPAYMENTS_PACK_PRICE_USD = 14.99;

/**
 * Crypto ladder. Crypto is the only rail that can carry more than two periods:
 * each payment is a one-shot invoice, so there is no subscription clock.
 * The invoice amount AND the granted duration both come from this table — the
 * IPN must never infer one from the other.
 */
const NOWPAYMENTS_LADDER = {
  monthly: { amount: 14.99, days: 30, label: "1 month" },
  quarter: { amount: 39.99, days: 91, label: "3 months" },
  half: { amount: 74.99, days: 182, label: "6 months" },
  annual: { amount: 149.0, days: 365, label: "1 year" }
};
export function foundersPriceId(env, billingPeriod) {
  return billingPeriod === "annual"
    ? normalizeText(env?.STRIPE_PACK_ANNUAL_PRICE_ID) || LIVE_FOUNDERS_ANNUAL_PRICE
    : normalizeText(env?.STRIPE_PACK_MONTHLY_PRICE_ID) || LIVE_FOUNDERS_MONTHLY_PRICE;
}

/** "live" | "test" | "absent" | "unknown" — the mode only, never the key. */
function stripeKeyMode(env) {
  const key = normalizeText(env?.STRIPE_SECRET_KEY);
  if (!key) return "absent";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return "unknown";
}

let _stripeReadyCache = { ok: false, at: 0 };
async function stripeReady(env) {
  if (!normalizeText(env.STRIPE_SECRET_KEY)) return false;
  const now = Date.now();
  if (now - _stripeReadyCache.at < 60000) return _stripeReadyCache.ok;
  try {
    await stripeRequest(env, `/prices/${foundersPriceId(env, "monthly")}`);
    _stripeReadyCache = { ok: true, at: now };
  } catch (error) {
    console.error("stripe_readiness_failed", String(error));
    _stripeReadyCache = { ok: false, at: now };
  }
  return _stripeReadyCache.ok;
}

// Stripe webhook signature verification (t=timestamp,v1=HMAC-SHA256 of `t.body`).
// Constant-time compare + 5-minute tolerance against replay.
async function verifyStripeSignature(env, payload, sigHeader) {
  const secret = normalizeText(env.STRIPE_WEBHOOK_SECRET);
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// Durable completion path (preferred). checkout.session.completed →
// validate the session server-side → upsert billing_subscriptions active.
// Idempotent via stripe_events + ON CONFLICT on the subscription id, so it is
// safe alongside the confirm-on-return backup and Stripe's own retries.
async function handleStripeWebhook(request, env) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!(await verifyStripeSignature(env, payload, sig))) {
    return json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }
  const event = JSON.parse(payload);
  const eventId = normalizeText(event?.id);
  if (eventId) {
    const seen = await env.DB.prepare(`SELECT id FROM stripe_events WHERE id = ?`).bind(eventId).first();
    if (seen) return json({ ok: true, duplicate: true });
    await env.DB.prepare(
      `INSERT INTO stripe_events (id, received_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING`
    ).bind(eventId, nowIso()).run();
  }
  if (event?.type === "checkout.session.completed" || event?.type === "checkout.session.async_payment_succeeded") {
    const session = event.data?.object;
    const userId = normalizeText(session?.metadata?.frisky_user_id);
    const orgId = normalizeText(session?.metadata?.frisky_org_id);
    if (isValidFoundersStripeSession(session, userId, orgId)) {
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
      ).bind(
        normalizeText(session.subscription),
        orgId,
        normalizeText(session.customer) || `checkout_${session.id}`,
        ts,
        ts
      ).run();
      // Referral attribution (Stripe/web rail): reward the referrer if this paid
      // checkout carried a ref_code. Idempotent + self-referral blocked.
      await recordStripeReferral(env, normalizeText(session?.metadata?.ref_code), orgId);
    }
  }
  return json({ ok: true });
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
  const period = NOWPAYMENTS_LADDER[normalizeText(body?.billingPeriod)] ? normalizeText(body.billingPeriod) : "monthly";
  const tier = NOWPAYMENTS_LADDER[period];
  // El periodo viaja en el order_id porque el IPN es la única fuente que lo verá.
  const orderId = `mf-${userId}-${period}-${Date.now()}`;
  const response = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      price_amount: tier.amount,
      price_currency: "usd",
      order_id: orderId,
      order_description: `The Pack · MyFenrir · ${tier.label} · $${tier.amount.toFixed(2)}`,
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
  // El segmento de periodo es opcional: las facturas viejas (`mf-<uuid>-<ts>`) son mensuales.
  const match = /^mf-([0-9a-f-]{36})-(?:(monthly|quarter|half|annual)-)?\d+$/i.exec(normalizeText(body.order_id));
  const period = match ? (match[2] || "monthly").toLowerCase() : null;
  const tier = period ? NOWPAYMENTS_LADDER[period] : null;
  if (
    !match ||
    !tier ||
    normalizeText(body.price_currency).toLowerCase() !== "usd" ||
    Number(body.price_amount) !== tier.amount
  ) {
    return json({ ok: false, error: "invalid_order" }, { status: 400 });
  }
  const userId = match[1];
  // Sin esto el acceso de cripto no vencía nunca: se pagaba un mes y quedaba de por vida.
  const periodEnd = new Date(Date.now() + tier.days * 86400000).toISOString();
  const paymentId = normalizeText(String(body.payment_id || body.invoice_id || ""));
  if (!paymentId) return json({ ok: false, error: "missing_payment_id" }, { status: 400 });
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO billing_subscriptions (
      stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
      current_period_end, cancel_at_period_end, created_at, updated_at
    ) VALUES (?, ?, ?, 'standard', 'active', ?, 0, ?, ?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET
      frisky_org_id = excluded.frisky_org_id,
      plan = 'standard',
      status = 'active',
      current_period_end = excluded.current_period_end,
      updated_at = excluded.updated_at`
  ).bind(`nowpayments:${paymentId}`, userId, `nowpayments_${paymentId}`, periodEnd, ts, ts).run();
  return json({ ok: true, activated: true });
}

async function handleFoundersCheckout(request, env) {
  if (!billingRequestAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const userId = normalizeText(body?.userId);
  const orgId = normalizeText(body?.orgId);
  const email = normalizeText(body?.email).toLowerCase();
  const billingPeriod = body?.billingPeriod === "annual" ? "annual" : "monthly";
  const priceId = foundersPriceId(env, billingPeriod);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(orgId) || !email.includes("@")) {
    return json({ ok: false, error: "invalid_identity" }, { status: 400 });
  }
  const successUrl = "https://communities.myfenrir.com/upgrade?stripe=success&session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = "https://communities.myfenrir.com/upgrade?stripe=cancel";
  // Optional referral attribution: carry a ref code through Checkout metadata so
  // handleStripeWebhook can reward the referrer on a paid conversion.
  const refCode = normalizeText(body?.refCode);
  const checkoutParams = {
    mode: "subscription",
    customer_email: email,
    client_reference_id: orgId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    // The dashboard-made quality Payment Links have this off, so a founder
    // could not redeem a code at all. API sessions accept them.
    allow_promotion_codes: "true",
    "line_items[0][quantity]": "1",
    "line_items[0][price]": priceId,
    "metadata[frisky_user_id]": userId,
    "metadata[frisky_org_id]": orgId,
    "metadata[plan]": "standard",
    "metadata[offer]": "founder_forever",
    "metadata[billing_period]": billingPeriod,
    // Distinguish real production sessions from the quality Payment Links,
    // which all carry environment=quality on this same live account.
    "metadata[environment]": "production",
    "subscription_data[metadata][environment]": "production",
    "subscription_data[metadata][frisky_user_id]": userId,
    "subscription_data[metadata][frisky_org_id]": orgId,
    "subscription_data[metadata][plan]": "standard",
    "subscription_data[metadata][offer]": "founder_forever"
  };
  if (/^[A-Za-z0-9]{6,16}$/.test(refCode)) {
    checkoutParams["metadata[ref_code]"] = refCode;
    checkoutParams["subscription_data[metadata][ref_code]"] = refCode;
  }
  const session = await stripeRequest(env, "/checkout/sessions", checkoutParams);
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
       AND (current_period_end IS NULL OR current_period_end > ?)
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(userId, nowIso()).first();
  return json({
    ok: true,
    paid: Boolean(subscription),
    plan: subscription?.plan || "free",
    status: subscription?.status || null
  });
}

const normalizeText = (value) => (value || "").trim();
const BRIDGE_TARGET = "managed MyFenrir Gate";
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
  "Primary promise: stop sharing raw Telegram invite links. Use one managed MyFenrir Gate, rotate private Telegram invites anytime, and keep control.",
  "Stable link example: https://communities.myfenrir.com/g/your-gate.",
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
  "Custom-domain DNS is not offered. Do not give users CNAME instructions. Do not promise it for a future date.",
  "Never reference fenrirprotocol.com as live infrastructure. Use myfenrir.com as the owned Fenrir domain.",
  `Customer custom domains are not offered. Use a ${BRIDGE_TARGET} instead. Never give a date.`,
  "PAYMENT BEHAVIOR:",
  "If user asks to buy, pay, upgrade, subscribe, unlock, activate, or similar: say you are opening the official Fenrir payment box.",
  "Payment rails, in this order: card (Apple Pay / Google Pay) first, Telegram Stars second, crypto third.",
  "Same price on every rail: US$14.99 for card and crypto. Telegram Stars is the equivalent, 1,150 Stars.",
  "Crypto is billed through NOWPayments at the same US$14.99. Any processing fee is shown by NOWPayments on its own checkout screen before paying — quote amounts, never percentages.",
  "Telegram Stars is NOT the only rail. Never tell a user card billing is unavailable or coming later.",
  "In-bot, /subscribe opens the Telegram Stars box. For card or crypto, point the user to MyFenrir → Upgrade.",
  "Explain Fenrir verifies access only after the payment processor confirms it.",
  "Never quote a number the customer will not actually be charged.",
  "Do not ask for card details. Do not pretend payment is complete.",
  "STATUS BEHAVIOR:",
  "If user asks status/access/active/paid/subscription/entitlement: use backend entitlement_status. If active, say Fenrir Protocol is active. If inactive, say access is not active yet and invite them to subscribe.",
  "SETUP BEHAVIOR:",
  "Setup path: create a managed MyFenrir Gate; add Fenrir bot to Telegram group; make bot admin; allow create/revoke invite links; create bridge slug; share stable public URL; rotate/revoke raw Telegram invites when needed.",
  "DNS WIZARD:",
  "Custom domains are not active. Do not provide TXT or CNAME records.",
  "PLANS (two tiers only):",
  "Free ($0): 5 gates to build and test, plus a managed MyFenrir Gate URL. Linking a community requires The Pack.",
  "The Pack ($14.99/month): multi-admin workflows and audit logs.",
  "Never say 'unlimited Locks'. The Pack is $14.99/month; never describe any allowance as unlimited.",
  "There is no Starter or Pro tier. Do not mention Starter, Pro, or Operator — those are retired.",
  "Communities are adults only.",
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
  const ts = nowIso();
  const telegramUserId = String(message.from?.id || message.chat.id);
  // Atomic single-use claim: flip pending→claimed only if still pending AND not
  // expired, in one guarded UPDATE ... RETURNING. The winner receives the row;
  // a concurrent double-tap / replay finds nothing to claim. This removes the
  // former SELECT-then-write window (closes the E3 replay class).
  const claimed = await env.DB.prepare(
    `UPDATE telegram_account_link_codes
        SET status = 'claimed',
            telegram_user_id = ?1,
            telegram_chat_id = ?2,
            telegram_username = ?3,
            telegram_first_name = ?4,
            claimed_at = ?5
      WHERE code = ?6 AND status = 'pending' AND expires_at > ?5
      RETURNING frisky_user_id, frisky_org_id, email`
  ).bind(
    telegramUserId,
    String(message.chat.id),
    message.from?.username || null,
    message.from?.first_name || null,
    ts,
    code
  ).first();

  if (!claimed) {
    // Nothing to claim: unknown, expired, or already-used code. Idempotency
    // guard — Telegram re-delivers /start deep-links (double-tap, reopened
    // t.me link, client retry). If this Telegram user is already linked, treat
    // the re-tap as success; a genuinely unknown code still errors generically.
    const already = await env.DB.prepare(
      `SELECT frisky_user_id, frisky_org_id FROM telegram_identity_links
       WHERE telegram_user_id = ? LIMIT 1`
    )
      .bind(telegramUserId)
      .first();
    if (already) {
      return {
        ok: true,
        alreadyLinked: true,
        friskyUserId: already.frisky_user_id,
        friskyOrgId: already.frisky_org_id
      };
    }
    return { ok: false, reason: "not_found" };
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM telegram_identity_links WHERE frisky_user_id = ? OR telegram_user_id = ?`).bind(
      claimed.frisky_user_id,
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
      claimed.frisky_user_id,
      claimed.frisky_org_id,
      claimed.email,
      message.from?.username || null,
      message.from?.first_name || null,
      ts,
      ts
    )
  ]);
  await applyStarsMembership(env, telegramUserId);
  return { ok: true, friskyUserId: claimed.frisky_user_id, friskyOrgId: claimed.frisky_org_id };
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

function gateAccessTokenFromStart(text) {
  const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+(gate_[a-z0-9.\-_]{20,64})$/i);
  return match?.[1] || "";
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeBytesEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function gateAccessSignature(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))).slice(0, 16);
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]{20,24}$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function verifyGateAccessToken(secret, token, telegramUserId, now = Math.floor(Date.now() / 1000)) {
  if (!secret || !token.startsWith("gate_")) return null;
  const compact = token.slice(5);
  const separator = compact.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = compact.slice(0, separator);
  const supplied = base64UrlToBytes(compact.slice(separator + 1));
  if (!supplied || !/^1\.[0-9a-z]+\.[0-9a-z]+\.[0-9a-z]+\.[0-9a-z]+$/i.test(payload)) return null;
  const expected = await gateAccessSignature(secret, payload);
  if (!timingSafeBytesEqual(supplied, expected)) return null;

  const [version, subjectText, chatText, expiresText] = payload.split(".");
  const subject = Number.parseInt(subjectText, 36);
  const chatMagnitude = Number.parseInt(chatText, 36);
  const expiresAt = Number.parseInt(expiresText, 36);
  if (
    version !== "1" ||
    !Number.isSafeInteger(subject) ||
    !Number.isSafeInteger(chatMagnitude) ||
    !Number.isSafeInteger(expiresAt) ||
    subject !== Number(telegramUserId) ||
    expiresAt < now ||
    expiresAt > now + 6 * 60
  ) return null;
  return { telegramUserId: subject, chatId: `-${chatMagnitude}`, expiresAt };
}

export async function handleGateAccessStart(env, channel, message, token) {
  const chat = message?.chat;
  const telegramUserId = message?.from?.id;
  if (!telegramUserId || chat?.type !== "private") return false;
  const claims = await verifyGateAccessToken(normalizeText(env.FENRIR_GATE_ACCESS_SECRET), token, telegramUserId);
  if (!claims) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: chat.id,
      text: "This Gate handoff is expired or invalid. Return to the Gate and request a fresh secure handoff."
    });
    return true;
  }

  const bot = await telegramApi(env, channel, "getMe", {});
  const botId = bot?.result?.id;
  const botMember = botId
    ? await telegramApi(env, channel, "getChatMember", { chat_id: claims.chatId, user_id: botId }).catch(() => null)
    : null;
  const botStatus = botMember?.result?.status;
  const botCanInvite = botStatus === "creator" || botStatus === "owner" || botMember?.result?.can_invite_users === true;
  if (!(botStatus === "administrator" || botStatus === "creator" || botStatus === "owner") || !botCanInvite) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: chat.id,
      text: "This Gate's Telegram destination is not ready to issue secure invites. Please contact the community owner."
    });
    return true;
  }

  const member = await telegramApi(env, channel, "getChatMember", { chat_id: claims.chatId, user_id: telegramUserId }).catch(() => null);
  const memberStatus = member?.result?.status;
  if (["creator", "owner", "administrator", "member"].includes(memberStatus) || (memberStatus === "restricted" && member?.result?.is_member)) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: chat.id,
      text: "Your Telegram identity already has access to this community."
    });
    return true;
  }

  const invite = await telegramApi(env, channel, "createChatInviteLink", {
    chat_id: claims.chatId,
    name: `Fenrir Gate ${telegramUserId}`.slice(0, 32),
    expire_date: Math.min(claims.expiresAt, Math.floor(Date.now() / 1000) + 5 * 60),
    member_limit: 1,
    creates_join_request: false
  }).catch(() => null);
  const inviteUrl = invite?.result?.invite_link;
  if (!inviteUrl) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: chat.id,
      text: "Fenrir could not issue the one-use invite just now. Return to the Gate to request a fresh handoff."
    });
    return true;
  }
  await telegramApi(env, channel, "sendMessage", {
    chat_id: chat.id,
    text: `Your one-use community invite is ready. It expires in five minutes:\n${inviteUrl}`,
    disable_web_page_preview: true
  });
  return true;
}

// ── Owner gate ──────────────────────────────────────────────────────────────
// Owner-only surfaces (the /panel courtesy generator) are gated by an allowlist
// of Telegram user ids. Sourced from env so it is not a code deploy to change,
// with the known Frisky owner id as the safe default.
function ownerTelegramIds(env) {
  const raw = normalizeText(env.OWNER_TELEGRAM_IDS) || "8581086019";
  return new Set(raw.split(/[^0-9]+/).filter(Boolean));
}
function isOwner(env, telegramUserId) {
  return ownerTelegramIds(env).has(String(telegramUserId || ""));
}

// ── Single-use courtesy codes (hardened per Mistral threat model) ────────────
// 1. Entropy: 12 chars from [A-Za-z0-9] minus ambiguous 0/O/1/l/I, drawn from
//    crypto.getRandomValues with rejection sampling (no modulo bias).
// 2. Only the HMAC-SHA256 hash of the code is stored in D1 (secret pepper);
//    the plaintext is shown to the owner exactly once and never persisted.
// 3. Redemption is a single atomic UPDATE ... WHERE status='unused' RETURNING;
//    one changed row == won the claim (replay-safe). No check-then-write.
// 4. Rate limited per Telegram identity (the only redemption rail).
// 5. Invalid / expired / already-used all collapse to one generic outcome.
// 6. Every generation and redemption attempt is appended to courtesy_audit.
const COURTESY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generateCourtesyCode(length = 12) {
  const alphabet = COURTESY_ALPHABET;
  const max = Math.floor(256 / alphabet.length) * alphabet.length; // reject >=max to kill modulo bias
  let out = "";
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < max) out += alphabet[buf[i] % alphabet.length];
    }
  }
  return out;
}
function courtesyPepper(env) {
  return (
    normalizeText(env.COURTESY_CODE_PEPPER) ||
    normalizeText(env.TELEGRAM_WEBHOOK_SECRET) ||
    normalizeText(env.FENRIR_ADMIN_TOKEN) ||
    "fenrir-courtesy-pepper"
  );
}
async function courtesyCodeHash(env, code) {
  return hmacHex(courtesyPepper(env), `courtesy_code:v1:${code}`);
}
async function appendCourtesyAudit(env, action, actorId, actorKind, codeHash, origin) {
  try {
    await env.DB.prepare(
      `INSERT INTO courtesy_audit (action, actor_id, actor_kind, code_hash, origin, server_ts)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(action, String(actorId ?? ""), actorKind, codeHash || null, origin || null, nowIso()).run();
  } catch (error) {
    console.error("courtesy_audit_failed", String(error));
  }
}
// Telegram is the only redemption rail, so every request arrives from Telegram's
// own IPs — an IP-based limit is meaningless. We limit per Telegram user id (the
// account identity) using the append-only audit log: 5 attempts / 15 minutes.
async function courtesyRateLimited(env, telegramUserId) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM courtesy_audit
      WHERE actor_id = ? AND action IN ('redeem', 'redeem_fail') AND server_ts > ?`
  ).bind(String(telegramUserId), since).first();
  return Number(row?.n || 0) >= 5;
}
async function createCourtesyCode(env, durationDays, createdByTelegramId) {
  const code = generateCourtesyCode(12);
  const codeHash = await courtesyCodeHash(env, code);
  const now = nowIso();
  const codeExpiresAt = new Date(Date.now() + 180 * 864e5).toISOString(); // 180d window to redeem
  await env.DB.prepare(
    `INSERT INTO courtesy_codes (
       code_hash, duration_days, status, created_by, created_at, code_expires_at
     ) VALUES (?, ?, 'unused', ?, ?, ?)`
  ).bind(codeHash, durationDays, String(createdByTelegramId), now, codeExpiresAt).run();
  await appendCourtesyAudit(env, "generate", createdByTelegramId, "owner", codeHash, "telegram");
  return { code, durationDays };
}
// Atomic single-use redemption. Rate-limit → format → identity → one guarded
// UPDATE that flips unused→used and RETURNs the row. Anything that fails to
// claim (missing / expired / already used) returns the same generic outcome so
// a redeemer cannot enumerate or distinguish code states.
async function redeemCourtesyCode(env, rawCode, telegramUserId, chatId) {
  if (await courtesyRateLimited(env, telegramUserId)) return { ok: false, reason: "rate_limited" };
  const code = normalizeText(rawCode);
  if (!/^[A-Za-z0-9]{8,16}$/.test(code)) {
    await appendCourtesyAudit(env, "redeem_fail", telegramUserId, "user", null, "telegram");
    return { ok: false, reason: "generic" };
  }
  const codeHash = await courtesyCodeHash(env, code);
  const now = nowIso();
  const link = await env.DB.prepare(
    `SELECT frisky_org_id, frisky_user_id FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
  ).bind(String(telegramUserId)).first();
  if (!link) {
    await appendCourtesyAudit(env, "redeem_fail", telegramUserId, "user", codeHash, "telegram");
    return { ok: false, reason: "not_linked" };
  }
  const claimed = await env.DB.prepare(
    `UPDATE courtesy_codes
        SET status = 'used',
            redeemed_by_telegram_user_id = ?1,
            redeemed_at = ?2
      WHERE code_hash = ?3
        AND status = 'unused'
        AND (code_expires_at IS NULL OR code_expires_at > ?2)
      RETURNING duration_days`
  ).bind(String(telegramUserId), now, codeHash).first();
  if (!claimed) {
    await appendCourtesyAudit(env, "redeem_fail", telegramUserId, "user", codeHash, "telegram");
    return { ok: false, reason: "generic" };
  }
  const durationDays = Number(claimed.duration_days) || 30;
  const courtesyUntil = new Date(Date.now() + durationDays * 864e5).toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE courtesy_codes SET courtesy_until = ? WHERE code_hash = ?`).bind(courtesyUntil, codeHash),
    env.DB.prepare(
      `INSERT INTO billing_subscriptions (
         stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
         current_period_end, cancel_at_period_end, created_at, updated_at
       ) VALUES (?, ?, ?, 'standard', 'active', ?, 0, ?, ?)
       ON CONFLICT(stripe_subscription_id) DO UPDATE SET
         frisky_org_id = excluded.frisky_org_id,
         plan = 'standard',
         status = 'active',
         current_period_end = excluded.current_period_end,
         updated_at = excluded.updated_at`
    ).bind(`courtesy:${codeHash.slice(0, 24)}`, link.frisky_org_id, `courtesy_${telegramUserId}`, courtesyUntil, now, now)
  ]);
  await appendCourtesyAudit(env, "redeem", telegramUserId, "user", codeHash, "telegram");
  return { ok: true, durationDays, courtesyUntil };
}

// ── Referral program (v1) ────────────────────────────────────────────────────
// Multi-use referral codes (ONE per referrer), crypto-RNG with rejection
// sampling (mirrors the courtesy generator). A referral code is a *shareable
// public token*, not a secret, so it is stored in plaintext (unlike courtesy
// codes, which store only an HMAC). Attribution is first-touch and deduped by
// the referred Telegram user (UNIQUE(referred_id)). A reward is granted ONLY on
// a real PAID conversion (Telegram Stars today; Stripe wired), never on a click,
// and exactly once per referred user (guarded UPDATE). Self-referral is blocked.
//
// Reward: REFERRAL_REWARD_DAYS courtesy days added to the referrer's access,
// STACKING on repeat paid conversions. Reuses the courtesy access rail — a
// billing_subscriptions row id `referral:<referrer>` with an extending
// current_period_end — so paid / courtesy / referral access all resolve
// uniformly in memberProfileText and the community billing-status endpoint.
const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function referralRewardDays(env) {
  const n = Number.parseInt(env.REFERRAL_REWARD_DAYS || "30", 10);
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : 30; // configurable; default 30 (flagged for Francisco)
}
function generateReferralCode(length = 8) {
  const alphabet = REFERRAL_ALPHABET;
  const max = Math.floor(256 / alphabet.length) * alphabet.length; // reject >=max to kill modulo bias
  let out = "";
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < max) out += alphabet[buf[i] % alphabet.length];
    }
  }
  return out;
}
function referralLink(env, code) {
  const user = botUsername(env) || "Myfenrir_bot";
  return `https://t.me/${user}?start=ref_${code}`;
}
function refCodeFromStart(text) {
  const match = String(text || "").match(/^\/start\s+ref_([A-Za-z0-9]{6,16})$/i);
  return match?.[1] || "";
}
// One code per referrer. UNIQUE(referrer_id) is the creation rate-limit — a
// referrer can never mint more than one code. Idempotent: returns the existing
// code if present, else creates one (a few retries guard against code collision
// or a concurrent create).
async function getOrCreateReferralCode(env, telegramUserId) {
  const uid = String(telegramUserId);
  const existing = await env.DB.prepare(
    `SELECT ref_code FROM referral_codes WHERE referrer_id = ? LIMIT 1`
  ).bind(uid).first();
  if (existing?.ref_code) return existing.ref_code;
  const link = await env.DB.prepare(
    `SELECT frisky_user_id, frisky_org_id FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
  ).bind(uid).first();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(8);
    try {
      await env.DB.prepare(
        `INSERT INTO referral_codes (ref_code, referrer_id, frisky_user_id, frisky_org_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(code, uid, link?.frisky_user_id || null, link?.frisky_org_id || null, nowIso()).run();
      return code;
    } catch (error) {
      // UNIQUE(referrer_id): a concurrent create won — re-read and return it.
      // UNIQUE(ref_code): rare collision — loop and try a fresh code.
      const row = await env.DB.prepare(
        `SELECT ref_code FROM referral_codes WHERE referrer_id = ? LIMIT 1`
      ).bind(uid).first();
      if (row?.ref_code) return row.ref_code;
    }
  }
  throw new Error("referral_code_alloc_failed");
}
// First-touch attribution on /start ref_<code>. Records a pending referral for
// the new (referred) Telegram user, subject to anti-abuse guards. Returns a short
// reason string for logging; never throws into the webhook.
async function recordReferralClick(env, refCode, referredTelegramUserId) {
  try {
    const referred = String(referredTelegramUserId);
    const codeRow = await env.DB.prepare(
      `SELECT ref_code, referrer_id FROM referral_codes WHERE ref_code = ? LIMIT 1`
    ).bind(refCode).first();
    if (!codeRow) return "unknown_code";
    if (String(codeRow.referrer_id) === referred) return "self_referral"; // block self-referral
    // An already-linked member is not a "new user" — do not attribute.
    const alreadyMember = await env.DB.prepare(
      `SELECT 1 FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
    ).bind(referred).first();
    if (alreadyMember) return "existing_member";
    // Dedupe by referred user — first ref wins (INSERT OR IGNORE on UNIQUE(referred_id)).
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO referrals (ref_code, referrer_id, referred_id, status, reward_status, created_at)
       VALUES (?, ?, ?, 'pending', 'none', ?)`
    ).bind(codeRow.ref_code, String(codeRow.referrer_id), referred, nowIso()).run();
    return res.meta?.changes ? "recorded" : "already_attributed";
  } catch (error) {
    console.error("referral_click_failed", String(error));
    return "error";
  }
}
// Extend the referrer's referral-reward window by `days`, STACKING on any
// existing referral reward. Uses a dedicated billing_subscriptions id so it
// never clobbers the referrer's own paid (`stars:`/`nowpayments:`) or courtesy
// (`courtesy:`) access.
async function grantReferralReward(env, referrerTelegramUserId, days) {
  const uid = String(referrerTelegramUserId);
  const link = await env.DB.prepare(
    `SELECT frisky_org_id FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
  ).bind(uid).first();
  const orgId = link?.frisky_org_id || `referral_${uid}`;
  const subId = `referral:${uid}`;
  const now = Date.now();
  const existing = await env.DB.prepare(
    `SELECT current_period_end FROM billing_subscriptions WHERE stripe_subscription_id = ? LIMIT 1`
  ).bind(subId).first();
  const base = existing?.current_period_end ? Date.parse(existing.current_period_end) : NaN;
  const start = Number.isFinite(base) && base > now ? base : now; // stack from the later of (now, current end)
  const newEnd = new Date(start + days * 864e5).toISOString();
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO billing_subscriptions (
       stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
       current_period_end, cancel_at_period_end, created_at, updated_at
     ) VALUES (?, ?, ?, 'standard', 'active', ?, 0, ?, ?)
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET
       frisky_org_id = excluded.frisky_org_id,
       plan = 'standard', status = 'active',
       current_period_end = excluded.current_period_end,
       updated_at = excluded.updated_at`
  ).bind(subId, orgId, `referral_${uid}`, newEnd, ts, ts).run();
  return newEnd;
}
// Paid-conversion attribution (Telegram Stars rail). Atomically flips the
// referred user's pending referral to converted (once), then grants the referrer
// their reward. Idempotent across webhook retries: the guarded
// UPDATE ... WHERE status='pending' RETURNING yields a row exactly once, so the
// reward is granted exactly once.
async function recordReferralConversion(env, referredTelegramUserId, eventType, channel) {
  try {
    const referred = String(referredTelegramUserId);
    const days = referralRewardDays(env);
    const claimed = await env.DB.prepare(
      `UPDATE referrals
          SET status = 'converted', conversion_event = ?1, reward_days = ?2, converted_at = ?3
        WHERE referred_id = ?4 AND status = 'pending'
        RETURNING referrer_id, ref_code`
    ).bind(eventType, days, nowIso(), referred).first();
    if (!claimed) return { converted: false };
    if (String(claimed.referrer_id) === referred) return { converted: false }; // defensive: never self-reward
    const rewardEnd = await grantReferralReward(env, claimed.referrer_id, days);
    await env.DB.prepare(
      `UPDATE referrals SET reward_status = 'granted' WHERE referred_id = ?`
    ).bind(referred).run();
    // Best-effort: notify the referrer that they earned days.
    if (channel) {
      try {
        await telegramApi(env, channel, "sendMessage", {
          chat_id: claimed.referrer_id,
          text: [
            "🎉 Referral converted!",
            "",
            "Someone you invited just activated The Pack.",
            `Reward: +${days} days of The Pack access.`,
            `Your access now runs through ${String(rewardEnd).slice(0, 10)}.`,
            "",
            "Share your link again with /referral."
          ].join("\n")
        });
      } catch (error) {
        console.error("referral_notify_failed", String(error));
      }
    }
    return { converted: true, days, rewardEnd, referrerId: String(claimed.referrer_id) };
  } catch (error) {
    console.error("referral_conversion_failed", String(error));
    return { converted: false };
  }
}
// Paid-conversion attribution (Stripe/web rail). Keyed by 'org:<frisky_org_id>'
// so it cannot collide with the Telegram-id namespace. Self-referral (referrer's
// own org) is blocked. Idempotent: INSERT OR IGNORE lands the converted row once
// (UNIQUE(referred_id)); the reward is granted only on that first insert. The
// referring flow must pass metadata[ref_code] into the Stripe Checkout Session.
async function recordStripeReferral(env, refCode, orgId) {
  try {
    const code = normalizeText(refCode);
    const org = normalizeText(orgId);
    if (!code || !org) return;
    const codeRow = await env.DB.prepare(
      `SELECT ref_code, referrer_id, frisky_org_id FROM referral_codes WHERE ref_code = ? LIMIT 1`
    ).bind(code).first();
    if (!codeRow) return;
    if (codeRow.frisky_org_id && String(codeRow.frisky_org_id) === org) return; // self-referral
    const referredId = `org:${org}`;
    const days = referralRewardDays(env);
    const ts = nowIso();
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO referrals (
         ref_code, referrer_id, referred_id, status, reward_status, reward_days, conversion_event, created_at, converted_at
       ) VALUES (?, ?, ?, 'converted', 'granted', ?, 'stripe', ?, ?)`
    ).bind(codeRow.ref_code, String(codeRow.referrer_id), referredId, days, ts, ts).run();
    if (res.meta?.changes) await grantReferralReward(env, codeRow.referrer_id, days);
  } catch (error) {
    console.error("stripe_referral_failed", String(error));
  }
}
async function referralStats(env, telegramUserId) {
  const uid = String(telegramUserId);
  const [counts, reward] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS invited,
         SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted,
         SUM(CASE WHEN reward_status = 'granted' THEN COALESCE(reward_days, 0) ELSE 0 END) AS reward_days
       FROM referrals WHERE referrer_id = ?`
    ).bind(uid).first(),
    env.DB.prepare(
      `SELECT current_period_end FROM billing_subscriptions WHERE stripe_subscription_id = ? LIMIT 1`
    ).bind(`referral:${uid}`).first()
  ]);
  return {
    invited: Number(counts?.invited || 0),
    converted: Number(counts?.converted || 0),
    rewardDays: Number(counts?.reward_days || 0),
    rewardThrough: reward?.current_period_end ? String(reward.current_period_end).slice(0, 10) : null
  };
}
async function referralPanelText(env, telegramUserId, from) {
  const uid = String(telegramUserId);
  const link = await env.DB.prepare(
    `SELECT 1 FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
  ).bind(uid).first();
  const code = await getOrCreateReferralCode(env, uid);
  const url = referralLink(env, code);
  const stats = await referralStats(env, uid);
  const days = referralRewardDays(env);
  return [
    "🔗 Refer & earn — MyFenrir",
    "",
    "Share your personal link. When someone you invite activates The Pack,",
    `you earn +${days} days of The Pack access — free, and it stacks with every paid referral.`,
    "",
    "Your link:",
    url,
    "",
    `Invited: ${stats.invited}`,
    `Converted (paid): ${stats.converted}`,
    `Days earned: ${stats.rewardDays}`,
    ...(stats.rewardThrough ? [`Reward access through: ${stats.rewardThrough}`] : []),
    ...(link ? [] : ["", "Tip: link your MyFenrir account (/link) so rewards attach to it."])
  ].join("\n");
}

async function sendOwnerPanel(env, channel, message) {
  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      "🛠 Owner panel",
      "",
      "Generate a single-use courtesy code. It is shown once — store it securely.",
      "When redeemed with /redeem <CODE> by a MyFenrir-linked account it grants The Pack for the chosen window."
    ].join("\n"),
    reply_markup: {
      inline_keyboard: [[
        { text: "Courtesy · 30d", callback_data: "courtesy_gen:30" },
        { text: "90d", callback_data: "courtesy_gen:90" },
        { text: "180d", callback_data: "courtesy_gen:180" }
      ]]
    }
  });
}

// ── Community button panel (ChatKeeper-style) ────────────────────────────────
// Inline keyboard shown in the group / chat: MEMBER PROFILE on its own row,
// RULES + STAFF on the row below. Each button fires the matching command, and
// the same commands also work when typed (/profile, /rules, /staff). Content is
// per-community configurable via env overrides; base text ships as the default.
const COMMUNITY_RULES_FALLBACK = [
  "📜 Community rules",
  "",
  "1. Respect every member. No harassment, hate, or doxxing.",
  "2. No spam, scams, or unsolicited promotion.",
  "3. Keep content lawful and age-appropriate. Minors are never permitted.",
  "4. Follow staff guidance; decisions are final in-channel.",
  "5. Access is personal — do not share invite links or your courtesy code.",
  "",
  "Breaking the rules can remove your access without refund."
].join("\n");
const COMMUNITY_STAFF_FALLBACK = [
  "🛡️ Staff & contact",
  "",
  "This community is operated on MyFenrir by its admins.",
  "For access, billing, or safety issues, message the group admins directly,",
  "or reach MyFenrir support at support@myfenrir.com.",
  "",
  "Fenrir Bot handles payments and access; staff handle community decisions."
].join("\n");
function communityRulesText(env) {
  return normalizeText(env.COMMUNITY_RULES_TEXT) || COMMUNITY_RULES_FALLBACK;
}
function communityStaffText(env) {
  return normalizeText(env.COMMUNITY_STAFF_TEXT) || COMMUNITY_STAFF_FALLBACK;
}
function communityPanelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 MEMBER PROFILE", callback_data: "cm_profile" }],
      [{ text: "🔗 REFER & EARN", callback_data: "cm_referral" }],
      [
        { text: "📜 RULES", callback_data: "cm_rules" },
        { text: "🛡️ STAFF", callback_data: "cm_staff" }
      ]
    ]
  };
}
async function sendCommunityPanel(env, channel, message) {
  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      "🐺 MyFenrir community",
      "",
      "Use the buttons below — view your member profile, read the rules, or reach staff."
    ].join("\n"),
    reply_markup: communityPanelKeyboard()
  });
}
// Per-community frequency control for the ambient (auto-shown) button panel.
// The percentage lives in D1 table community_bot_config, keyed by the Telegram
// chat id of the community/group (one row per community), column
// keyboard_show_pct (default 50). Each community can raise/lower it. Explicit
// /community, /profile, /rules, /staff always work — only the ambient auto-show
// is throttled, so the group is not spammed on every message.
async function communityKeyboardPct(env, chatId) {
  const row = await env.DB.prepare(
    `SELECT keyboard_show_pct FROM community_bot_config WHERE chat_id = ?`
  ).bind(String(chatId)).first();
  let pct = row ? Number(row.keyboard_show_pct) : 50;
  if (!Number.isFinite(pct)) pct = 50;
  return Math.max(0, Math.min(100, pct));
}
async function setCommunityKeyboardPct(env, chatId, pct) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  await env.DB.prepare(
    `INSERT INTO community_bot_config (chat_id, keyboard_show_pct, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       keyboard_show_pct = excluded.keyboard_show_pct,
       updated_at = excluded.updated_at`
  ).bind(String(chatId), clamped, nowIso()).run();
  return clamped;
}
function rollPercent() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 100; // 0..99, crypto RNG
}
// Ambient auto-show: only in group communities, and only `keyboard_show_pct`% of
// the time (default 50%). Never fires in private chats or when pct is 0.
async function maybeSendCommunityPanel(env, channel, message) {
  const type = message.chat?.type;
  if (type !== "group" && type !== "supergroup") return;
  const pct = await communityKeyboardPct(env, message.chat.id);
  if (pct <= 0) return;
  if (rollPercent() < pct) await sendCommunityPanel(env, channel, message);
}
async function isChatAdmin(env, channel, chatId, userId) {
  if (!userId) return false;
  try {
    const res = await telegramApi(env, channel, "getChatMember", { chat_id: chatId, user_id: userId });
    const status = res?.result?.status;
    return status === "administrator" || status === "creator" || status === "owner";
  } catch {
    return false;
  }
}

export function telegramCommunityId(chatId) {
  // Community Bridge identifiers are stable slugs, while Telegram chat IDs are
  // signed integers. Keep the external ID separately and derive a safe,
  // deterministic selector key for the verified destination inventory.
  return `telegram-${String(chatId).replace(/^-/, "")}`;
}

/**
 * Gobierno del grupo: quién es el dueño y quiénes los admins, con permisos.
 *
 * `getChatAdministrators` lo da todo en UNA llamada. Se guarda para dos cosas:
 * saber de quién es el grupo de verdad, y detectar más tarde que el dueño
 * cambió — hoy sólo se comprobaba que quien escribe sea admin, y eso no dice
 * nada de los demás.
 *
 * Nunca lanza. Si Telegram no responde, devuelve `null` y el alta sigue sin
 * gobierno: registrar el grupo es más importante que adornarlo.
 */
async function mapGroupGovernance(env, channel, chatId) {
  const res = await telegramApi(env, channel, "getChatAdministrators", { chat_id: chatId }).catch(() => null);
  const list = res?.result;
  if (!Array.isArray(list)) return null;
  const admins = list.map((entry) => ({
    telegramUserId: String(entry?.user?.id ?? ""),
    status: entry?.status === "creator" ? "creator" : "administrator",
    isBot: entry?.user?.is_bot === true,
    // El dueño tiene todos los permisos implícitos; Telegram no siempre los
    // incluye en su variante de ChatMember.
    canInviteUsers: entry?.status === "creator" || entry?.can_invite_users === true,
    canRestrictMembers: entry?.status === "creator" || entry?.can_restrict_members === true,
    canPromoteMembers: entry?.status === "creator" || entry?.can_promote_members === true
  })).filter((admin) => admin.telegramUserId);
  if (admins.length === 0) return null;
  const owner = admins.find((admin) => admin.status === "creator");
  return {
    ownerTelegramUserId: owner ? owner.telegramUserId : null,
    admins: admins.slice(0, 100),
    mappedAt: nowIso()
  };
}

/**
 * Cribado de los admins contra la lista de bloqueo.
 *
 * SE LLAMA APARTE Y DESPUÉS del alta, a propósito. Un timeout de un tercero no
 * puede tumbar el registro de un grupo: si el proveedor tarda o cae, el estado
 * queda `unavailable` y el destino se verifica igual. Sólo un `blocked` real
 * —una respuesta afirmativa, no una ausencia de respuesta— retiene la
 * verificación.
 *
 * Los bots del propio grupo se excluyen: no son personas y no se criban.
 *
 * NOTA DE ALCANCE: Didit es la fuente de verdad de bloqueos porque ya lo es
 * para el KYC de activación; una tabla casera crearía dos listas que divergen.
 * El puente concreto con su API todavía no está cableado — hasta entonces esto
 * devuelve `pending` de forma explícita, que es la verdad, en vez de fingir un
 * `clear` que nadie ha comprobado.
 */
async function screenGroupAdmins(env, governance) {
  if (!governance) return { state: "pending", provider: "didit", reason: "governance_unavailable" };
  const humans = governance.admins.filter((admin) => !admin.isBot).map((admin) => admin.telegramUserId);
  if (humans.length === 0) return { state: "clear", provider: "didit", checkedAt: nowIso() };
  const endpoint = normalizeText(env.DIDIT_BLOCKLIST_CHECK_URL);
  const key = normalizeText(env.DIDIT_API_KEY);
  if (!endpoint || !key) {
    // Sin configurar no es "limpio": es "no comprobado". Se dice cuál de los dos.
    return { state: "pending", provider: "didit", reason: "screening_not_configured" };
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ telegramUserIds: humans })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      console.error("group_admin_screening_unavailable", response.status || 0);
      return { state: "unavailable", provider: "didit", reason: "provider_error" };
    }
    const blocked = Array.isArray(body.blocked) ? body.blocked.map(String) : [];
    return blocked.length > 0
      ? { state: "blocked", provider: "didit", checkedAt: nowIso(), blockedTelegramUserIds: blocked }
      : { state: "clear", provider: "didit", checkedAt: nowIso() };
  } catch {
    console.error("group_admin_screening_failed");
    return { state: "unavailable", provider: "didit", reason: "request_failed" };
  }
}

async function syncVerifiedTelegramDestination(env, channel, message) {
  const secret = normalizeText(env.COMMUNITY_BRIDGE_DESTINATION_SYNC_SECRET);
  if (!secret) return { ok: false, reason: "sync_not_configured" };
  const chat = message?.chat;
  const actorId = message?.from?.id;
  if (!chat?.id || !actorId || (chat.type !== "group" && chat.type !== "supergroup")) {
    return { ok: false, reason: "not_a_group" };
  }
  if (!(await isChatAdmin(env, channel, chat.id, actorId))) {
    return { ok: false, reason: "actor_not_admin" };
  }
  const bot = await telegramApi(env, channel, "getMe", {});
  const botId = bot?.result?.id;
  const botMember = botId
    ? await telegramApi(env, channel, "getChatMember", { chat_id: chat.id, user_id: botId })
    : null;
  const botStatus = botMember?.result?.status;
  const isBotAdmin = botStatus === "administrator" || botStatus === "creator" || botStatus === "owner";
  // Chat owners implicitly have every admin capability; Telegram does not
  // consistently include `can_invite_users` on that ChatMember variant.
  const botCanInvite = botStatus === "creator" || botStatus === "owner" || botMember?.result?.can_invite_users === true;
  if (!isBotAdmin || !botCanInvite) {
    return { ok: false, reason: "bot_permissions_missing" };
  }

  // DOS TIEMPOS, en este orden y no al revés.
  //
  // 1) El gobierno del grupo se mapea antes del alta porque es una sola llamada
  //    a Telegram —el mismo servicio con el que ya estamos hablando— y sin él
  //    el cribado no sabría a quién cribar. Si falla, `null`: el alta sigue.
  // 2) El cribado va DESPUÉS y contra un tercero. Nunca bloquea el alta por
  //    indisponibilidad: sólo un `blocked` afirmativo retiene la verificación.
  //    El servidor deriva el `status` del `screening`; aquí no se elige.
  const governance = await mapGroupGovernance(env, channel, chat.id);
  const screening = await screenGroupAdmins(env, governance);

  const destinationUrl =
    normalizeText(env.COMMUNITY_BRIDGE_DESTINATION_SYNC_URL) ||
    "https://communities.myfenrir.com/api/internal/telegram-destination";
  const response = await fetch(destinationUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      telegramUserId: String(actorId),
      communityId: telegramCommunityId(chat.id),
      telegramChatId: String(chat.id),
      displayName: normalizeText(chat.title) || `Telegram group ${chat.id}`,
      capabilities: { botAdmin: true, canInviteUsers: true },
      ...(governance ? { governance } : {}),
      screening
    })
  }).catch(() => null);
  const body = response ? await response.json().catch(() => null) : null;
  if (!response?.ok || body?.ok !== true) {
    console.error("telegram_destination_sync_failed", response?.status || 0, body?.error || "request_failed");
    return { ok: false, reason: body?.error || "sync_failed" };
  }
  // El detalle de quién está bloqueado va al log interno, jamás al chat.
  if (screening.state === "blocked") {
    console.error("group_admin_screening_blocked", telegramCommunityId(chat.id), (screening.blockedTelegramUserIds || []).join(","));
    return { ok: false, reason: "screening_blocked" };
  }
  return { ok: true, communityId: telegramCommunityId(chat.id), screening: screening.state };
}
// Member profile: plan, access, and courtesy window if any. Resolves from the
// Telegram identity link → billing_subscriptions (with expiry) and the Stars
// entitlement, so it reflects paid, courtesy, and Stars access consistently.
async function memberProfileText(env, telegramUserId, from) {
  const now = nowIso();
  const [ent, link] = await Promise.all([
    getEntitlement(env, telegramUserId),
    env.DB.prepare(
      `SELECT frisky_org_id, frisky_user_id, email FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
    ).bind(String(telegramUserId)).first()
  ]);
  let plan = "Free";
  let active = false;
  let courtesyLine = "";
  if (link) {
    const sub = await env.DB.prepare(
      `SELECT plan, status, current_period_end, stripe_subscription_id
         FROM billing_subscriptions
        WHERE frisky_org_id = ? AND status IN ('active','trialing','past_due')
          AND (current_period_end IS NULL OR current_period_end > ?)
        ORDER BY updated_at DESC LIMIT 1`
    ).bind(link.frisky_org_id, now).first();
    if (sub) {
      plan = "The Pack";
      active = true;
      if (String(sub.stripe_subscription_id || "").startsWith("courtesy:") && sub.current_period_end) {
        courtesyLine = `Courtesy access through ${String(sub.current_period_end).slice(0, 10)}`;
      }
    }
  }
  if (!active && ent?.status === "active") {
    plan = "The Pack";
    active = true;
  }
  const name = normalizeText(from?.first_name) || normalizeText(from?.username) || "Member";
  const refStats = await referralStats(env, telegramUserId);
  return [
    "👤 Member profile",
    "",
    `Name: ${name}`,
    `Telegram ID: ${telegramUserId}`,
    `Account: ${link ? "linked to MyFenrir" : "not linked yet"}`,
    `Plan: ${plan}`,
    `Access: ${active ? "active ✅" : "inactive"}`,
    ...(courtesyLine ? ["", courtesyLine] : []),
    "",
    `Referrals: ${refStats.converted}/${refStats.invited} converted · ${refStats.rewardDays} days earned`,
    "Get your invite link with /referral.",
    ...(active ? [] : ["", "Activate The Pack — $14.99/month.", "Card or crypto in MyFenrir → Upgrade, Telegram Stars with /subscribe, or a courtesy code via /redeem."])
  ].join("\n");
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
  // Telegram Stars invoice canon: currency XTR, `provider_token` OMITTED (an
  // empty string is not the same as absent — it previously returned
  // PROVIDER_ACCOUNT_INVALID), exactly ONE entry in `prices`, and no
  // shipping/address/phone/email/need_* /is_flexible fields.
  // `subscription_period` is REQUIRED for a recurring Stars subscription:
  // without it Telegram charges ONCE while we advertise "$14.99/month".
  // 2592000 seconds (30 days) is the only value Telegram accepts.
  await telegramApi(env, channel, "sendInvoice", {
    chat_id: message.chat.id,
    title: env.FENRIR_STARS_TITLE || "The Pack · MyFenrir",
    description:
      env.FENRIR_STARS_DESCRIPTION ||
      "The Pack — $14.99/month. Multi-admin and audit logs. Billed monthly in Telegram Stars.",
    payload,
    currency: "XTR",
    prices: [{ label: env.FENRIR_STARS_LABEL || "The Pack", amount }],
    subscription_period: 2592000,
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

export function modularMenuText(text, entitlement) {
  const active = entitlement?.status === "active";
  if (spanishIntent(text)) {
    return [
      "MYFENRIR | Control de comunidad",
      `Plan: ${active ? "The Pack · activo" : "Free · listo para tu primer Gate"}`,
      "",
      "Tu siguiente paso · protege un grupo de Telegram",
      "",
      "1 · Crea un Gate",
      "Da a tu comunidad una página de entrada con reglas y una solicitud de acceso.",
      "",
      "2 · Vincula y verifica tu grupo",
      "Agrega Fenrir como admin con permiso para crear invitaciones. Tú aceptas a cada persona antes de que reciba una invitación.",
      "",
      "3 · Elige tu plan cuando lo necesites",
      "Gratis incluye 5 gates para armar y probar. Enlazar una comunidad requiere The Pack: US$14.99/mes, con multi-admin y auditoría.",
      "",
      "Puedes crear tu primer Gate sin pagar ni configurar DNS.",
      "",
      "Elige una acción abajo para continuar."
    ].join("\n");
  }
  return [
    "MYFENRIR | Community control",
    `Plan: ${active ? "The Pack · active" : "Free · ready for your first Gate"}`,
    "",
    "Your next step · protect a Telegram group",
    "",
    "1 · Create a Gate",
    "Give your community an entrance page with rules and an access request.",
    "",
    "2 · Link and verify your group",
    "Make Fenrir an admin with Invite Users. You approve each person before the bot creates their invite.",
    "",
    "3 · Choose a plan when you need it",
    "Free includes 5 gates to build and test. Linking a community requires The Pack: US$14.99/month, with multi-admin and audit logs.",
    "",
    "You can create your first Gate without paying or setting up DNS.",
    "",
    "Choose an action below to continue."
  ].join("\n");
}

export function botMenuKeyboard(entitlement) {
  return [
    [
      {
        text: "Create my Gate",
        callback_data: "fenrir_setup",
        style: "primary"
      }
    ],
    [
      {
        text: "Compare plans",
        callback_data: "fenrir_plans",
        style: "primary"
      },
      {
        text: "My access",
        callback_data: "fenrir_status",
        style: "success"
      }
    ],
    ...(entitlement?.status === "active"
      ? []
      : [[{
          text: "⭐ Activate The Pack · Stars",
          callback_data: "fenrir_subscribe",
          style: "primary"
        }]])
  ];
}

async function sendBotMenu(env, channel, message, entitlement) {
  const payload = {
    chat_id: message.chat.id,
    caption: modularMenuText(message.text || "", entitlement),
    video: BOT_OS_WELCOME_VIDEO_URL,
    supports_streaming: true,
    reply_markup: {
      inline_keyboard: botMenuKeyboard(entitlement)
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
        : "Fenrir Protocol todavia no esta activo.\n\n$14.99/mes.\nTarjeta y cripto en MyFenrir → Upgrade. /subscribe abre la caja de Telegram Stars (⭐1,150).";
    }
    return entitlement?.status === "active"
      ? `Fenrir Protocol is active.\n\nAccess: unlocked\nStars: ${entitlement.stars_amount}\nMode: Telegram Stars`
      : "Fenrir Protocol is not active yet.\n\n$14.99/month.\nCard and crypto in MyFenrir → Upgrade. /subscribe opens the Telegram Stars box (⭐1,150).";
  }

  if (pricingIntent(text)) {
    if (spanishIntent(text)) {
      return [
        "MYFENRIR | Planes",
        "",
        "Gratis · $0",
        "5 gates para armar y probar.",
        "Enlazar una comunidad requiere The Pack.",
        "",
        "The Pack · $14.99/mes",
        "Multi-admin y registros de auditoría.",
        "",
        "Cómo pagar · mismo precio en los tres:",
        "1. Tarjeta (Apple Pay / Google Pay) — $14.99",
        "2. Telegram Stars — ⭐1,150",
        "3. Cripto — $14.99 · NOWPayments te muestra su comisión antes de pagar",
        "",
        "/subscribe abre la caja de Stars. Tarjeta y cripto en MyFenrir → Upgrade."
      ].join("\n");
    }
    return [
      "MYFENRIR | Plans",
      "",
      "Free · $0",
      "5 gates to build and test.",
      "Linking a community requires The Pack.",
      "",
      "The Pack · $14.99/month",
      "Multi-admin and audit logs.",
      "",
      "How to pay · same price on all three:",
      "1. Card (Apple Pay / Google Pay) — $14.99",
      "2. Telegram Stars — ⭐1,150",
      "3. Crypto — $14.99 · NOWPayments shows its fee before you pay",
      "",
      "/subscribe opens the Stars box. Card and crypto in MyFenrir → Upgrade."
    ].join("\n");
  }

  if (stripeIntent(text)) {
    if (spanishIntent(text)) {
      return [
        "MYFENRIR | Pago",
        "",
        "The Pack cuesta $14.99/mes.",
        "",
        "1. Tarjeta (Apple Pay / Google Pay) — $14.99",
        "2. Telegram Stars — ⭐1,150",
        "3. Cripto — $14.99 · NOWPayments te muestra su comisión antes de pagar",
        "",
        "/subscribe abre la caja de Telegram Stars.",
        "Fenrir activa el acceso sólo cuando el procesador confirma el pago."
      ].join("\n");
    }
    return [
      "MYFENRIR | Payment",
      "",
      "The Pack is $14.99/month.",
      "",
      "1. Card (Apple Pay / Google Pay) — $14.99",
      "2. Telegram Stars — ⭐1,150",
      "3. Crypto — $14.99 · NOWPayments shows its fee before you pay",
      "",
      "/subscribe opens the Telegram Stars box.",
      "Fenrir activates access only after the processor confirms payment."
    ].join("\n");
  }

  if (setupIntent(text)) {
    if (spanishIntent(text)) {
      return [
        "Si. Fenrir te da un link stable y dejas de compartir invitaciones crudas de Telegram.",
        "",
        "Ruta de setup:",
        "1. Crea un Gate administrado de MyFenrir.",
        "2. Agrega Fenrir Bot al grupo.",
        "3. Hazlo admin.",
        "4. Permite crear y revocar invites.",
        "5. Crea el slug del bridge.",
        "6. Comparte el link estable.",
        "",
        "Gratis te da 5 gates para probar. Enlazar una comunidad requiere The Pack ($14.99/mes)."
      ].join("\n");
    }
    return [
      "Fenrir Bridge setup path:",
      "",
      "1. Create a managed MyFenrir Gate.",
      "2. Add Fenrir Bot to the Telegram group.",
      "3. Make the bot admin.",
      "4. Allow it to create and revoke invite links.",
      "5. Create a bridge slug.",
      "6. Share the stable public URL.",
      "",
      "Free gives you 5 gates to test. Linking a community requires The Pack ($14.99/month).",
      "",
      "Say “buy” and I’ll show you the three ways to pay."
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
  if (!configuredSecret) {
    // FAIL CLOSED. This used to be `if (configuredSecret && ...)`, which meant that
    // with the variable unset the check never ran and ANY HTTP client could POST a
    // fake payment confirmation into the only rail that bills. Refuse to process.
    // Still answer 200, for the same retry-loop reason documented just below.
    console.error("stars_webhook_secret_not_configured");
    return json({ ok: true });
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== configuredSecret) {
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

    // Owner-only: generate a single-use courtesy code (30 / 90 / 180 days).
    if (typeof query.data === "string" && query.data.startsWith("courtesy_gen:")) {
      if (!isOwner(env, query.from?.id)) {
        await telegramApi(env, channel, "answerCallbackQuery", { callback_query_id: query.id, text: "Restricted." });
        return json({ ok: true });
      }
      const days = Number(query.data.split(":")[1]);
      if (![30, 90, 180].includes(days)) {
        await telegramApi(env, channel, "answerCallbackQuery", { callback_query_id: query.id, text: "Invalid duration." });
        return json({ ok: true });
      }
      await telegramApi(env, channel, "answerCallbackQuery", { callback_query_id: query.id, text: "Generating…" });
      const { code } = await createCourtesyCode(env, days, query.from?.id);
      await telegramApi(env, channel, "sendMessage", {
        chat_id: callbackMessage.chat.id,
        parse_mode: "Markdown",
        text: [
          `🎟 Courtesy code · ${days} days`,
          "",
          "`" + code + "`",
          "",
          "Single-use · shown once · store it securely.",
          "Redeem: `/redeem " + code + "`"
        ].join("\n")
      });
      return json({ ok: true });
    }

    // Community panel buttons (MEMBER PROFILE / REFER & EARN / RULES / STAFF).
    if (
      query.data === "cm_profile" ||
      query.data === "cm_referral" ||
      query.data === "cm_rules" ||
      query.data === "cm_staff"
    ) {
      await telegramApi(env, channel, "answerCallbackQuery", { callback_query_id: query.id });
      let body;
      let disablePreview = false;
      if (query.data === "cm_profile") body = await memberProfileText(env, String(query.from?.id), query.from);
      else if (query.data === "cm_referral") { body = await referralPanelText(env, String(query.from?.id), query.from); disablePreview = true; }
      else if (query.data === "cm_rules") body = communityRulesText(env);
      else body = communityStaffText(env);
      await telegramApi(env, channel, "sendMessage", {
        chat_id: callbackMessage.chat.id,
        text: body,
        ...(disablePreview ? { disable_web_page_preview: true } : {})
      });
      return json({ ok: true });
    }

    await telegramApi(env, channel, "answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Fenrir module selected."
    });

    if (query.data === "fenrir_subscribe") {
      await telegramApi(env, channel, "sendMessage", {
        chat_id: callbackMessage.chat.id,
        text: "Opening the Telegram Stars box — ⭐1,150 for The Pack, one linked community, billed monthly.\nPrefer card or crypto at the same $14.99? MyFenrir → Upgrade.\nFenrir activates access only after the payment is confirmed."
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
    // Referral attribution: if this buyer arrived via a ref link, this is the
    // paid conversion — reward the referrer once (idempotent, self-reward blocked).
    await recordReferralConversion(env, telegramUserId, "stars", channel);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: membership.applied
        ? `The Pack activated.\n\nAccess: active\nCovers: 1 linked community\nMulti-admin · audit logs\nStars: ${payment.total_amount}\nPayment rail: Telegram Stars\nRenews monthly.`
        : `Stars payment confirmed.\n\nStars: ${payment.total_amount}\nNext: open MyFenrir → Settings → Link Telegram. The Pack will activate automatically after linking.`
    });
    return json({ ok: true });
  }

  const text = normalizeText(message?.text);
  if (!text) return json({ ok: true });

  const entitlement = await getEntitlement(env, message.from?.id || message.chat.id);

  const gateAccessToken = gateAccessTokenFromStart(text);
  if (gateAccessToken) {
    await handleGateAccessStart(env, channel, message, gateAccessToken);
    return json({ ok: true });
  }

  // Guided deep links used by the Community Gate walkthrough.  Keep these
  // explicit: a Telegram deep link must never fall through into a generic bot
  // reply, otherwise the dashboard appears to launch an action that does not
  // exist. `discover` is the startgroup payload Telegram sends after the owner
  // chooses a group for the bot.
  const walkthroughStart = text.match(
    /^\/start(?:@[A-Za-z0-9_]+)?\s+(account|discover|mapping|readiness)$/i,
  )?.[1]?.toLowerCase();
  if (walkthroughStart === "account") {
    await sendTelegramLinkStart(env, channel, message);
    return json({ ok: true });
  }
  if (walkthroughStart === "discover") {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: message.chat.type === "private"
        ? "Choose the protected Telegram group from this link, add @Myfenrir_bot as an admin with Invite Users, then run /connect inside that group."
        : "You are in the protected group. Make @Myfenrir_bot an admin with Invite Users, then run /connect."
    });
    return json({ ok: true });
  }
  if (walkthroughStart === "mapping") {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: "Map your destination in the protected group: make @Myfenrir_bot an admin with Invite Users, then run /connect there. Fenrir will verify the group and show it in MyFenrir."
    });
    return json({ ok: true });
  }
  if (walkthroughStart === "readiness") {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: "Readiness check: your Gate can issue private invites only after the protected group is verified. In that group, make @Myfenrir_bot an admin with Invite Users and run /connect."
    });
    return json({ ok: true });
  }

  if (/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+gate)?$/i.test(text)) {
    await sendIdentityWelcome(env, channel, message);
    return json({ ok: true });
  }

  if (commandForThisBot(text, "link", env)) {
    await sendTelegramLinkStart(env, channel, message);
    return json({ ok: true });
  }

  // Run this command *inside the Telegram group*. Fenrir verifies both the
  // calling admin and its own Invite Users permission, then publishes the
  // group into the owner's Community Bridge dashboard selector.
  if (commandForThisBot(text, "connect", env)) {
    const result = await syncVerifiedTelegramDestination(env, channel, message);
    const replies = {
      ok: "✅ This group is verified. Open MyFenrir → My Gates and choose it from the verified Telegram group selector.",
      not_a_group: "Run /connect inside the Telegram group you want Fenrir to protect.",
      actor_not_admin: "Only a Telegram group admin can verify this group.",
      bot_permissions_missing: "Make Fenrir an admin and enable Invite Users, then run /connect again.",
      telegram_identity_not_linked: "Link your MyFenrir account first in a private chat with /link, then run /connect here again.",
      sync_not_configured: "Group verification is not configured yet. Please contact the MyFenrir team.",
      // Ni se nombra a nadie ni se dice que haya alguien bloqueado: lo primero
      // es una acusación pública, lo segundo convierte el grupo en una cacería.
      // El motivo y los IDs quedan en el log interno y en la pantalla del dueño.
      screening_blocked: "Fenrir could not verify this group. Open MyFenrir to continue.",
      sync_failed: "Fenrir could not save this group just now. Please try again."
    };
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: replies[result.ok ? "ok" : result.reason] || replies.sync_failed
    });
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

  // Referral deep link: /start ref_<code>. Record first-touch attribution for
  // this (new) user, then continue to the normal identity welcome.
  const refCode = refCodeFromStart(text);
  if (refCode) {
    const outcome = await recordReferralClick(env, refCode, String(message.from?.id || message.chat.id));
    console.log("referral_click", refCode, outcome);
    await sendIdentityWelcome(env, channel, message);
    return json({ ok: true });
  }

  // Member-facing referral surface: link + stats (invited / converted / earned).
  if (commandForThisBot(text, "referral", env) || commandForThisBot(text, "invite", env)) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: await referralPanelText(env, String(message.from?.id || message.chat.id), message.from),
      disable_web_page_preview: true
    });
    return json({ ok: true });
  }

  if (commandForThisBot(text, "panel", env)) {
    if (!isOwner(env, message.from?.id)) {
      await telegramApi(env, channel, "sendMessage", {
        chat_id: message.chat.id,
        text: "This panel is restricted."
      });
      return json({ ok: true });
    }
    await sendOwnerPanel(env, channel, message);
    return json({ ok: true });
  }

  // Community button panel + its commands (ChatKeeper-style).
  if (commandForThisBot(text, "community", env) || commandForThisBot(text, "buttons", env)) {
    await sendCommunityPanel(env, channel, message);
    return json({ ok: true });
  }
  if (commandForThisBot(text, "profile", env) || commandForThisBot(text, "member", env)) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: await memberProfileText(env, String(message.from?.id || message.chat.id), message.from)
    });
    return json({ ok: true });
  }
  if (commandForThisBot(text, "rules", env)) {
    await telegramApi(env, channel, "sendMessage", { chat_id: message.chat.id, text: communityRulesText(env) });
    return json({ ok: true });
  }
  if (commandForThisBot(text, "staff", env)) {
    await telegramApi(env, channel, "sendMessage", { chat_id: message.chat.id, text: communityStaffText(env) });
    return json({ ok: true });
  }
  // Per-community frequency for the ambient button panel. Community admins (or
  // the owner) set it: /keyboard <0-100>. No arg → shows the current value.
  if (commandForThisBot(text, "keyboard", env)) {
    const arg = text.replace(/^\/keyboard(?:@[A-Za-z0-9_]+)?\s*/i, "").trim();
    if (!/^\d{1,3}$/.test(arg)) {
      const cur = await communityKeyboardPct(env, message.chat.id);
      await telegramApi(env, channel, "sendMessage", {
        chat_id: message.chat.id,
        text: `Button panel auto-shows ${cur}% of the time in this community. Set it with /keyboard <0-100>.`
      });
      return json({ ok: true });
    }
    const allowed = isOwner(env, message.from?.id) || await isChatAdmin(env, channel, message.chat.id, message.from?.id);
    if (!allowed) {
      await telegramApi(env, channel, "sendMessage", { chat_id: message.chat.id, text: "Only community admins can change this." });
      return json({ ok: true });
    }
    const set = await setCommunityKeyboardPct(env, message.chat.id, Number(arg));
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: `Button panel auto-show set to ${set}% for this community.`
    });
    return json({ ok: true });
  }

  if (commandForThisBot(text, "redeem", env)) {
    const supplied = text.replace(/^\/redeem(?:@[A-Za-z0-9_]+)?\s*/i, "").trim();
    const telegramUserId = String(message.from?.id || message.chat.id);
    const result = await redeemCourtesyCode(env, supplied, telegramUserId, String(message.chat.id));
    let reply;
    if (result.ok) {
      const until = new Date(result.courtesyUntil).toISOString().slice(0, 10);
      reply = [
        "🎁 Courtesy access activated — The Pack.",
        "",
        `Duration: ${result.durationDays} days`,
        `Access through: ${until}`,
        "Covers 1 linked community · multi-admin · audit logs."
      ].join("\n");
    } else if (result.reason === "rate_limited") {
      reply = "Too many attempts. Please wait a few minutes and try again.";
    } else if (result.reason === "not_linked") {
      reply = "Redeem from a MyFenrir-linked Telegram account. Open MyFenrir → Link Telegram, then run /redeem again.";
    } else {
      // Generic, identical for invalid / expired / already-used (anti-enumeration).
      reply = "That code could not be redeemed. Check it and try again, or contact MyFenrir support.";
    }
    await telegramApi(env, channel, "sendMessage", { chat_id: message.chat.id, text: reply });
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
  // Ambient button panel: in group communities, occasionally (per-community
  // keyboard_show_pct, default 50%) surface the MEMBER PROFILE / RULES / STAFF
  // panel so it's discoverable without spamming every message.
  await maybeSendCommunityPanel(env, channel, message);

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/telegram/bot-health" && request.method === "GET") {
      try {
        const me = await telegramApi(env, "prod", "getMe", {});
        const webhook = await telegramApi(env, "prod", "getWebhookInfo", {});
        // WEBHOOK OWNERSHIP: the gatekeeper owns it (gate.myfenrir.com/tg).
        // This endpoint used to call setWebhook and point the bot back at this
        // worker's own origin — an unauthenticated GET that silently stole the
        // webhook from the gatekeeper, which is why the bot kept answering with
        // stale text. Diagnose only: report the drift, never repair it.
        const canonicalWebhook = `${url.origin}/api/telegram/webhook?bot=prod`;
        const registeredWebhook = normalizeText(webhook.result?.url);
        const webhookDrift = registeredWebhook !== canonicalWebhook;
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
          webhookOwner: "gatekeeper",
          webhookDrift,
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
        stripe: await stripeReady(env),
        nowpayments: Boolean(normalizeText(env.NOWPAYMENTS_API_KEY) && normalizeText(env.NOWPAYMENTS_IPN_SECRET)),
        stars: Boolean(botToken(env, "prod"))
      });
    }
    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
      try { return await handleStripeWebhook(request, env); }
      catch (error) { console.error("stripe_webhook_failed", String(error)); return json({ ok: false, error: "webhook_failed" }, { status: 500 }); }
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
          telegramWebhookSecretConfigured: Boolean(normalizeText(env.TELEGRAM_WEBHOOK_SECRET)),
          // Card-rail diagnostics. No secret material: only whether a key is
          // present, which MODE it is, and whether it actually authenticates
          // against the configured Pack price. The /upgrade card buttons render
          // only when stripeReady is true, so a test key in production silently
          // hides the entire Stripe rail — which is invisible without this.
          stripeSecretConfigured: Boolean(normalizeText(env.STRIPE_SECRET_KEY)),
          stripeKeyMode: stripeKeyMode(env),
          stripeWebhookSecretConfigured: Boolean(normalizeText(env.STRIPE_WEBHOOK_SECRET)),
          stripeReady: await stripeReady(env)
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
