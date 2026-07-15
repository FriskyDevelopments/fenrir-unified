// Temporal-driven Stripe reconciliation — replaces webhook-push reconciliation.
// A Temporal worker polls Stripe and POSTs {event_ids} here, HMAC-signed with
// RECONCILE_SHARED_SECRET. We NEVER trust caller payloads: each event is
// re-fetched from Stripe authoritatively, reduced to its subscription, and
// applied via the same persistSubscriptionFromStripe used by the webhook.
// Idempotent via tryClaimStripeEvent (same D1 ledger). No STRIPE_WEBHOOK_SECRET.
import Stripe from 'stripe';
import { getStripe } from '../../_lib/stripe';
import { missingEnvResponse, type BillingEnv } from '../../_lib/billing-env';
import { releaseStripeEvent, tryClaimStripeEvent } from '../../_lib/billing-db';
import { persistSubscriptionFromStripe } from '../stripe/webhook';

const RELEVANT = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

function subscriptionIdFromEvent(event: Stripe.Event): string | null {
  const obj = event.data.object as Record<string, unknown>;
  if (event.type === 'checkout.session.completed') {
    const s = obj as unknown as Stripe.Checkout.Session;
    if (s.mode !== 'subscription') return null;
    return typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null);
  }
  if (event.type.startsWith('customer.subscription.')) {
    return (obj as unknown as Stripe.Subscription).id ?? null;
  }
  if (event.type === 'invoice.payment_failed') {
    const ref = (obj as unknown as Stripe.Invoice).subscription;
    return typeof ref === 'string' ? ref : (ref?.id ?? null);
  }
  return null;
}

async function verifySignature(secret: string, rawBody: string, header: string | null) {
  if (!header) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time-ish compare
  if (hex.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(context: {
  request: Request;
  env: BillingEnv & { RECONCILE_SHARED_SECRET?: string };
}) {
  const secret = context.env.RECONCILE_SHARED_SECRET?.trim();
  if (!secret) return missingEnvResponse('RECONCILE_SHARED_SECRET');
  if (!context.env.DB) return missingEnvResponse('DB');

  const rawBody = await context.request.text();
  const ok = await verifySignature(
    secret,
    rawBody,
    context.request.headers.get('X-Reconcile-Signature')
  );
  if (!ok) return Response.json({ ok: false, error: 'bad_signature' }, { status: 401 });

  let ids: string[];
  try {
    const parsed = JSON.parse(rawBody) as { event_ids?: unknown };
    ids = Array.isArray(parsed.event_ids)
      ? parsed.event_ids.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return Response.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }
  ids = ids.slice(0, 50);

  const stripe = getStripe(context.env);
  const result = { applied: [] as string[], skipped: [] as string[], failed: [] as string[] };

  for (const id of ids) {
    if (!(await tryClaimStripeEvent(context.env.DB, id))) {
      result.skipped.push(id);
      continue;
    }
    try {
      const event = await stripe.events.retrieve(id); // authoritative — caller payload never trusted
      if (!RELEVANT.has(event.type)) {
        result.skipped.push(id);
        continue;
      }
      const subId = subscriptionIdFromEvent(event);
      if (!subId) {
        result.skipped.push(id);
        continue;
      }
      const sub = await stripe.subscriptions.retrieve(subId);
      await persistSubscriptionFromStripe(context.env, stripe, sub);
      result.applied.push(id);
    } catch (error) {
      console.error('reconcile_event_failed', id, error);
      await releaseStripeEvent(context.env.DB, id); // retryable next sweep
      result.failed.push(id);
    }
  }
  return Response.json({ ok: true, ...result });
}
