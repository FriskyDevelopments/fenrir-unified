// Neon: única fuente de "comunidad enlazada". Ver el bloque EJE DE COBRO más
// abajo. Mismo driver y mismo secreto que workers/fenrir-allowlist-check.ts.
import { neon } from "@neondatabase/serverless";

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

/**
 * The least anyone has ever legitimately paid for The Pack in Stars.
 *
 * 250, not 1150. The Stars rail really did charge ⭐250 in July 2026
 * (FENRIR_STARS_PRICE = "250", see wrangler.fenrir-stars.toml at b08955d), and
 * three members paid it. Setting this floor to today's list price would revoke
 * people who paid exactly what was asked of them — a price rise must never
 * reach backwards.
 *
 * This is NOT the price gate. New payments are held to the current catalogue
 * price by isValidStarsPayment, which is what makes the 89 stale ⭐250 orders
 * sitting in telegram_stars_orders unpayable. This constant only decides whether
 * an entitlement row that ALREADY exists is credible enough to grant access, and
 * ⭐5 — a hand-made TEST5STARSONLY0001 payload — is not, because it was never a
 * price anyone was charged.
 *
 * Raise it only after confirming no live member paid less.
 */
const STARS_MIN_GRANT_AMOUNT = 250;

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

  // Check the PRE-DISCOUNT total. `amount_total` is what was actually charged,
  // so any promotion code makes it smaller than list price — and a 100%-off
  // coupon makes it 0. Checkout has had `allow_promotion_codes: "true"` all
  // along, so comparing amount_total meant a redeemed code produced a paid
  // subscription that this validator rejected: money taken, access denied.
  // `amount_subtotal` is the list price before discounts, which is what this
  // guard was ever trying to assert — that the session bought The Pack at the
  // canonical price, not some other price object on the same account.
  const subtotal = Number(session?.amount_subtotal ?? session?.amount_total);

  // A fully discounted subscription is never "paid": Stripe reports
  // `no_payment_required` because there was nothing to charge.
  const settled = session?.payment_status === "paid" || session?.payment_status === "no_payment_required";

  return Boolean(
    settled &&
      session?.mode === "subscription" &&
      session?.client_reference_id === orgId &&
      session?.metadata?.frisky_org_id === orgId &&
      session?.metadata?.frisky_user_id === userId &&
      session?.metadata?.plan === "standard" &&
      session?.currency === "usd" &&
      subtotal === expectedAmount &&
      session?.metadata?.offer === "founder_forever" &&
      (billingPeriod === "monthly" || billingPeriod === "annual") &&
      normalizeText(session?.subscription)
  );
}

/**
 * `expectedAmount` is the CATALOG price, and it is not optional in practice.
 *
 * This used to compare the payment only against `order.amount`, which is
 * self-referential: it proves the buyer paid what the order asked for, never
 * that the order asked for the right thing. Any order row carrying a low amount
 * — a hand-made test row, or a stale row minted under an older price — stayed
 * payable and bought the full Pack. A 5-Star order (about ten cents) unlocked
 * the same access as 1,150.
 *
 * Both checks are kept: the payment must match its own order AND that order
 * must carry the current list price. The crypto IPN has always validated
 * against its ladder this way; this rail simply never did.
 */
export function isValidStarsPayment(payment, order, telegramUserId, expectedAmount) {
  const expected = Number(expectedAmount);
  if (!Number.isFinite(expected) || expected <= 0) return false;
  return Boolean(
    payment?.invoice_payload?.startsWith("fenrir_stars:") &&
      order &&
      order.status === "pending" &&
      String(order.telegram_user_id) === String(telegramUserId) &&
      payment.currency === "XTR" &&
      payment.total_amount === Number(order.amount) &&
      Number(order.amount) === expected
  );
}

/**
 * `apiVersion` pins Stripe-Version for a single call.
 *
 * Without it every request inherits whatever version the ACCOUNT defaults to,
 * which Stripe moves on its own schedule. That is how `POST /v1/promotion_codes`
 * started rejecting `coupon` as an unknown parameter: the account had rolled
 * forward to a version where the shape changed. Pinning the version for the
 * calls whose request shape we hardcode makes them stop drifting.
 */
async function stripeRequest(env, path, params, apiVersion) {
  const key = normalizeText(env.STRIPE_SECRET_KEY);
  if (!key) throw new Error("stripe_not_configured");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(apiVersion ? { "Stripe-Version": apiVersion } : {}),
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {})
    },
    body: params ? new URLSearchParams(params) : undefined
  });
  const body = await response.json().catch(() => null);
  // Include Stripe's own `param` and `message`: a bare error code turns a
  // one-line fix ("that parameter moved") into a guessing game.
  if (!response.ok) {
    const detail = [body?.error?.code || "request_failed", body?.error?.param, body?.error?.message]
      .filter(Boolean)
      .join(" | ");
    throw new Error(`stripe_${response.status}:${detail}`);
  }
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
/**
 * Telegram fija el periodo de suscripción en 30 días y no admite otro. Ése es
 * el único vencimiento posible para el riel de Stars, y hay que escribirlo:
 * la comprobación de acceso trata `current_period_end IS NULL` como ACTIVO,
 * así que una fila sin fecha es acceso perpetuo.
 */
const STARS_PERIOD_DAYS = 30;
function starsPeriodEnd() {
  return new Date(Date.now() + STARS_PERIOD_DAYS * 86400000).toISOString();
}

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

/* ───────────────────────────────────────────────────────────────────────────
 * EJE DE COBRO — la cantidad de Stripe sigue a las comunidades ENLAZADAS.
 *
 * La oferta publicada (pack-rails.tsx, plan-catalog.ts, i18n.ts en cuatro
 * idiomas y FENRIR_STARS_DESCRIPTION) dice "$14.99/mes POR COMUNIDAD
 * ENLAZADA". El código no la cumplía: los dos rieles fijaban la cantidad a
 * mano en 1 y nada volvía a tocarla nunca. Con cero comunidades enlazadas
 * cobraba $14.99; con tres, también $14.99. Plano vendido como métrico.
 *
 * "Enlazada" es una fila VERIFICADA en cb_community_destinations (Neon). No es
 * "tiene un Gate": un Gate sin destino no protege ningún grupo, y cobrar por él
 * es cobrar por algo que no ocurrió.
 *
 * Dos límites de Stripe, COMPROBADOS contra la API en vivo — no supuestos:
 *
 *  1) Un subscription item SÍ acepta quantity 0 sobre un precio `licensed`.
 *     Previsualización de factura: HTTP 200, subtotal 0, línea
 *     "0 × MyFenrir Pack — Founder Go-Live (at $14.99 / month) | amount: 0".
 *     → Cero enlazadas PUEDE facturar cero. Ése es el objetivo del cambio.
 *
 *  2) Checkout en modo `subscription` NO acepta quantity 0:
 *       HTTP 400 · invalid_request_error · parameter_invalid_integer
 *       param=line_items[0][quantity]
 *       "This value must be greater than or equal to 1."
 *     → El alta nace forzosamente en ≥1 y se reconcilia a la baja justo
 *       después. Por eso hay DOS funciones de cantidad y no una sola.
 * ─────────────────────────────────────────────────────────────────────── */

/** Piso que impone Stripe a `line_items[n][quantity]` en Checkout. */
export const STRIPE_CHECKOUT_MIN_QUANTITY = 1;

/**
 * Cantidad REAL a facturar. Puede ser 0 — y con cero enlazadas debe serlo.
 * Todo lo que no sea un entero positivo cuenta como 0: ante la duda, no cobrar.
 */
export function billedSeatQuantity(linkedCommunities) {
  const n = Number(linkedCommunities);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Cantidad con la que puede NACER una sesión de Checkout. Idéntica a la real
 * salvo que Stripe prohíbe 0 en el alta (ver punto 2 arriba). El alta en 1 no
 * es una promesa de cobro: `syncCommunitySeatQuantity` la baja a 0 en cuanto
 * la suscripción existe si no hay ninguna comunidad enlazada.
 */
export function checkoutSeatQuantity(linkedCommunities) {
  return Math.max(STRIPE_CHECKOUT_MIN_QUANTITY, billedSeatQuantity(linkedCommunities));
}

/**
 * Prorrateo: asimétrico A PROPÓSITO.
 *
 *  - BAJA (desenlazar) → `create_prorations`: deja de cobrarse en el acto y
 *    acredita la parte no usada. Nunca se sigue cobrando por un grupo que ya
 *    no está enlazado.
 *  - ALTA (enlazar) → `none`: la comunidad nueva empieza a facturar en la
 *    renovación siguiente. Enlazar no debe disparar un cargo a mitad de ciclo
 *    que el usuario no pulsó.
 *
 * Los dos errores posibles apuntan hacia el mismo lado: no cobrar de más.
 * `null` significa que no hay nada que cambiar — la llamada a Stripe se omite.
 */
export function seatProrationBehavior(currentQuantity, nextQuantity) {
  const from = billedSeatQuantity(currentQuantity);
  const to = billedSeatQuantity(nextQuantity);
  if (from === to) return null;
  return to < from ? "create_prorations" : "none";
}

/**
 * Sólo las filas de `billing_subscriptions` que son objetos Stripe de verdad.
 * `stars:…`, `courtesy:…` y `referral:…` son ids sintéticos de otros rieles:
 * pedirle a Stripe la cantidad de uno de ésos es un 404 garantizado.
 */
export function isStripeSubscriptionId(id) {
  return /^sub_[A-Za-z0-9]+$/.test(normalizeText(id));
}

/**
 * El interruptor existe porque encender esto REESCRIBE suscripciones vivas con
 * tarjeta en archivo. Se despliega apagado; se enciende a sabiendas.
 */
function seatBillingEnabled(env) {
  return normalizeText(env?.COMMUNITY_SEAT_BILLING_ENABLED) === "true";
}

/** Comunidades enlazadas verificadas de este dueño, leídas de Neon. */
async function countLinkedCommunities(env, supabaseUserId) {
  const url = normalizeText(env?.NEON_DATABASE_URL);
  if (!url) throw new Error("neon_not_configured");
  const sql = neon(url);
  const rows = await sql`
    select count(distinct community_id)::int as linked
    from cb_community_destinations
    where user_id = ${supabaseUserId}::uuid
      and provider = 'telegram'
      and status = 'verified'
  `;
  return billedSeatQuantity(rows?.[0]?.linked);
}

/** Dueño (UUID de Supabase) de una comunidad ya enlazada, según Neon. */
async function ownerOfCommunity(env, communityId) {
  const id = normalizeText(communityId);
  if (!id) return "";
  const url = normalizeText(env?.NEON_DATABASE_URL);
  if (!url) throw new Error("neon_not_configured");
  const sql = neon(url);
  const rows = await sql`
    select user_id
    from cb_community_destinations
    where community_id = ${id}
      and provider = 'telegram'
      and status = 'verified'
    order by updated_at desc
    limit 1
  `;
  return normalizeText(rows?.[0]?.user_id);
}

/**
 * Cantidad de alta para Checkout, tolerante a fallos. Un Neon caído no puede
 * impedir una compra: si no se puede contar, se cae al piso de Stripe (1) y la
 * reconciliación posterior corrige. Nunca inventa una cantidad hacia arriba.
 */
async function checkoutSeatQuantityFor(env, supabaseUserId) {
  try {
    return checkoutSeatQuantity(await countLinkedCommunities(env, supabaseUserId));
  } catch (error) {
    console.error("checkout_seat_count_failed", error instanceof Error ? error.message : "unknown");
    return STRIPE_CHECKOUT_MIN_QUANTITY;
  }
}

/**
 * Ids de org bajo los que este humano puede estar facturado. Mismo criterio que
 * handleCommunityBillingStatus: el UUID de Supabase NO basta, porque las cuentas
 * nacidas por el riel de identidad Fenrir viven bajo un `frisky_org_…` acuñado
 * en telegram_identity_links.
 */
async function billableOrgIds(env, supabaseUserId, telegramUserId) {
  const ids = new Set();
  const uuid = normalizeText(supabaseUserId);
  if (/^[0-9a-f-]{36}$/i.test(uuid)) ids.add(uuid);
  const tg = normalizeText(telegramUserId);
  if (/^\d{5,20}$/.test(tg)) {
    const link = await env.DB.prepare(
      `SELECT frisky_org_id FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
    ).bind(tg).first().catch(() => null);
    const orgId = normalizeText(link?.frisky_org_id);
    if (orgId) ids.add(orgId);
  }
  return [...ids];
}

/**
 * Pone la cantidad de la suscripción a la altura de las comunidades enlazadas
 * de verdad. IDEMPOTENTE: cuenta `distinct community_id`, así que enlazar dos
 * veces el mismo grupo no mueve nada, y si la cantidad ya coincide no se llama
 * a Stripe.
 *
 * Nunca lanza hacia arriba: enlazar un grupo no puede fallar porque Stripe esté
 * caído. El fallo se registra y se devuelve, no se traga en silencio.
 */
export async function syncCommunitySeatQuantity(env, { supabaseUserId, telegramUserId, communityId } = {}) {
  if (!seatBillingEnabled(env)) return { ok: true, changed: false, reason: "seat_billing_disabled" };
  try {
    // El dueño se resuelve contra Neon, no se deduce del id de Telegram: el
    // mapa telegram→UUID vive en Supabase y aquí no se adivina. La fila que
    // acabamos de escribir ya dice de quién es la comunidad.
    const ownerId = normalizeText(supabaseUserId) || (await ownerOfCommunity(env, communityId));
    const orgIds = await billableOrgIds(env, ownerId, telegramUserId);
    if (orgIds.length === 0) return { ok: false, changed: false, reason: "no_billable_identity" };

    const placeholders = orgIds.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT stripe_subscription_id FROM billing_subscriptions
       WHERE frisky_org_id IN (${placeholders}) AND status = 'active'`
    ).bind(...orgIds).all();
    const subscriptionId = (rows?.results || [])
      .map((row) => normalizeText(row?.stripe_subscription_id))
      .find(isStripeSubscriptionId);
    if (!subscriptionId) return { ok: true, changed: false, reason: "no_stripe_subscription" };

    const target = await countLinkedCommunities(env, ownerId);
    const subscription = await stripeRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const item = subscription?.items?.data?.[0];
    if (!item?.id) return { ok: false, changed: false, reason: "no_subscription_item" };

    const current = billedSeatQuantity(item.quantity);
    const behavior = seatProrationBehavior(current, target);
    if (behavior === null) {
      return { ok: true, changed: false, quantity: current, reason: "already_in_sync" };
    }
    await stripeRequest(env, `/subscription_items/${encodeURIComponent(item.id)}`, {
      quantity: String(target),
      proration_behavior: behavior
    });
    return { ok: true, changed: true, from: current, quantity: target, prorationBehavior: behavior };
  } catch (error) {
    console.error("community_seat_sync_failed", error instanceof Error ? error.message : "unknown");
    return { ok: false, changed: false, reason: "sync_failed" };
  }
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

/**
 * The period end AS STRIPE REPORTS IT — never a date we invent.
 *
 * Stripe moved this field: it used to sit on the subscription, and on newer API
 * versions it lives on each subscription item. Read both, because which one a
 * webhook carries depends on the API version pinned to the account/endpoint,
 * and guessing wrong silently yields no date — which is the perpetual-licence
 * bug all over again.
 */
function stripeSubscriptionPeriodEnd(subscription) {
  const candidates = [
    subscription?.current_period_end,
    ...(Array.isArray(subscription?.items?.data)
      ? subscription.items.data.map((item) => item?.current_period_end)
      : [])
  ];
  // Latest end across items: an item ending later still entitles the customer.
  const seconds = candidates
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];
  if (seconds) return new Date(seconds * 1000).toISOString();

  // Stripe always sends a period end for a live subscription, so reaching here
  // means the payload shape changed again. Do NOT fall through to NULL: an
  // access check reads NULL as active forever. Grant one billing interval and
  // shout — the next invoice.payment_succeeded corrects it from Stripe's data.
  const interval = normalizeText(subscription?.items?.data?.[0]?.plan?.interval) || "month";
  const days = interval === "year" ? 366 : interval === "week" ? 8 : 31;
  console.error("stripe_subscription_missing_period_end", normalizeText(subscription?.id), interval);
  return new Date(Date.now() + days * 86400000).toISOString();
}

/**
 * Write what Stripe says about a subscription.
 *
 * `current_period_end` is ALWAYS bound to a real date. The previous card rail
 * inserted the literal NULL here, and because the entitlement check treats
 * `current_period_end IS NULL` as active, every card subscriber held a
 * perpetual licence that survived cancellation.
 *
 * Existing rows are updated by subscription id even without metadata — a
 * renewal or cancellation must land on the row it belongs to. A row is only
 * CREATED when the subscription carries the Pack metadata, so an unrelated
 * subscription on the same Stripe account can never mint access here.
 */
async function upsertStripeSubscriptionRow(env, subscription, fallbackOrgId = "") {
  const subscriptionId = normalizeText(subscription?.id);
  if (!subscriptionId) return false;

  const status = normalizeText(subscription?.status) || "active";
  const periodEnd = stripeSubscriptionPeriodEnd(subscription);
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end ? 1 : 0;
  const customerId =
    normalizeText(typeof subscription?.customer === "string" ? subscription.customer : subscription?.customer?.id) ||
    `stripe_${subscriptionId}`;
  const ts = nowIso();

  const existing = await env.DB
    .prepare(`SELECT frisky_org_id FROM billing_subscriptions WHERE stripe_subscription_id = ? LIMIT 1`)
    .bind(subscriptionId)
    .first();

  const orgId =
    normalizeText(existing?.frisky_org_id) ||
    normalizeText(subscription?.metadata?.frisky_org_id) ||
    normalizeText(fallbackOrgId);

  // No row yet and no Pack metadata to prove whose this is: ignore it rather
  // than invent an owner.
  if (!existing && (!orgId || normalizeText(subscription?.metadata?.plan) !== "standard")) return false;
  if (!orgId) return false;

  await env.DB.prepare(
    `INSERT INTO billing_subscriptions (
       stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
       current_period_end, cancel_at_period_end, created_at, updated_at
     ) VALUES (?, ?, ?, 'standard', ?, ?, ?, ?, ?)
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET
       plan = 'standard',
       status = excluded.status,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       stripe_customer_id = excluded.stripe_customer_id,
       updated_at = excluded.updated_at`
  ).bind(subscriptionId, orgId, customerId, status, periodEnd, cancelAtPeriodEnd, ts, ts).run();
  return true;
}

/** Fetch the subscription from Stripe so the period end is Stripe's, not ours. */
async function fetchStripeSubscription(env, subscriptionId) {
  const id = normalizeText(subscriptionId);
  if (!id.startsWith("sub_")) return null;
  try {
    return await stripeRequest(env, `/subscriptions/${encodeURIComponent(id)}`);
  } catch (error) {
    console.error("stripe_subscription_fetch_failed", id, String(error));
    return null;
  }
}

/** The subscription id on an invoice, across old and new Stripe API shapes. */
function invoiceSubscriptionId(invoice) {
  const direct = typeof invoice?.subscription === "string" ? invoice.subscription : invoice?.subscription?.id;
  return normalizeText(direct || invoice?.parent?.subscription_details?.subscription || "");
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
      // Read the subscription back from Stripe: the checkout session does not
      // carry the billing period, and this row's expiry must be Stripe's own
      // date. This insert used to bind the literal NULL, which the entitlement
      // check reads as active forever.
      const subscription = await fetchStripeSubscription(env, session.subscription);
      if (subscription) {
        await upsertStripeSubscriptionRow(env, subscription, orgId);
      } else {
        console.error("stripe_checkout_subscription_unreadable", normalizeText(session.id));
      }
      // Referral attribution (Stripe/web rail): reward the referrer if this paid
      // checkout carried a ref_code. Idempotent + self-referral blocked.
      await recordStripeReferral(env, normalizeText(session?.metadata?.ref_code), orgId);
    }
  }

  // Renewal clock. Without these the row froze at whatever the first checkout
  // wrote: a renewed subscription expired anyway, and a cancelled one kept its
  // access. Every one of them takes the date from Stripe's subscription object.
  if (
    event?.type === "customer.subscription.created" ||
    event?.type === "customer.subscription.updated" ||
    event?.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data?.object;
    if (event.type === "customer.subscription.deleted") {
      // Do not delete the row — end it. `canceled` fails the entitlement check
      // on its own, and the row stays as the record of what was sold.
      await env.DB.prepare(
        `UPDATE billing_subscriptions
            SET status = 'canceled', updated_at = ?
          WHERE stripe_subscription_id = ?`
      ).bind(nowIso(), normalizeText(subscription?.id)).run();
    } else {
      await upsertStripeSubscriptionRow(env, subscription);
    }
  }

  // The renewal that actually matters: money arrived, so the period moved.
  // Re-read the subscription rather than trusting the invoice's own period,
  // which describes the invoice line, not the subscription clock.
  if (event?.type === "invoice.payment_succeeded" || event?.type === "invoice.paid") {
    const subscriptionId = invoiceSubscriptionId(event.data?.object);
    if (subscriptionId) {
      const subscription = await fetchStripeSubscription(env, subscriptionId);
      if (subscription) await upsertStripeSubscriptionRow(env, subscription);
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
    // Nunca vuelvas a clavar "1" aquí. La cantidad es el eje de cobro: son las
    // comunidades enlazadas. Stripe prohíbe 0 en el alta (ver EJE DE COBRO), así
    // que el alta nace en ≥1 y syncCommunitySeatQuantity la reconcilia después.
    "line_items[0][quantity]": String(await checkoutSeatQuantityFor(env, userId)),
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
  // Confirm-on-return backup for the webhook. Same rule: the expiry is Stripe's
  // date, read off the subscription. This used to bind NULL, which the
  // entitlement check reads as access that never ends.
  const subscription = await fetchStripeSubscription(env, session.subscription);
  if (!subscription) return json({ ok: false, error: "subscription_unreadable" }, { status: 502 });
  const written = await upsertStripeSubscriptionRow(env, subscription, orgId);
  if (!written) return json({ ok: false, error: "subscription_not_recorded" }, { status: 502 });
  return json({
    ok: true,
    plan: "standard",
    status: normalizeText(subscription.status) || "active",
    currentPeriodEnd: stripeSubscriptionPeriodEnd(subscription)
  });
}

async function handleCommunityBillingStatus(request, env) {
  if (!billingRequestAuthorized(request, env)) return json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const userId = normalizeText(body?.userId);
  const telegramUserId = normalizeText(body?.telegramUserId);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ ok: false, error: "invalid_identity" }, { status: 400 });

  // Org ids this caller may legitimately be billed under.
  //
  // `userId` alone is NOT enough. community-bridge sends the Supabase auth UUID
  // and (see founders-billing.functions.ts) assumes orgId === userId. For any
  // account created through the Fenrir identity rail that assumption is false:
  // telegram_identity_links stores minted ids like
  // `frisky_org_FRISKYUSRSUPABASE9_…`, and billing_subscriptions is keyed by
  // THAT, not by the UUID.
  //
  // Result before this fix: two surfaces disagreed about the same entitlement.
  // The bot read telegram_stars_entitlements by Telegram id and said
  // "The Pack · active"; this endpoint looked for frisky_org_id = <UUID>, found
  // nothing, returned paid:false → the web app demanded an upgrade the operator
  // had already paid for. The `plan` column was never the problem: 'standard' IS
  // The Pack (see functions/_lib/plan-catalog.ts) and no query filters on it.
  //
  // telegram_identity_links is the canonical map from Telegram identity to
  // Fenrir org id — memberProfileText already resolves it this way. Trusting it
  // here does not widen access: the caller already proved it owns this Telegram
  // id server-side before calling, and this endpoint is behind the billing
  // secret. We only ADD the linked org id; the UUID lookup still works for
  // accounts where org id and UUID genuinely coincide.
  let identityLink = null;
  if (/^\d{5,20}$/.test(telegramUserId)) {
    const [entitlement, link] = await Promise.all([
      getEntitlement(env, telegramUserId),
      env.DB.prepare(
        `SELECT frisky_user_id, frisky_org_id
         FROM telegram_identity_links
         WHERE telegram_user_id = ?
         LIMIT 1`
      ).bind(telegramUserId).first()
    ]);
    identityLink = link;
    const identityMatches =
      identityLink?.frisky_user_id === userId && identityLink?.frisky_org_id === userId;
    // Same amount floor as applyStarsMembership. This is a third, independent
    // path that mints a billing_subscriptions row from an entitlement, and it
    // trusted `status` alone — so an underpaid entitlement row could be laundered
    // into a paid subscription right here, bypassing the grant-time check.
    const entitlementPaidEnough = Number(entitlement?.stars_amount) >= STARS_MIN_GRANT_AMOUNT;
    if (entitlement?.status === "active" && identityMatches && entitlementPaidEnough) {
      const ts = nowIso();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO billing_subscriptions (
            stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
            current_period_end, cancel_at_period_end, created_at, updated_at
          ) VALUES (?, ?, ?, 'standard', 'active', ?, 0, ?, ?)
          ON CONFLICT(stripe_subscription_id) DO UPDATE SET
            frisky_org_id = excluded.frisky_org_id, status = 'active', plan = 'standard',
            current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`
        ).bind(`stars:${telegramUserId}`, userId, `stars_${telegramUserId}`, starsPeriodEnd(), ts, ts),
        env.DB.prepare(
          `UPDATE telegram_stars_entitlements SET frisky_org_id = ?, frisky_user_id = ?, plan = 'standard', updated_at = ? WHERE telegram_user_id = ?`
        ).bind(userId, userId, ts, telegramUserId)
      ]);
    }
  }

  const orgIds = [userId];
  const linkedOrgId = normalizeText(identityLink?.frisky_org_id);
  if (linkedOrgId && !orgIds.includes(linkedOrgId)) orgIds.push(linkedOrgId);

  // `current_period_end` is compared as TEXT, so both sides must be the same
  // shape. Rows written by this Worker are ISO-8601 with a 'T' and a 'Z'; a row
  // hand-patched in the console can end up as '2026-09-23 02:35:22' (SQLite
  // datetime() style). A space sorts BEFORE 'T', so a same-day expiry in the
  // patched shape compares as already expired. Comparing against the space
  // variant too keeps a hand-patched row honest instead of silently dropping a
  // day of paid access. Neither form is NULL, which is the rule that matters:
  // an access check treats current_period_end IS NULL as active forever.
  const now = nowIso();
  const nowSqlite = now.replace("T", " ").slice(0, 19);
  const placeholders = orgIds.map(() => "?").join(",");
  const subscription = await env.DB.prepare(
    `SELECT plan, status FROM billing_subscriptions
     WHERE frisky_org_id IN (${placeholders}) AND status IN ('active','trialing','past_due')
       AND (current_period_end IS NULL OR current_period_end > ? OR current_period_end > ?)
     ORDER BY updated_at DESC LIMIT 1`
  ).bind(...orgIds, now, nowSqlite).first();
  return json({
    ok: true,
    paid: Boolean(subscription),
    plan: subscription?.plan || "free",
    status: subscription?.status || null
  });
}

const normalizeText = (value) => (value || "").trim();
const BRIDGE_TARGET = "managed MyFenrir Gate";
// MyFenrir 360 identity loop lives on Fenrir Bridge /main (D1 deep-link).
// Community Bridge's dashboard paste-code screen is a dead end — no live bot
// issues those 6-character codes.
const MYFENRIR_APP_URL = "https://www.myfenrir.com/main";
const MYFENRIR_FRONTEND_URL = "https://fenrir-bridge.pages.dev/gate/app";
const BOT_OS_WELCOME_VIDEO_URL = "https://www.myfenrir.com/bot-os/media/fenrir-welcome.mp4";
// Approved no-audio celebration clip for a successful Telegram-identity link.
// Sent via sendAnimation (autoplay GIF). Reuses an existing approved bot-os clip.
const BOT_OS_LINK_SUCCESS_ANIM_URL = "https://www.myfenrir.com/bot-os/media/fenrir-access.mp4";
const LINK_SUCCESS_CAPTION = [
  "🐺 *Linked in.* Your Telegram is now bound to your Frisky ID.",
  "",
  "Open MyFenrir anytime from this chat. There is no code to copy.",
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
  // Carry Telegram's own error_code and description. A bare
  // `telegram_api_failed:sendInvoice` in the logs says something broke but not
  // what, and the Telegram webhook swallows throws to avoid retry spam — so
  // this string is often the only trace a failure leaves.
  if (!response.ok || !data?.ok) {
    const detail = [data?.error_code, data?.description].filter(Boolean).join(" ");
    throw new Error(`telegram_api_failed:${method}${detail ? `:${detail}` : ""}`);
  }
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

/**
 * One answer to "may this person use the product", for the whole bot.
 *
 * getEntitlement alone was never that answer. It reads ONE table —
 * telegram_stars_entitlements — so the bot could only see access bought with
 * Stars. Courtesy grants, crypto and card subscriptions all live in
 * billing_subscriptions under a minted `frisky_org_*` id, and the bot never
 * looked there. Anyone holding those was treated as a prospect and shown the
 * upgrade pitch: the same two-identifier-spaces split that made the web app
 * demand an upgrade from a paying member.
 *
 * The owner check comes FIRST and touches no payment row at all. An owner is an
 * owner whether or not they ever paid, so this must not be reachable through a
 * billing table — otherwise voiding a stale test payment turns the owner into a
 * prospect, which is exactly what would have happened here.
 *
 * The shape stays entitlement-like (`status`, `stars_amount`) so every existing
 * `entitlement?.status === "active"` caller keeps working unchanged.
 */
async function resolveBotAccess(env, telegramUserId) {
  const id = String(telegramUserId || "");

  if (isOwner(env, id)) {
    return { status: "active", access_source: "owner", stars_amount: null, until: null };
  }

  const [entitlement, link] = await Promise.all([
    getEntitlement(env, id),
    env.DB.prepare(
      `SELECT frisky_org_id FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
    ).bind(id).first()
  ]);

  // Stars: active AND actually paid enough. ⭐5 was 'active' and bought nothing.
  const paid = Number(entitlement?.stars_amount);
  if (entitlement?.status === "active" && paid >= STARS_MIN_GRANT_AMOUNT) {
    return { ...entitlement, status: "active", access_source: "stars", stars_amount: paid, until: null };
  }

  // Every other rail — courtesy, crypto, card — via the identity link.
  const orgId = normalizeText(link?.frisky_org_id);
  if (orgId) {
    const sub = await env.DB.prepare(
      `SELECT stripe_subscription_id, plan, status, current_period_end
         FROM billing_subscriptions
        WHERE frisky_org_id = ? AND status IN ('active','trialing','past_due')
        ORDER BY updated_at DESC LIMIT 1`
    ).bind(orgId).first();

    if (sub) {
      // A row with no end date is NOT access. That is the perpetual-licence bug
      // this codebase has already shipped twice; the bot will not be the third
      // place that reads NULL as "forever".
      if (!sub.current_period_end) {
        console.error("bot_access_row_without_period_end", id, String(sub.stripe_subscription_id));
      } else if (Date.parse(String(sub.current_period_end).replace(" ", "T")) > Date.now()) {
        return {
          ...(entitlement || {}),
          status: "active",
          access_source: "subscription",
          stars_amount: Number.isFinite(paid) ? paid : null,
          until: sub.current_period_end
        };
      }
    }
  }

  // No access. Keep the entitlement fields so the status reply can still explain
  // an underpaid payment sitting on the account.
  return {
    ...(entitlement || {}),
    status: "inactive",
    access_source: null,
    stars_amount: Number.isFinite(paid) ? paid : null,
    until: null
  };
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

  // Second gate, independent of the first. isValidStarsPayment guards the door
  // at payment time; this guards the grant itself, because an entitlement row
  // can also arrive by hand — which is exactly how a 5-Star row ended up marked
  // active and unlocking the full Pack. Access is a function of what was paid,
  // so read the amount here instead of trusting `status`.
  //
  // The floor is a CONSTANT, not starsPrice(env). Raising the list price must
  // never retroactively revoke someone who paid the price that was current when
  // they bought. Lower this only if a genuinely cheaper tier is ever sold.
  const paidStars = Number(entitlement.stars_amount);
  if (!Number.isFinite(paidStars) || paidStars < STARS_MIN_GRANT_AMOUNT) {
    console.error(
      "stars_grant_refused_underpaid",
      String(telegramUserId),
      "paid",
      String(entitlement.stars_amount),
      "floor",
      String(STARS_MIN_GRANT_AMOUNT)
    );
    return { applied: false, reason: "underpaid" };
  }

  const plan = normalizeText(env.FENRIR_STARS_PLAN).toLowerCase() || "standard";
  const safePlan = plan === "pro" || plan === "operator" ? plan : "standard";
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO billing_subscriptions (
        stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
        current_period_end, cancel_at_period_end, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?)
      ON CONFLICT(stripe_subscription_id) DO UPDATE SET
        frisky_org_id = excluded.frisky_org_id,
        stripe_customer_id = excluded.stripe_customer_id,
        plan = excluded.plan,
        status = 'active',
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = 0,
        updated_at = excluded.updated_at`
    ).bind(`stars:${telegramUserId}`, link.frisky_org_id, `stars_${telegramUserId}`, safePlan, starsPeriodEnd(), ts, ts),
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
// Windows an owner may grant. 182 is the canonical "6 months" — deliberately
// the SAME number as NOWPAYMENTS_LADDER.half.days, so a courtesy 6-month grant
// and a paid crypto 6-month grant land on identical date arithmetic. 180 stays
// legal so callback_data already in flight keeps working (nada se borra).
const COURTESY_DURATION_DAYS = [30, 90, 180, 182];
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

// Owner mint over HTTP. Identical rail, table and single-use guarantees as the
// /panel button — this only removes the requirement to be sitting in Telegram
// to mint one, so a code can be issued from an ops runbook.
//
// Gated by FENRIR_ADMIN_TOKEN, deliberately NOT the community-bridge billing
// secret: minting free access is an owner action, not a billing-service one, so
// a leaked billing secret must not be able to print free Packs.
//
// The plaintext is returned exactly once and never persisted — only its HMAC
// lands in D1, same as the Telegram path. Redemption stays on Telegram /redeem,
// which is where identity (telegram_identity_links) is actually proven.
async function handleCourtesyGenerate(request, env) {
  // COURTESY_MINT_TOKEN is the dedicated credential for this endpoint;
  // FENRIR_ADMIN_TOKEN keeps working as the owner-wide fallback. Separate secret
  // so mint rights can be rotated without touching anything else that trusts the
  // admin token. If NEITHER is set the endpoint is inert — 401, never open.
  const configured = normalizeText(env.COURTESY_MINT_TOKEN) || normalizeText(env.FENRIR_ADMIN_TOKEN);
  const supplied = normalizeText(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (!configured || !supplied || configured !== supplied) {
    return json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const days = Number(body?.durationDays);
  if (!COURTESY_DURATION_DAYS.includes(days)) {
    return json({ ok: false, error: "invalid_duration", allowed: COURTESY_DURATION_DAYS }, { status: 400 });
  }
  const actor = normalizeText(String(body?.createdBy || "")) || "owner_http";
  const { code } = await createCourtesyCode(env, days, actor);
  return json({ ok: true, code, durationDays: days, redeem: `/redeem ${code}` });
}

/**
 * Owner-gated Stripe billing operations.
 *
 * Exists so the live Stripe secret never has to leave the Worker. Everything
 * here is done WITH the key the Worker already holds; nobody has to copy it into
 * a shell, a runbook or a chat window to inspect billing or mint a coupon.
 *
 * Gated by COURTESY_MINT_TOKEN / FENRIR_ADMIN_TOKEN — the same owner credential
 * as the courtesy mint, and deliberately not the billing-service secret.
 */
/**
 * Pinned for the calls whose request shape is hardcoded here. The account's own
 * default version moves on Stripe's schedule, which is what made
 * POST /v1/promotion_codes start rejecting `coupon` as an unknown parameter.
 */
const STRIPE_OPS_API_VERSION = "2024-06-20";

const STRIPE_REQUIRED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded"
];

async function handleStripeOps(request, env) {
  const configured = normalizeText(env.COURTESY_MINT_TOKEN) || normalizeText(env.FENRIR_ADMIN_TOKEN);
  const supplied = normalizeText(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (!configured || !supplied || configured !== supplied) {
    return json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const action = normalizeText(body?.action);

  if (action === "inspect") {
    const priceId = foundersPriceId(env, "monthly");
    const price = await stripeRequest(env, `/prices/${encodeURIComponent(priceId)}`);
    const product = await stripeRequest(env, `/products/${encodeURIComponent(normalizeText(price?.product))}`);
    const endpoints = await stripeRequest(env, "/webhook_endpoints?limit=20");
    return json({
      ok: true,
      price: {
        id: price?.id,
        active: price?.active,
        unit_amount: price?.unit_amount,
        currency: price?.currency,
        recurring: price?.recurring?.interval,
        product: price?.product
      },
      product: { id: product?.id, name: product?.name, active: product?.active },
      webhooks: (endpoints?.data || []).map((endpoint) => ({
        id: endpoint.id,
        url: endpoint.url,
        status: endpoint.status,
        api_version: endpoint.api_version,
        enabled_events: endpoint.enabled_events,
        missing: STRIPE_REQUIRED_EVENTS.filter(
          (name) => !(endpoint.enabled_events || []).includes(name) && !(endpoint.enabled_events || []).includes("*")
        )
      }))
    });
  }

  // Subscribe our own endpoint to the renewal events. Without these the row
  // freezes at the first checkout: renewals never extend it and cancellations
  // never end it.
  if (action === "ensure_events") {
    const endpoints = await stripeRequest(env, "/webhook_endpoints?limit=20");
    const target = (endpoints?.data || []).find((endpoint) =>
      normalizeText(endpoint.url).includes("fenrir-stars-payments")
    );
    if (!target) return json({ ok: false, error: "webhook_endpoint_not_found" }, { status: 404 });
    const merged = Array.from(new Set([...(target.enabled_events || []), ...STRIPE_REQUIRED_EVENTS]));
    const params = { url: target.url };
    merged.forEach((name, index) => {
      params[`enabled_events[${index}]`] = name;
    });
    const updated = await stripeRequest(env, `/webhook_endpoints/${encodeURIComponent(target.id)}`, params);
    return json({ ok: true, id: updated?.id, url: updated?.url, enabled_events: updated?.enabled_events });
  }

  // Coupon + promotion code for a 6-month comp on The Pack.
  //
  // percent_off 100 / duration repeating / duration_in_months 6 means Stripe
  // itself stops discounting after the sixth invoice and starts charging — the
  // subscription clock keeps running the whole time, so this grants six free
  // months, not perpetual access. Scoped to the Pack product so the code cannot
  // be applied to anything else on this account.
  if (action === "create_promo") {
    const code = normalizeText(body?.code).toUpperCase();
    if (!/^[A-Z0-9]{4,24}$/.test(code)) {
      return json({ ok: false, error: "invalid_code_format" }, { status: 400 });
    }
    const months = Number(body?.durationInMonths) || 6;
    const maxRedemptions = Number(body?.maxRedemptions) || 1;

    const priceId = foundersPriceId(env, "monthly");
    const price = await stripeRequest(env, `/prices/${encodeURIComponent(priceId)}`);
    const productId = normalizeText(price?.product);
    if (!productId) return json({ ok: false, error: "pack_product_not_found" }, { status: 404 });

    // Reuse an identical coupon instead of minting a second one. A failed
    // promotion-code call used to leave an orphan coupon behind on every retry.
    const existingCoupons = await stripeRequest(env, "/coupons?limit=100", null, STRIPE_OPS_API_VERSION);
    const reusable = (existingCoupons?.data || []).find(
      (candidate) =>
        candidate?.valid &&
        Number(candidate?.percent_off) === 100 &&
        candidate?.duration === "repeating" &&
        Number(candidate?.duration_in_months) === months &&
        normalizeText(candidate?.metadata?.issued_by) === "fenrir-stars-payments" &&
        (candidate?.applies_to?.products || []).includes(productId)
    );

    const coupon =
      reusable ||
      (await stripeRequest(
        env,
        "/coupons",
        {
          percent_off: "100",
          duration: "repeating",
          duration_in_months: String(months),
          name: `The Pack · ${months} months comp`,
          "applies_to[products][0]": productId,
          "metadata[issued_by]": "fenrir-stars-payments",
          "metadata[purpose]": "owner_comp"
        },
        STRIPE_OPS_API_VERSION
      ));

    const promo = await stripeRequest(
      env,
      "/promotion_codes",
      {
        coupon: normalizeText(coupon?.id),
        code,
        max_redemptions: String(maxRedemptions)
      },
      STRIPE_OPS_API_VERSION
    );

    return json({
      ok: true,
      code: promo?.code,
      promotion_code_id: promo?.id,
      coupon_id: coupon?.id,
      percent_off: coupon?.percent_off,
      duration: coupon?.duration,
      duration_in_months: coupon?.duration_in_months,
      applies_to_product: productId,
      max_redemptions: promo?.max_redemptions,
      active: promo?.active
    });
  }

  // Reconcile D1 against Stripe. Stripe is the source of truth for the billing
  // clock, so this walks the live subscriptions and re-writes each row through
  // the same path the webhook uses.
  //
  // Two jobs: repair anything the old NULL-writing code left behind or dropped
  // entirely, and prove the write path against real Stripe objects rather than
  // a fixture. `dryRun` reports what it would do and touches nothing.
  if (action === "resync") {
    const dryRun = body?.dryRun !== false;
    const list = await stripeRequest(env, "/subscriptions?status=all&limit=100");
    const report = [];
    for (const subscription of list?.data || []) {
      const row = await env.DB
        .prepare(`SELECT frisky_org_id, status, current_period_end FROM billing_subscriptions WHERE stripe_subscription_id = ? LIMIT 1`)
        .bind(normalizeText(subscription.id))
        .first();
      const entry = {
        id: subscription.id,
        stripe_status: subscription.status,
        stripe_period_end: stripeSubscriptionPeriodEnd(subscription),
        metadata_org: normalizeText(subscription?.metadata?.frisky_org_id) || null,
        metadata_plan: normalizeText(subscription?.metadata?.plan) || null,
        row_exists: Boolean(row),
        row_period_end: row?.current_period_end ?? null,
        row_period_end_is_null: Boolean(row) && row.current_period_end === null
      };
      if (!dryRun) entry.written = await upsertStripeSubscriptionRow(env, subscription);
      report.push(entry);
    }
    return json({ ok: true, dryRun, stripe_subscriptions: report.length, report });
  }

  // Stars dry run. `createInvoiceLink` takes the SAME invoice body as
  // sendInvoice and returns the same validation errors, but produces a link
  // instead of messaging anyone — so the exact production payload can be
  // exercised against Telegram without a chat, a notification or a charge.
  //
  // Needed because a failing sendInvoice is invisible from outside: telegramApi
  // throws, and the Telegram webhook swallows every throw to keep answering 200
  // (otherwise Telegram retries and the bot spams). The raw Telegram response
  // is returned verbatim here rather than summarised.
  if (action === "stars_probe") {
    const channel = normalizeText(body?.channel) === "dev" ? "dev" : "prod";
    const token = botToken(env, channel);
    if (!token) return json({ ok: false, error: "missing_telegram_token", channel }, { status: 503 });

    const amount = starsPrice(env);
    // A probe payload, never written to telegram_stars_orders — this creates no
    // order because no one is paying it.
    const probePayload = `fenrir_stars:probe:${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const invoiceBody = starsInvoiceBody(env, probePayload, amount);

    const call = async (payload) => {
      const response = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      return { http: response.status, body: await response.json().catch(() => null) };
    };

    const withSubscription = await call(invoiceBody);
    // If the subscription form fails, try the one-shot form. Which of the two
    // fails tells you whether the bot lacks Stars subscriptions specifically or
    // Stars entirely — a distinction the error text alone does not give you.
    const { subscription_period: _omit, ...oneShotBody } = invoiceBody;
    const withoutSubscription = withSubscription.body?.ok ? null : await call(oneShotBody);

    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      .then((response) => response.json())
      .catch(() => null);

    return json({
      ok: true,
      channel,
      bot: me?.result?.username || null,
      amount,
      currency: invoiceBody.currency,
      payload_matches_ipn_regex: /^fenrir_stars:/.test(probePayload),
      subscription_form: withSubscription,
      one_shot_form: withoutSubscription
    });
  }

  // Read a real Checkout Session back, verbatim. Needed to see what Stripe
  // actually built — in particular the currency and amounts, which Adaptive
  // Pricing can convert away from the list price the validator expects.
  if (action === "inspect_session") {
    const sessionId = normalizeText(body?.sessionId);
    if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
      return json({ ok: false, error: "invalid_session" }, { status: 400 });
    }
    const s = await stripeRequest(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    return json({
      ok: true,
      id: s?.id,
      mode: s?.mode,
      status: s?.status,
      payment_status: s?.payment_status,
      currency: s?.currency,
      amount_subtotal: s?.amount_subtotal,
      amount_total: s?.amount_total,
      currency_conversion: s?.currency_conversion ?? null,
      client_reference_id: s?.client_reference_id,
      metadata: s?.metadata ?? null,
      subscription: s?.subscription ?? null,
      would_validate: isValidFoundersStripeSession(
        s,
        normalizeText(s?.metadata?.frisky_user_id),
        normalizeText(s?.metadata?.frisky_org_id)
      )
    });
  }

  // What the payment keyboard actually renders, straight from the deployed
  // code. Lets the buttons and their destinations be checked without messaging
  // anyone and without taking anyone's word for it.
  if (action === "pay_rails") {
    return json({
      ok: true,
      english: { text: payRailsText(false), reply_markup: payRailsKeyboard() },
      spanish: { text: payRailsText(true), reply_markup: payRailsKeyboard() }
    });
  }

  // Every keyboard the bot can attach, rendered from the deployed code, so the
  // buttons and their destinations can be checked without messaging anyone.
  if (action === "keyboards") {
    const fakeConnect = (reason) => connectResultReply(env, reason ? { ok: false, reason } : { ok: true });
    return json({
      ok: true,
      bot: botUsername(env),
      pay_rails: payRailsKeyboard(),
      status: statusKeyboard(),
      redeem: redeemKeyboard(env, "EXAMPLECODE12"),
      connect: {
        ok: fakeConnect(null),
        bot_permissions_missing: fakeConnect("bot_permissions_missing"),
        telegram_identity_not_linked: fakeConnect("telegram_identity_not_linked"),
        sync_failed: fakeConnect("sync_failed"),
        actor_not_admin: fakeConnect("actor_not_admin"),
        not_a_group: fakeConnect("not_a_group"),
        screening_blocked: fakeConnect("screening_blocked"),
        sync_not_configured: fakeConnect("sync_not_configured")
      }
    });
  }

  // What the bot would decide for a given Telegram id, without messaging them.
  // `pitch` is the whole question: does this person get sold to, or not.
  if (action === "bot_access") {
    const id = normalizeText(String(body?.telegramUserId || ""));
    if (!/^\d{5,20}$/.test(id)) return json({ ok: false, error: "invalid_telegram_id" }, { status: 400 });
    const access = await resolveBotAccess(env, id);
    const active = access?.status === "active";
    return json({
      ok: true,
      telegramUserId: id,
      status: access?.status ?? null,
      access_source: access?.access_source ?? null,
      stars_amount: access?.stars_amount ?? null,
      until: access?.until ?? null,
      pitch: !active,
      reply: active ? alreadyActiveText(access, false) : payRailsText(false)
    });
  }

  return json({ ok: false, error: "unknown_action" }, { status: 400 });
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
        { text: "6 months", callback_data: "courtesy_gen:182" }
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
  // El grupo ya está enlazado y verificado: AHORA la cantidad facturada tiene
  // que reflejarlo. Va después del alta y nunca la bloquea — si Stripe falla,
  // el grupo queda enlazado igual y la reconciliación se reintenta al próximo
  // enlace. Idempotente: reenlazar el mismo grupo no mueve la cantidad.
  const seats = await syncCommunitySeatQuantity(env, {
    communityId: telegramCommunityId(chat.id),
    telegramUserId: String(actorId)
  });
  if (!seats.ok) console.error("community_seat_sync_after_link", seats.reason || "unknown");

  return { ok: true, communityId: telegramCommunityId(chat.id), screening: screening.state, seats };
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

function myFenrirOpenKeyboard({ miniApp = false } = {}) {
  const rows = [[{ text: "Open MyFenrir", url: MYFENRIR_APP_URL }]];
  if (miniApp) {
    rows.push([{ text: "Open MyFenrir Mini App", web_app: { url: MYFENRIR_APP_URL } }]);
  }
  return { inline_keyboard: rows };
}

async function enableMyFenrirMiniApp(env, channel, chatId) {
  try {
    await telegramApi(env, channel, "setChatMenuButton", {
      ...(chatId ? { chat_id: chatId } : {}),
      menu_button: {
        type: "web_app",
        text: "Open MyFenrir",
        web_app: { url: MYFENRIR_APP_URL }
      }
    });
  } catch (error) {
    console.error("set_chat_menu_button_failed", String(error));
  }
}

function maskEmail(email) {
  const [local, domain] = normalizeText(email).split("@");
  if (!local || !domain) return "MyFenrir account";
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

async function sendIdentityWelcome(env, channel, message) {
  await enableMyFenrirMiniApp(env, channel, message.chat.id);
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
        "Your verified Telegram identity is ready.",
        "",
        "Open MyFenrir from this chat whenever you need the dashboard."
      ].join("\n"),
      reply_markup: myFenrirOpenKeyboard()
    });
    return;
  }

  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: [
      `🐺 Welcome, ${name}.`,
      "",
      "Your Telegram identity is not linked yet.",
      "Open MyFenrir, sign in, then tap Link Telegram ID. There is no code to copy."
    ].join("\n"),
    reply_markup: myFenrirOpenKeyboard({ miniApp: true })
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

/**
 * The invoice body, in one place.
 *
 * Telegram Stars invoice canon: currency XTR, `provider_token` OMITTED (an
 * empty string is not the same as absent — it previously returned
 * PROVIDER_ACCOUNT_INVALID), exactly ONE entry in `prices`, and no
 * shipping/address/phone/email/need_* /is_flexible fields.
 * `subscription_period` is REQUIRED for a recurring Stars subscription:
 * without it Telegram charges ONCE while we advertise "$14.99/month".
 * 2592000 seconds (30 days) is the only value Telegram accepts.
 *
 * Shared with the ops probe so the diagnostic exercises the SAME body the bot
 * sends — a probe that builds its own params proves nothing about production.
 */
function starsInvoiceBody(env, payload, amount) {
  return {
    title: env.FENRIR_STARS_TITLE || "The Pack · MyFenrir",
    description:
      env.FENRIR_STARS_DESCRIPTION ||
      "The Pack — $14.99/month. Multi-admin and audit logs. Billed monthly in Telegram Stars.",
    payload,
    currency: "XTR",
    prices: [{ label: env.FENRIR_STARS_LABEL || "The Pack", amount }],
    subscription_period: 2592000
  };
}

async function sendStarsInvoice(env, channel, message) {
  const amount = starsPrice(env);
  const payload = await createOrder(env, String(message.from?.id || message.chat.id), String(message.chat.id), amount);
  await telegramApi(env, channel, "sendInvoice", {
    chat_id: message.chat.id,
    ...starsInvoiceBody(env, payload, amount)
    // `protect_content` deliberately NOT sent. It was the only field here
    // outside the documented Stars canon, it buys nothing on a payment box
    // (there is no content to protect from forwarding), and it is the one
    // parameter that differs between this call and the createInvoiceLink probe
    // — which Telegram accepts with this exact body, subscription_period and
    // all. Keep the body minimal; that rule already saved this invoice once
    // (provider_token).
  });
}

/**
 * Open the Stars payment box, and only claim it opened if it did.
 *
 * The old order was: promise first ("payment box opening…"), then attempt the
 * invoice. telegramApi throws on a Telegram error and the webhook swallows every
 * throw to keep returning 200 — so a failed sendInvoice left the operator
 * staring at a promise that never happened, with nothing in the logs he could
 * see. Invoice first; speak only about what actually occurred.
 */
async function openStarsCheckout(env, channel, message) {
  const chatId = message?.chat?.id;
  try {
    await sendStarsInvoice(env, channel, message);
    return true;
  } catch (error) {
    const reason = String(error);
    console.error("stars_invoice_failed", reason, "chat", String(chatId), "type", String(message?.chat?.type));

    // Fallback: an invoice LINK. createInvoiceLink takes the same body and has
    // no chat_id, so it survives the cases sendInvoice does not — a group chat,
    // or a chat where the bot may not post an invoice directly. Tapping the
    // link opens the same Stars box. Verified working against this exact body.
    try {
      const amount = starsPrice(env);
      const payload = await createOrder(env, String(message.from?.id || chatId), String(chatId), amount);
      const link = await telegramApi(env, channel, "createInvoiceLink", starsInvoiceBody(env, payload, amount));
      const url = normalizeText(link?.result);
      if (url) {
        await telegramApi(env, channel, "sendMessage", {
          chat_id: chatId,
          text: "The Pack · ⭐1,150 per month. Tap to open the Telegram Stars box.",
          reply_markup: { inline_keyboard: [[{ text: "⭐ Pay with Telegram Stars", url }]] }
        });
        console.error("stars_invoice_link_fallback_used", reason);
        return true;
      }
    } catch (fallbackError) {
      console.error("stars_invoice_link_failed", String(fallbackError));
    }

    // Both forms failed. Say so plainly rather than promising a box.
    await telegramApi(env, channel, "sendMessage", {
      chat_id: chatId,
      text: [
        "The Telegram Stars box did not open.",
        "",
        "Nothing was charged. You can pay the same $14.99 by card or crypto in MyFenrir → Upgrade.",
        "This has been logged for Fenrir to fix."
      ].join("\n")
    }).catch(() => {});
    return false;
  }
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

/**
 * The Stars deep link fired by the /upgrade Stars rail
 * (pack-rails.tsx → t.me/<bot>?start=fenrir_stars → "/start fenrir_stars").
 *
 * Exported so the routing ORDER can be asserted in a test. menuIntent() also
 * matches this exact string — it swallows every `/start` regardless of payload —
 * so whichever branch the webhook checks FIRST wins. When the Stars branch sat
 * below menuIntent, the button answered with the Community control onboarding
 * card and no invoice was ever sent. See the guard in the webhook handler.
 */
export function isStarsDeepLink(text) {
  return /^\/start(?:@[A-Za-z0-9_]+)?\s+fenrir_stars\b/i.test(String(text || ""));
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
      text: "Linking happens in a private chat, for security.\n\nTap below and Fenrir will pick it up there.",
      // A group button cannot open a private chat by itself — the deep link can.
      ...(botUsername(env)
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔗 Link FriskyDev ID", url: `https://t.me/${botUsername(env)}?start=account` }]
              ]
            }
          }
        : {})
    });
    return;
  }

  await enableMyFenrirMiniApp(env, channel, message.chat.id);

  const telegramUserId = String(message.from?.id || message.chat.id);
  const linked = await env.DB.prepare(
    `SELECT email FROM telegram_identity_links WHERE telegram_user_id = ? LIMIT 1`
  ).bind(telegramUserId).first();

  if (linked) {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: [
        "✅ Your Telegram identity is already linked.",
        "",
        `MyFenrir account · ${maskEmail(linked.email)}`,
        "Open MyFenrir from this chat whenever you need the dashboard."
      ].join("\n"),
      reply_markup: myFenrirOpenKeyboard()
    });
    return;
  }

  await telegramApi(env, channel, "sendMessage", {
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
      // Paso 3 depende del derecho de acceso. Antes era texto fijo, así que a
      // alguien con The Pack activo esta misma tarjeta le decía "Plan: The Pack
      // · activo" arriba y "Enlazar una comunidad requiere The Pack" abajo: dos
      // lecturas opuestas del mismo derecho, en el mismo mensaje. Quien ya pagó
      // leía eso como que su pago no se aplicó.
      active ? "3 · Tu plan ya cubre esto" : "3 · Elige tu plan cuando lo necesites",
      active
        ? "The Pack está activo en esta cuenta: ya puedes enlazar una comunidad, con multi-admin y auditoría. No hay nada más que pagar."
        : "Gratis incluye 5 gates para armar y probar. Enlazar una comunidad requiere The Pack: US$14.99/mes, con multi-admin y auditoría.",
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
    // Step 3 follows the entitlement. It used to be fixed copy, so this same
    // card told an operator with The Pack active "Plan: The Pack · active" at
    // the top and "Linking a community requires The Pack" at the bottom — two
    // opposite readings of one right, in one message. Someone who had already
    // paid read that as their payment never having applied.
    active ? "3 · Your plan already covers this" : "3 · Choose a plan when you need it",
    active
      ? "The Pack is active on this account: you can link a community now, with multi-admin workflows and audit logs. There is nothing further to pay."
      : "Free includes 5 gates to build and test. Linking a community requires The Pack: US$14.99/month, with multi-admin and audit logs.",
    "",
    "You can create your first Gate without paying or setting up DNS.",
    "",
    "Choose an action below to continue."
  ].join("\n");
}

/**
 * The three rails as buttons.
 *
 * Asking someone to type “buy” before they may pay is friction invented for no
 * reason: Telegram has inline keyboards precisely so a purchase is one tap.
 * The typed commands still work — they are just never the only way in.
 *
 * Order is the price canon and not cosmetic: CARD FIRST, Stars second as the
 * commodity rail, crypto third. Same list price on all three.
 *
 * Only Stars can complete inside Telegram — `fenrir_subscribe` opens the box in
 * this chat. Card and crypto need the signed-in web session that holds the
 * buyer's identity, so those buttons open Upgrade, which is where those rails
 * live. `?rail=` is a hint for that page; nothing reads it yet.
 */
const UPGRADE_URL = "https://communities.myfenrir.com/upgrade";

export function payRailsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "💳 Card · $14.99/month", url: `${UPGRADE_URL}?rail=card` }],
      [{ text: "⭐ Telegram Stars · 1,150", callback_data: "fenrir_subscribe" }],
      [{ text: "₿ Crypto · $14.99/month", url: `${UPGRADE_URL}?rail=crypto` }]
    ]
  };
}

/**
 * Copy for the rails. Money, never percentages — a buyer cannot pay a
 * percentage, and "+5%" is the kind of number people feel misled by later.
 * NOWPayments' fee on $14.99 is about $0.75, and NOWPayments shows the exact
 * figure on its own screen before anyone pays.
 */
export function payRailsText(spanish) {
  if (spanish) {
    return [
      "The Pack · $14.99 al mes por comunidad enlazada.",
      "",
      "💳 Tarjeta — $14.99. Apple Pay y Google Pay incluidos.",
      "⭐ Telegram Stars — ⭐1,150, el equivalente. Se cobra cada 30 días.",
      "₿ Cripto — $14.99, el mismo precio. NOWPayments suma su comisión, unos $0.75, y te enseña la cifra exacta antes de que pagues.",
      "",
      "Elige abajo. Fenrir activa el acceso sólo cuando el pago está confirmado."
    ].join("\n");
  }
  return [
    "The Pack · $14.99 a month per linked community.",
    "",
    "💳 Card — $14.99. Apple Pay and Google Pay included.",
    "⭐ Telegram Stars — ⭐1,150, the equivalent. Billed every 30 days.",
    "₿ Crypto — $14.99, the same price. NOWPayments adds its processing fee, about $0.75, and shows you the exact figure before you pay.",
    "",
    "Pick one below. Fenrir activates access only once the payment is confirmed."
  ].join("\n");
}

/**
 * What to say to someone who already has access and asked to pay.
 *
 * Not a pitch and not a wall of features — what they can do with what they
 * already hold. The source matters: an owner should never read a sentence about
 * a subscription, and someone on courtesy should be told when it runs out
 * rather than discovering it on the day.
 */
export function alreadyActiveText(access, spanish) {
  const source = access?.access_source;
  const until = access?.until ? String(access.until).slice(0, 10) : null;

  if (spanish) {
    if (source === "owner") {
      return [
        "Eres dueño de Fenrir. No hay nada que comprar.",
        "",
        "Tienes The Pack completo: comunidades enlazadas sin tope, multi-admin y auditoría.",
        "/panel genera códigos de cortesía · /status revisa cualquier cuenta."
      ].join("\n");
    }
    return [
      "Ya tienes The Pack activo. No hace falta pagar de nuevo.",
      ...(until ? ["", `Vigente hasta ${until}.`] : []),
      "",
      "Enlaza una comunidad desde MyFenrir → My Gates, o usa /status para ver el detalle."
    ].join("\n");
  }

  if (source === "owner") {
    return [
      "You own Fenrir. There is nothing here for you to buy.",
      "",
      "You hold the full Pack: linked communities with no numeric cap, multi-admin workflows and audit logs.",
      "/panel mints courtesy codes · /status checks any account."
    ].join("\n");
  }
  return [
    "The Pack is already active on this account. There is nothing to pay.",
    ...(until ? ["", `Active through ${until}.`] : []),
    "",
    "Link a community from MyFenrir → My Gates, or run /status for the detail."
  ].join("\n");
}

/**
 * Buttons for the moments that used to end in "now go type a command".
 *
 * Every one of these keeps its typed command working. The button is never the
 * only way in — it is just the way that does not require remembering a word
 * while you are in another window, halfway through something else.
 *
 * `/connect` is the worst of them: the operator has just left Telegram's admin
 * screen, and the instruction to run a command is the last thing they read
 * before the flow dies. A retry button costs one tap and no memory.
 */
function connectRetryKeyboard(env, { link = false } = {}) {
  const user = botUsername(env);
  const rows = [[{ text: "🔄 Try again", callback_data: "fenrir_connect" }]];
  // Linking happens in a private chat with the bot; a group button cannot do it,
  // so this deep-links there instead of naming a command.
  if (link && user) {
    rows.push([{ text: "🔗 Link MyFenrir", url: `https://t.me/${user}?start=account` }]);
  }
  return { inline_keyboard: rows };
}

/** One tap to redeem, instead of copying a code out of a message by hand. */
function redeemKeyboard(env, code) {
  const user = botUsername(env);
  if (!user) return undefined;
  return {
    inline_keyboard: [[{ text: "🎟 Redeem this code", url: `https://t.me/${user}?start=redeem_${code}` }]]
  };
}

/** `/start redeem_<CODE>` — the deep link behind that button. */
export function redeemDeepLinkCode(text) {
  const match = String(text || "").match(/^\/start(?:@[A-Za-z0-9_]+)?\s+redeem_([A-Za-z0-9]{8,16})\b/i);
  return match ? match[1] : null;
}

/**
 * The redemption outcome, worded once. Shared by the typed `/redeem <CODE>` and
 * by the one-tap deep link, so the two can never drift apart.
 *
 * Invalid, expired and already-used still collapse into one generic sentence —
 * that is deliberate anti-enumeration, not vagueness.
 */
export function courtesyRedeemReply(result) {
  if (result?.ok) {
    const until = new Date(result.courtesyUntil).toISOString().slice(0, 10);
    return [
      "🎁 Courtesy access activated — The Pack.",
      "",
      `Duration: ${result.durationDays} days`,
      `Access through: ${until}`,
      "Covers 1 linked community · multi-admin · audit logs."
    ].join("\n");
  }
  if (result?.reason === "rate_limited") return "Too many attempts. Please wait a few minutes and try again.";
  if (result?.reason === "not_linked") {
    return "Redeem from a MyFenrir-linked Telegram account.\n\nLink Telegram first, then tap the code again.";
  }
  return "That code could not be redeemed. Check it and try again, or contact MyFenrir support.";
}

/** Only `not_linked` is something the person can act on from here. */
function redeemFailureKeyboard(env, reason) {
  const user = botUsername(env);
  if (reason !== "not_linked" || !user) return undefined;
  return { inline_keyboard: [[{ text: "🔗 Link MyFenrir", url: `https://t.me/${user}?start=account` }]] };
}

/** Where "run /status for the detail" used to send people. */
function statusKeyboard() {
  return { inline_keyboard: [[{ text: "📊 My access", callback_data: "fenrir_status" }]] };
}

/**
 * One reply for a /connect outcome, whether it came from the command or from
 * the bot being made admin. Both used to word the same failures differently and
 * both ended in "type it again".
 *
 * Only the recoverable outcomes get a retry. Offering "try again" for something
 * the user cannot fix — a missing server secret, a blocked screening — is worse
 * than saying nothing: it invites them to tap forever.
 */
function connectResultReply(env, result) {
  const reason = result?.ok ? "ok" : result?.reason;
  const replies = {
    ok: {
      text: "✅ This group is verified.\n\nOpen MyFenrir → My Gates and choose it from the verified Telegram group selector."
    },
    actor_not_admin: {
      text: "Only a Telegram group admin can verify this group.\n\nAsk an admin of this group to tap below."
    },
    telegram_identity_not_linked: {
      text: "Your MyFenrir account is not linked to Telegram yet.\n\nLink it first, then come back here and tap Try again.",
      reply_markup: connectRetryKeyboard(env, { link: true })
    },
    bot_permissions_missing: {
      text: "Fenrir needs to be an admin here with Invite Users switched on.\n\nTurn it on in this group's admin settings, then tap below.",
      reply_markup: connectRetryKeyboard(env)
    },
    not_a_group: {
      text: "Run this inside the Telegram group you want Fenrir to protect — it does not work in a private chat."
    },
    screening_blocked: {
      text: "Fenrir could not verify this group. Open MyFenrir to continue."
    },
    sync_not_configured: {
      text: "Group verification is not configured yet. Please contact the MyFenrir team."
    },
    sync_failed: {
      text: "Fenrir could not save this group just now. Nothing is lost — tap below to retry.",
      reply_markup: connectRetryKeyboard(env)
    }
  };
  const reply = replies[reason] || replies.sync_failed;
  // actor_not_admin is recoverable by a DIFFERENT person, so it gets the button
  // too — the admin who can act is usually reading the same group.
  if (reason === "actor_not_admin") return { ...reply, reply_markup: connectRetryKeyboard(env) };
  return reply;
}

async function sendPayRails(env, channel, message, spanish) {
  await telegramApi(env, channel, "sendMessage", {
    chat_id: message.chat.id,
    text: payRailsText(spanish),
    reply_markup: payRailsKeyboard()
  });
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
  const reply_markup = myFenrirOpenKeyboard();
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
      text: "🐺 Linked in. Your Telegram is now bound to your Frisky ID. Open MyFenrir from this chat — there is no code to copy.",
      reply_markup
    });
  }
}

function fallbackMind(text, entitlement) {
  if (menuIntent(text)) return modularMenuText(text, entitlement);

  if (statusIntent(text)) {
    // `status === 'active'` alone is not access. The grant paths now require the
    // paid amount to clear STARS_MIN_GRANT_AMOUNT, and this line must agree with
    // them — an entitlement row worth 5 Stars once reported "Access: unlocked"
    // while being nowhere near the price of The Pack.
    //
    // `Stars:` is the amount PAID, read from the entitlement row. It has never
    // been an account balance, and it must not be mistaken for one.
    // `entitlement` is already resolved by resolveBotAccess: it knows about the
    // owner allowlist and about courtesy / crypto / card rows, not only Stars.
    // Report the source, because "active" via ownership and "active" via a Stars
    // payment are different facts and a member can tell the difference.
    const paid = Number(entitlement?.stars_amount);
    const source = entitlement?.access_source;
    const unlocked = entitlement?.status === "active";
    const until = entitlement?.until ? String(entitlement.until).slice(0, 10) : null;
    const via = {
      owner: { en: "Ownership", es: "Propiedad" },
      stars: { en: "Telegram Stars", es: "Telegram Stars" },
      subscription: { en: "Subscription", es: "Suscripción" }
    }[source] || { en: "—", es: "—" };
    // An underpaid Stars payment on file, with no access from any other rail.
    const underpaid = !unlocked && Number.isFinite(paid) && paid > 0;

    if (spanishIntent(text)) {
      if (unlocked) {
        return [
          "Fenrir Protocol esta activo.",
          "",
          "Acceso: activo",
          `Via: ${via.es}`,
          ...(source === "stars" ? [`Pagado: ⭐${paid}`] : []),
          ...(until ? [`Vigente hasta: ${until}`] : [])
        ].join("\n");
      }
      if (underpaid) {
        return `Fenrir Protocol todavia no esta activo.\n\nSe registro un pago de ⭐${paid}, por debajo de los ⭐1,150 que cuesta The Pack, asi que no desbloquea acceso.\n/subscribe abre la caja por el precio correcto.`;
      }
      return "Fenrir Protocol todavia no esta activo.\n\n$14.99/mes.\nTarjeta y cripto en MyFenrir → Upgrade. /subscribe abre la caja de Telegram Stars (⭐1,150).";
    }
    if (unlocked) {
      return [
        "Fenrir Protocol is active.",
        "",
        "Access: unlocked",
        `Via: ${via.en}`,
        ...(source === "stars" ? [`Paid: ⭐${paid}`] : []),
        ...(until ? [`Active through: ${until}`] : [])
      ].join("\n");
    }
    if (underpaid) {
      return `Fenrir Protocol is not active yet.\n\nA payment of ⭐${paid} is on record, below the ⭐1,150 The Pack costs, so it does not unlock access.\n/subscribe opens the box at the correct price.`;
    }
    return "Fenrir Protocol is not active yet.\n\n$14.99/month.\nCard and crypto in MyFenrir → Upgrade. /subscribe opens the Telegram Stars box (⭐1,150).";
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
      "Free gives you 5 gates to test. Linking a community requires The Pack ($14.99/month)."
      // The three ways to pay arrive as buttons with this reply, not as a word
      // the buyer has to guess and type.
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
    const entitlement = await resolveBotAccess(env, query.from?.id || callbackMessage.chat.id);

    // Owner-only: generate a single-use courtesy code (30 / 90 / 180 days).
    if (typeof query.data === "string" && query.data.startsWith("courtesy_gen:")) {
      if (!isOwner(env, query.from?.id)) {
        await telegramApi(env, channel, "answerCallbackQuery", { callback_query_id: query.id, text: "Restricted." });
        return json({ ok: true });
      }
      const days = Number(query.data.split(":")[1]);
      if (!COURTESY_DURATION_DAYS.includes(days)) {
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
        ].join("\n"),
        // The owner usually mints a code to hand to someone else. Forwarding a
        // message with a button beats asking them to retype a 12-character code.
        reply_markup: redeemKeyboard(env, code)
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

    // Retry /connect without retyping it. `from` is the person who tapped, so
    // the admin check inside syncVerifiedTelegramDestination still judges the
    // right actor — a non-admin tapping this is rejected exactly as before.
    if (query.data === "fenrir_connect") {
      const result = await syncVerifiedTelegramDestination(env, channel, {
        chat: callbackMessage.chat,
        from: query.from
      });
      await telegramApi(env, channel, "sendMessage", {
        chat_id: callbackMessage.chat.id,
        ...connectResultReply(env, result)
      });
      return json({ ok: true });
    }

    if (query.data === "fenrir_subscribe") {
      // `from` MUST be the person who tapped, not query.message.from — on a
      // button attached to a bot message that is the BOT. createOrder would then
      // stamp the order with the bot's id, and isValidStarsPayment compares the
      // order's telegram_user_id against the real payer, so the payment would be
      // rejected after the money moved.
      //
      // No "opening the box" line before the attempt either: openStarsCheckout
      // speaks only about what actually happened, and falls back to an invoice
      // link if sendInvoice fails.
      await openStarsCheckout(env, channel, {
        chat: callbackMessage.chat,
        from: query.from,
        text: ""
      });
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

  // ---------------------------------------------------------------------
  // Alta automática del grupo: promover al bot ES la señal de registro.
  //
  // El gatekeeper —dueño del webhook— reenvía `my_chat_member` hasta aquí,
  // porque `/connect` y `syncVerifiedTelegramDestination` viven en este worker.
  // Sin este bloque el reenvío llegaba y moría: más abajo se lee
  // `update.message`, que en un `my_chat_member` es `undefined`, así que el
  // update caía al vacío sin ejecutar nada ni dejar rastro. La cadena existía
  // entera menos su último eslabón.
  //
  // `my_chat_member` trae `chat` y `from` al mismo nivel que un `message`, así
  // que se pasa tal cual a `syncVerifiedTelegramDestination`: `from` es quien
  // promovió al bot, y sirve igual para resolver identidad.
  // ---------------------------------------------------------------------
  if (update.my_chat_member) {
    const membership = update.my_chat_member;
    const chatType = membership.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") return json({ ok: true });

    // Sólo la TRANSICIÓN a "puede invitar" dispara el alta. Sin esto, cada
    // reentrega de Telegram volvería a escribir en el grupo. El owner tiene los
    // permisos implícitos y Telegram no siempre los enumera.
    const canInvite = (member) =>
      member?.status === "creator" ||
      member?.status === "owner" ||
      (member?.status === "administrator" && member?.can_invite_users === true);
    const wasReady = canInvite(membership.old_chat_member);
    const isReady = canInvite(membership.new_chat_member);

    if (!isReady) {
      // Se hizo admin pero sin permiso de invitar: es el error más común y el
      // operador no tiene forma de adivinarlo. Se avisa una sola vez, en la
      // transición a administrator, no en cada reentrega.
      const becameAdmin =
        membership.new_chat_member?.status === "administrator" &&
        membership.old_chat_member?.status !== "administrator";
      if (becameAdmin) {
        await telegramApi(env, channel, "sendMessage", {
          chat_id: membership.chat.id,
          // The operator is one screen away from Telegram's permission toggles.
          // Asking them to come back and type a command is where this flow died.
          text: "Fenrir is an admin here but cannot invite yet.\n\nTurn on Invite Users in this group's admin settings, then tap below.",
          reply_markup: connectRetryKeyboard(env)
        });
      }
      return json({ ok: true });
    }
    if (wasReady) return json({ ok: true });

    const result = await syncVerifiedTelegramDestination(env, channel, membership);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: membership.chat.id,
      ...connectResultReply(env, result)
    });
    return json({ ok: true });
  }

  const message = update.message;
  if (message?.successful_payment) {
    const payment = message.successful_payment;
    const order = await getOrder(env, payment.invoice_payload);
    const telegramUserId = String(message.from?.id || message.chat.id);
    const valid = isValidStarsPayment(payment, order, telegramUserId, starsPrice(env));
    if (!valid) {
      console.error(
        "stars_payment_validation_failed",
        telegramUserId,
        "paid",
        String(payment?.total_amount),
        "order",
        String(order?.amount),
        "expected",
        String(starsPrice(env))
      );
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

  const entitlement = await resolveBotAccess(env, message.from?.id || message.chat.id);

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
      text: "Map your destination in the protected group: make @Myfenrir_bot an admin with Invite Users, then run /connect there. Fenrir will verify the group and show it on communities.myfenrir.com — not www.myfenrir.com/main."
    });
    return json({ ok: true });
  }
  if (walkthroughStart === "readiness") {
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: "Readiness check: your Gate can issue private invites only after the protected group is verified. In that group, make @Myfenrir_bot an admin with Invite Users and run /connect. Then continue on communities.myfenrir.com."
    });
    return json({ ok: true });
  }

  // Stars deep link from the /upgrade Stars rail (pack-rails.tsx sends the
  // operator to t.me/<bot>?start=fenrir_stars).
  //
  // This MUST stay here, with the other /start payloads, and ABOVE menuIntent().
  // menuIntent() matches /^\/(start|menu|help)\b/ — it swallows EVERY /start,
  // payload and all. While the only Stars branch lived further down (next to
  // /subscribe), `/start fenrir_stars` never reached it: it hit the menu first
  // and returned, so clicking "Pay with Telegram Stars" answered with the
  // Community control onboarding card instead of opening the payment box.
  // Every other deep link (account / discover / mapping / readiness / gate /
  // link_ / gate_ / ref_) was already handled above menuIntent; this one was
  // the single outlier. Do not move it below menuIntent again.
  if (isStarsDeepLink(text)) {
    await openStarsCheckout(env, channel, message);
    return json({ ok: true });
  }

  // `/start redeem_<CODE>` — the button attached to a freshly minted courtesy
  // code. Same rule as the Stars deep link: it MUST sit above menuIntent, which
  // swallows every /start regardless of payload.
  const deepLinkCode = redeemDeepLinkCode(text);
  if (deepLinkCode) {
    const telegramUserId = String(message.from?.id || message.chat.id);
    const result = await redeemCourtesyCode(env, deepLinkCode, telegramUserId, String(message.chat.id));
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: courtesyRedeemReply(result),
      ...(result.ok ? {} : { reply_markup: redeemFailureKeyboard(env, result.reason) })
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
    // Shared with the my_chat_member path. The two used to word the same
    // failures differently, and both ended by naming a command to retype.
    //
    // screening_blocked still names nobody and never says someone was blocked:
    // the first is a public accusation, the second turns the group into a
    // manhunt. The reason and the ids stay in the internal log and on the
    // owner's screen.
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      ...connectResultReply(env, result)
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
        text: "This Fenrir link code is expired or invalid. Open MyFenrir, tap Link Telegram ID, and generate a fresh Telegram link.",
        reply_markup: myFenrirOpenKeyboard({ miniApp: true })
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
    // Same wording as the one-tap deep link — one helper, so the two paths
    // cannot drift.
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: courtesyRedeemReply(result),
      ...(result.ok ? {} : { reply_markup: redeemFailureKeyboard(env, result.reason) })
    });
    return json({ ok: true });
  }

  if (menuIntent(text)) {
    await sendBotMenu(env, channel, message, entitlement);
    return json({ ok: true });
  }

  // Nobody who already has access gets sold to — not the owner, not a courtesy
  // holder, not a paying member. Selling The Pack to the person who owns the
  // product, or to someone already paying for it, is not a UX wrinkle: it means
  // the bot could not see the access they hold.
  const alreadyIn = entitlement?.status === "active";

  // Explicit Stars intent — /subscribe, /unlock, or the Stars deep link — opens
  // the Stars box directly. The buyer already chose the rail.
  if (/^\/subscribe\b/i.test(text) || /^\/unlock\b/i.test(text) || isStarsDeepLink(text)) {
    if (alreadyIn) {
      await telegramApi(env, channel, "sendMessage", {
        chat_id: message.chat.id,
        text: alreadyActiveText(entitlement, spanishIntent(text)),
        reply_markup: statusKeyboard()
      });
      return json({ ok: true });
    }
    await openStarsCheckout(env, channel, message);
    return json({ ok: true });
  }

  // Anything that merely means "I want to pay" gets the CHOICE, not one rail.
  // This used to drop straight into the Stars box, which quietly made Stars the
  // default and contradicted the canon that card comes first.
  if (paymentIntent(text)) {
    if (alreadyIn) {
      await telegramApi(env, channel, "sendMessage", {
        chat_id: message.chat.id,
        text: alreadyActiveText(entitlement, spanishIntent(text)),
        reply_markup: statusKeyboard()
      });
      return json({ ok: true });
    }
    await sendPayRails(env, channel, message, spanishIntent(text));
    return json({ ok: true });
  }

  if (setupIntent(text)) {
    const answer = fallbackMind(text, entitlement);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: answer,
      // The setup path ends at "linking a community requires The Pack". Ending
      // there with no way to act on it is what produced the magic-word prompt
      // this keyboard replaces.
      ...(entitlement?.status === "active" ? {} : { reply_markup: payRailsKeyboard() })
    });
    return json({ ok: true });
  }

  if (pricingIntent(text)) {
    const answer = fallbackMind(text, entitlement);
    await telegramApi(env, channel, "sendMessage", {
      chat_id: message.chat.id,
      text: answer,
      // Someone asking the price is the single most likely person to buy. Do
      // not make them find the next step on their own.
      ...(entitlement?.status === "active" ? {} : { reply_markup: payRailsKeyboard() })
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
    if (url.pathname === "/api/internal/stripe/ops" && request.method === "POST") {
      try { return await handleStripeOps(request, env); }
      catch (error) { console.error("stripe_ops_failed", String(error)); return json({ ok: false, error: "stripe_ops_failed", detail: String(error) }, { status: 502 }); }
    }
    if (url.pathname === "/api/internal/courtesy/generate" && request.method === "POST") {
      try { return await handleCourtesyGenerate(request, env); }
      catch (error) { console.error("courtesy_generate_failed", String(error)); return json({ ok: false, error: "courtesy_generate_failed" }, { status: 500 }); }
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
