import { dbNotConfiguredResponse, type BillingEnv } from '../../_lib/billing-env';
import { upsertSubscription } from '../../_lib/billing-db';
import { decodeClickId, verifyWebhook, WERT_PAID_STATES } from '../../_lib/wert';

/**
 * POST /api/wert/webhook
 * Wert.io card→crypto callback → grant the entitlement. Same contract as the
 * Stripe webhook and the Stars payment handler: verify signature, resolve the
 * buyer, then converge on upsertSubscription() (billing_subscriptions, keyed by
 * frisky_org_id).
 *
 *   • Signature: HMAC-SHA256 (X-Wert-Signature, hex, over the raw body).
 *   • Identity:  click_id = fenrir:<plan>:<frisky_org_id> (set server-side in
 *                /api/wert/session from the authenticated session).
 *   • Idempotent: the row is keyed on the synthetic id `wert:<order_id>` and the
 *                 grant is non-additive, so redelivery re-upserts the same row.
 *
 * Wert is a ONE-TIME on-ramp (no recurring billing), so — exactly like the
 * existing Telegram Stars grant — we set status=active with current_period_end
 * null. (Stars and Wert share this "one-time, non-expiring until changed"
 * behavior; there is no auto-expiry job today.)
 */
export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const db = context.env.DB;
  if (!db) return dbNotConfiguredResponse();

  let rawBody: string;
  try {
    rawBody = await context.request.text();
  } catch {
    return new Response('invalid body', { status: 400 });
  }

  const signature = context.request.headers.get('x-wert-signature');
  const payload = await verifyWebhook(rawBody, signature, context.env.WERT_WEBHOOK_SECRET);
  if (!payload) {
    return new Response('invalid signature', { status: 401 });
  }

  const status = String(payload.status ?? payload.type ?? '');
  const clickId = String(payload.click_id ?? '');
  const orderId = String(payload.order_id ?? payload.tx_id ?? clickId ?? '');

  const decoded = decodeClickId(clickId);
  if (!decoded) {
    console.error('wert_webhook_bad_click_id', clickId);
    // 200 so Wert stops retrying a permanently-unbindable event.
    return Response.json({ ok: true, granted: false, reason: 'bad_click_id' });
  }

  if (!WERT_PAID_STATES.includes(status)) {
    // Acknowledge non-terminal / non-paid events without granting.
    return Response.json({ ok: true, granted: false, status });
  }

  await upsertSubscription(db, {
    stripe_subscription_id: `wert:${orderId}`,
    frisky_org_id: decoded.friskyOrgId,
    stripe_customer_id: `wert_${decoded.friskyOrgId}`,
    plan: decoded.plan,
    status: 'active',
    current_period_end: null,
    cancel_at_period_end: false,
  });

  console.log('wert_pro_granted', { org: decoded.friskyOrgId, plan: decoded.plan, order: orderId });
  return Response.json({ ok: true, granted: true, plan: decoded.plan });
};
