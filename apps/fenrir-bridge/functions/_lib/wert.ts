import type { BillingEnv } from './billing-env';
import { normalizePaidPlanKey, type PaidPlanKey } from './plan-catalog';

/**
 * _lib/wert — Wert.io card→crypto on-ramp for Fenrir / MyFenrir.
 *
 * Wert lets a user pay with a card and we receive crypto (USDC/polygon) in a
 * receiving wallet. It sits BESIDE the existing processors:
 *   • Stripe (recurring card subscription)  — functions/api/billing/*
 *   • Telegram Stars (in-Telegram)          — functions/api/telegram/*
 * and converges on the SAME grant: upsertSubscription() keyed by frisky_org_id
 * (functions/_lib/billing-db.ts). It never replaces Stripe/Stars — it's an extra
 * "Pay with card (Wert)" button offered ONLY when partner creds are configured.
 *
 * Two halves:
 *   • widgetOptions()   — builds the @wert-io/widget-initializer config. The
 *                         click_id carries `fenrir:<plan>:<frisky_org_id>` so the
 *                         webhook can bind the payment to the buyer's org.
 *   • verifyWebhook()   — validates the HMAC-SHA256 signature (X-Wert-Signature,
 *                         hex, over the RAW body) before granting the entitlement.
 *
 * Env (names only — values live in the Secret Center / wrangler secrets, never
 * hardcoded). Card button stays "coming soon" until WERT_PARTNER_ID +
 * WERT_RECEIVING_WALLET are BOTH set:
 *   WERT_PARTNER_ID        partner id from the Wert dashboard (after KYB)
 *   WERT_RECEIVING_WALLET  wallet that receives the USDC
 *   WERT_WEBHOOK_SECRET    webhook signing secret (HMAC-SHA256 key)
 *   WERT_ORIGIN            https://widget.wert.io (default) | https://sandbox.wert.io
 *   WERT_COMMODITY         USDC (default)
 *   WERT_NETWORK           polygon (default)
 *   WERT_{STARTER,PRO,OPERATOR}_USD   one-time card price per plan (default 3/7/15)
 */

/** Wert terminal success states (mirror the ClipsFlow codec). */
export const WERT_PAID_STATES = ['order_complete', 'transfer_started', 'success'];

export function wertEnabled(env: BillingEnv): boolean {
  return Boolean(env.WERT_PARTNER_ID?.trim() && env.WERT_RECEIVING_WALLET?.trim());
}

export function wertSandbox(env: BillingEnv): boolean {
  return (env.WERT_ORIGIN ?? '').includes('sandbox');
}

/** One-time USD price offered on the card→crypto path for each plan. */
export function planPriceUsd(env: BillingEnv, plan: PaidPlanKey): number {
  const raw =
    plan === 'starter'
      ? env.WERT_STARTER_USD
      : plan === 'pro'
        ? env.WERT_PRO_USD
        : env.WERT_OPERATOR_USD;
  const parsed = Number.parseFloat((raw ?? '').trim());
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100) / 100;
  return plan === 'starter' ? 3 : plan === 'pro' ? 7 : 15;
}

/** click_id codec: fenrir:<plan>:<frisky_org_id>. */
export function encodeClickId(plan: PaidPlanKey, friskyOrgId: string): string {
  return `fenrir:${plan}:${friskyOrgId}`;
}

export function decodeClickId(clickId: string): { plan: PaidPlanKey; friskyOrgId: string } | null {
  const parts = (clickId || '').split(':');
  if (parts.length < 3 || parts[0] !== 'fenrir') return null;
  const plan = normalizePaidPlanKey(parts[1]);
  const friskyOrgId = parts.slice(2).join(':');
  if (!plan || !friskyOrgId) return null;
  return { plan, friskyOrgId };
}

export type WertWidgetOptions = {
  partner_id: string;
  origin: string;
  commodity: string;
  network: string;
  address: string;
  currency: string;
  currency_amount: number;
  click_id: string;
  extra: { item_info: { plan: string; frisky_org_id: string; frisky_user_id: string } };
};

/** Build the @wert-io/widget-initializer options. Returns null if unconfigured. */
export function widgetOptions(
  env: BillingEnv,
  input: { plan: PaidPlanKey; friskyOrgId: string; friskyUserId: string }
): WertWidgetOptions | null {
  if (!wertEnabled(env)) return null;
  return {
    partner_id: env.WERT_PARTNER_ID!.trim(),
    origin: (env.WERT_ORIGIN ?? 'https://widget.wert.io').trim(),
    commodity: (env.WERT_COMMODITY ?? 'USDC').trim(),
    network: (env.WERT_NETWORK ?? 'polygon').trim(),
    address: env.WERT_RECEIVING_WALLET!.trim(),
    currency: 'USD',
    currency_amount: planPriceUsd(env, input.plan),
    click_id: encodeClickId(input.plan, input.friskyOrgId),
    extra: {
      item_info: {
        plan: input.plan,
        frisky_org_id: input.friskyOrgId,
        frisky_user_id: input.friskyUserId,
      },
    },
  };
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** Constant-time compare of two equal-length lowercase hex strings. */
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify Wert's webhook signature and return the parsed payload IFF valid.
 * HMAC-SHA256 of the RAW bytes, keyed by WERT_WEBHOOK_SECRET, hex, delivered in
 * the X-Wert-Signature header. Uses Web Crypto (Workers runtime — no Node crypto).
 */
export async function verifyWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): Promise<Record<string, unknown> | null> {
  if (!secret || !signature) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  if (!timingSafeHexEqual(toHex(mac), signature.trim().toLowerCase())) return null;
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}
