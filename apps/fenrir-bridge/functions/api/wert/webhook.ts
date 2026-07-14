import { dbNotConfiguredResponse, type BillingEnv } from '../../_lib/billing-env';
import { upsertSubscription } from '../../_lib/billing-db';
import { usdPriceForPaidPlan } from '../../_lib/plan-catalog';
import { WERT_PAID_STATES, decodeWertClickId, verifyWertWebhook } from '../../_lib/wert';

/**
 * POST /api/wert/webhook — Wert.io card→crypto payment webhook.
 *
 * Contract mirrors the Stripe webhook (functions/api/stripe/webhook.ts) and the
 * ClipsFlow /webhooks/wert handler:
 *   1. Verify HMAC-SHA256 over the RAW body (X-Wert-Signature) — 401 on failure.
 *   2. Grant only on a terminal success state.
 *   3. Decode the workspace binding from click_id (fenrir:<plan>:<org>:<user>).
 *   4. Sanity-check the paid amount against the plan's server-side price so a
 *      tampered click_id can't buy a higher tier than was paid for.
 *   5. Grant through upsertSubscription — the same entitlement writer Stars and
 *      Stripe funnel into (billing_subscriptions). Idempotent by subscription id
 *      `wert:<orgId>`, so webhook replays re-apply the same grant with no side
 *      effects.
 *
 * Register this URL as the webhook target in the Wert dashboard and set
 * WERT_WEBHOOK_SECRET to the signing secret (verify the header name at
 * onboarding — this expects `X-Wert-Signature`, hex HMAC-SHA256 over the body).
 */
export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const db = context.env.DB;
  if (!db) return dbNotConfiguredResponse();

  let rawBody: string;
  try {
    rawBody = await context.request.text();
  } catch {
    return new Response('invalid body', { status: 400 });
  }

  const signature = context.request.headers.get('x-wert-signature');
  const payload = await verifyWertWebhook(rawBody, signature, context.env.WERT_WEBHOOK_SECRET);
  if (!payload) {
    return Response.json({ ok: false, error: 'bad_signature' }, { status: 401 });
  }

  const status = String(payload.status ?? payload.type ?? '').toLowerCase();
  if (!(WERT_PAID_STATES as readonly string[]).includes(status)) {
    return Response.json({ ok: true, status, granted: false });
  }

  const binding = decodeWertClickId(String(payload.click_id ?? ''));
  const orderId = String(payload.order_id ?? payload.id ?? payload.tx_id ?? '');
  if (!binding || !orderId) {
    return Response.json({ ok: true, granted: false, reason: 'incomplete' });
  }

  // Defense-in-depth: the amount is set server-side per plan, so a genuine flow
  // always matches. A short payment means a tampered click_id (e.g. plan bumped
  // to operator while paying the starter price) — refuse to grant.
  const paidAmount = Number.parseFloat(String(payload.currency_amount ?? '0')) || 0;
  const expectedUsd = usdPriceForPaidPlan(context.env, binding.plan);
  if (paidAmount + 0.01 < expectedUsd) {
    console.error('wert_amount_mismatch', {
      orderId,
      plan: binding.plan,
      paidAmount,
      expectedUsd,
    });
    return Response.json({ ok: true, granted: false, reason: 'amount_mismatch' }, { status: 200 });
  }

  try {
    await upsertSubscription(db, {
      stripe_subscription_id: `wert:${binding.orgId}`,
      frisky_org_id: binding.orgId,
      stripe_customer_id: `wert_${binding.orgId}`,
      plan: binding.plan,
      status: 'active',
      current_period_end: null,
      cancel_at_period_end: false,
    });
  } catch (error) {
    console.error('wert_webhook_grant_failed', orderId, error);
    return Response.json({ ok: false, error: 'grant_failed' }, { status: 500 });
  }

  console.log('wert_pro_granted', { orderId, org: binding.orgId, plan: binding.plan });
  return Response.json({ ok: true, granted: true, plan: binding.plan });
}
