import type { BillingEnv } from "./billing-env";
import { assertPaidPlanMetadata, type PaidPlanKey } from "./plan-catalog";
import { requireEnv } from "./billing-env";

/**
 * Whop card-billing rail, added alongside (never instead of) the existing
 * rails. Telegram Stars stays the launch rail; Stripe stays untouched as the
 * other card standby. Whop is gated by its own flag so enabling it cannot
 * accidentally enable Stripe, and vice versa.
 *
 * Whop v1 webhook contract (docs.whop.com/developer/guides/webhooks):
 * - POST, signed JSON, headers webhook-id / webhook-signature / webhook-timestamp
 * - Signature: HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}`,
 *   key = the `ws_...` webhook secret, header value `v1,<base64 signature>`
 * - Reject timestamps more than 5 minutes from now (replay protection)
 * - Deliveries are at-least-once: same webhook-id can repeat, so handlers
 *   must claim the webhook-id before acting (see billing-db tryClaimWhopEvent)
 * - Events used here: membership.activated, membership.updated (source of
 *   truth for access), payment.succeeded / payment.failed (acknowledged only;
 *   never revoke on payment.failed alone — membership.updated carries the
 *   actual cancellation)
 */

export type WhopMembership = {
  id: string;
  status: string;
  user_id?: string | null;
  member_id?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
  billing_period_days?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type WhopEvent = {
  id: string;
  type: string;
  data: WhopMembership;
};

export function isWhopBillingEnabled(env: BillingEnv) {
  return env.WHOP_BILLING_ENABLED?.trim().toLowerCase() === "true";
}

export function whopBillingNotLiveResponse() {
  return Response.json(
    {
      ok: false,
      error: "whop_billing_not_live",
      detail: "Whop billing is not enabled. Telegram Stars is the current MyFenrir payment path."
    },
    { status: 409 }
  );
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 0x3f] : "=";
  }
  return out;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyWhopSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const webhookId = headers.get("webhook-id");
  const signatureHeader = headers.get("webhook-signature");
  const timestampRaw = headers.get("webhook-timestamp");
  if (!webhookId || !signatureHeader || !timestampRaw) return false;
  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) return false;
  // Whop timestamps are Unix seconds; allow a small clock-skew window
  // inside the documented 5-minute replay limit.
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  // Header is `v1,<base64>`; multiple signatures (key rotation) are
  // space-separated, NOT comma-separated — splitting on "," would break
  // the `v1,` prefix itself.
  const expectedPart = signatureHeader.split(/\s+/).find((p) => p.startsWith("v1,"));
  if (!expectedPart) return false;
  const expected = expectedPart.slice(3);
  if (!expected) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${webhookId}.${timestampRaw}.${rawBody}`)
  );
  // Portable base64 (no btoa: its Latin-1 handling differs between runtimes
  // for byte values >= 128, which HMAC output routinely contains).
  const computed = bytesToBase64(new Uint8Array(signed));
  return timingSafeEqual(computed, expected);
}

export function parseWhopEvent(rawBody: string): WhopEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const event = parsed as { id?: unknown; type?: unknown; data?: unknown };
  if (typeof event.id !== "string" || !event.id) return null;
  if (typeof event.type !== "string" || !event.type) return null;
  if (!event.data || typeof event.data !== "object") return null;
  const data = event.data as { id?: unknown };
  if (typeof data.id !== "string" || !data.id) return null;
  return event as WhopEvent;
}

/** Whop plan (variant) id -> MyFenrir plan, mirroring paidPlanFromStripePriceId. */
export function paidPlanFromWhopVariantId(env: BillingEnv, variantId: string): PaidPlanKey | null {
  if (!variantId) return null;
  if (env.WHOP_STARTER_PLAN_ID && variantId === env.WHOP_STARTER_PLAN_ID) return "starter";
  if (env.WHOP_PRO_PLAN_ID && variantId === env.WHOP_PRO_PLAN_ID) return "pro";
  if (env.WHOP_OPERATOR_PLAN_ID && variantId === env.WHOP_OPERATOR_PLAN_ID) return "operator";
  return null;
}

export function planIdForPaidPlan(env: BillingEnv, plan: PaidPlanKey): string {
  if (plan === "starter") return requireEnv(env.WHOP_STARTER_PLAN_ID, "WHOP_STARTER_PLAN_ID");
  if (plan === "pro") return requireEnv(env.WHOP_PRO_PLAN_ID, "WHOP_PRO_PLAN_ID");
  if (plan === "operator") return requireEnv(env.WHOP_OPERATOR_PLAN_ID, "WHOP_OPERATOR_PLAN_ID");
  throw new Error(`plan_not_sellable_here:${plan}`);
}

export function planFromWhopMembership(env: BillingEnv, membership: WhopMembership): PaidPlanKey | null {
  const fromVariant = membership.variant_id
    ? paidPlanFromWhopVariantId(env, membership.variant_id)
    : null;
  if (fromVariant) return fromVariant;
  const meta = membership.metadata ?? {};
  const metaPlan = typeof meta.plan === "string" ? assertPaidPlanMetadata(meta.plan) : null;
  return metaPlan;
}

export function orgIdFromWhopMembership(membership: WhopMembership): string | null {
  const meta = membership.metadata ?? {};
  return typeof meta.frisky_org_id === "string" && meta.frisky_org_id.trim()
    ? meta.frisky_org_id.trim()
    : null;
}

export function userIdFromWhopMembership(membership: WhopMembership): string | null {
  const meta = membership.metadata ?? {};
  if (typeof meta.frisky_user_id === "string" && meta.frisky_user_id.trim()) {
    return meta.frisky_user_id.trim();
  }
  return null;
}

/**
 * Period end for the D1 row. Never NULL for an active membership — the
 * Stars rail learned this the hard way (NULL reads as "active forever").
 * Falls back to now + billing_period_days (default 30) when Whop omits it.
 */
export function periodEndForWhopMembership(membership: WhopMembership): string | null {
  if (membership.current_period_end) {
    const parsed = new Date(membership.current_period_end);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const status = (membership.status ?? "").toLowerCase();
  if (status === "active" || status === "trialing" || status === "past_due") {
    const days = typeof membership.billing_period_days === "number" && membership.billing_period_days > 0
      ? membership.billing_period_days
      : 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}
