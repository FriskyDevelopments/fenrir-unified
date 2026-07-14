/**
 * _lib/wert — Wert.io card→crypto checkout for Fenrir / MyFenrir.
 *
 * Wert lets a user pay with a card and we receive crypto (USDC) in a receiving
 * wallet. It sits beside Telegram Stars (in-bot) and Stripe (card subscriptions,
 * scaffolded) as an additional processor — same `billing_subscriptions`
 * entitlement, granted through the same `upsertSubscription` writer the Stars
 * and Stripe paths use.
 *
 * Two halves:
 *   • wertWidgetOptions() – builds the @wert-io/widget-initializer config
 *     (partner_id, commodity/network, currency_amount, and a `click_id` that
 *     carries the frisky_org_id / frisky_user_id / plan so the webhook can bind
 *     the payment to the right workspace WITHOUT a lookup table).
 *   • verifyWertWebhook() – validates Wert's HMAC-SHA256 webhook signature
 *     (X-Wert-Signature, hex over the RAW body) before any entitlement is granted.
 *
 * Everything is gated DARK until partner onboarding: wertEnabled() is false
 * unless WERT_PARTNER_ID and WERT_RECEIVING_WALLET are both configured, so the
 * card option honestly self-reports "coming soon" instead of a broken widget.
 *
 * Env (declared on BillingEnv; values supplied by the operator as Pages secrets):
 *   WERT_PARTNER_ID        partner id from the Wert dashboard (after KYB)
 *   WERT_WEBHOOK_SECRET    webhook signing secret
 *   WERT_RECEIVING_WALLET  wallet that receives the USDC
 *   WERT_ORIGIN            https://widget.wert.io (default) | https://sandbox.wert.io
 *   WERT_COMMODITY         USDC (default)
 *   WERT_NETWORK           polygon (default)
 */
import type { BillingEnv } from './billing-env';
import type { PaidPlanKey } from './plan-catalog';
import { normalizePaidPlanKey } from './plan-catalog';

/** Wert terminal success states (mirrors the ClipsFlow contract). */
export const WERT_PAID_STATES = ['order_complete', 'transfer_started', 'success'] as const;

export type WertWidgetOptions = {
  partner_id: string;
  origin: string;
  commodity: string;
  network: string;
  address: string;
  currency: 'USD';
  currency_amount: number;
  click_id: string;
  extra: { item_info: { plan: string; frisky_org_id: string } };
};

export type WertClickBinding = {
  plan: PaidPlanKey;
  orgId: string;
  userId: string;
};

/** Card option is offered ONLY when Wert partner creds are configured. */
export function wertEnabled(env: BillingEnv): boolean {
  return Boolean(env.WERT_PARTNER_ID?.trim() && env.WERT_RECEIVING_WALLET?.trim());
}

/** True when pointed at Wert's sandbox (test cards, no real money). */
export function sandboxMode(env: BillingEnv): boolean {
  return (env.WERT_ORIGIN ?? '').includes('sandbox');
}

/**
 * Encode the payment binding into the click_id that round-trips through Wert.
 * Shape: `fenrir:<plan>:<orgId>:<userId>`. The webhook decodes this to know
 * which workspace to grant — no server-side order table required.
 */
export function wertClickId(plan: PaidPlanKey, orgId: string, userId: string): string {
  return `fenrir:${plan}:${orgId}:${userId}`;
}

export function decodeWertClickId(clickId: string): WertClickBinding | null {
  const parts = (clickId || '').split(':');
  // fenrir:<plan>:<orgId>:<userId> — orgId/userId are UUIDs (no colons).
  if (parts.length !== 4 || parts[0] !== 'fenrir') return null;
  const plan = normalizePaidPlanKey(parts[1]);
  if (!plan || !parts[2] || !parts[3]) return null;
  return { plan, orgId: parts[2], userId: parts[3] };
}

export function wertWidgetOptions(input: {
  env: BillingEnv;
  plan: PaidPlanKey;
  orgId: string;
  userId: string;
  amountUsd: number;
}): WertWidgetOptions | null {
  const { env, plan, orgId, userId, amountUsd } = input;
  if (!wertEnabled(env)) return null;
  return {
    partner_id: env.WERT_PARTNER_ID!.trim(),
    origin: (env.WERT_ORIGIN ?? 'https://widget.wert.io').trim(),
    commodity: (env.WERT_COMMODITY ?? 'USDC').trim(),
    network: (env.WERT_NETWORK ?? 'polygon').trim(),
    address: env.WERT_RECEIVING_WALLET!.trim(),
    currency: 'USD',
    currency_amount: Math.round(amountUsd * 100) / 100,
    click_id: wertClickId(plan, orgId, userId),
    extra: { item_info: { plan, frisky_org_id: orgId } },
  };
}

/** Constant-time hex-string comparison (avoids early-exit timing leaks). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Return the parsed payload IFF the HMAC-SHA256 signature is valid, else null.
 * Wert signs the RAW request body; we recompute over the same bytes (the caller
 * passes `request.text()` verbatim) and constant-time compare the hex.
 */
export async function verifyWertWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): Promise<Record<string, unknown> | null> {
  if (!secret || !signature) return null;
  const expected = await hmacSha256Hex(secret, rawBody);
  if (!timingSafeEqualHex(expected, signature.trim())) return null;
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}
