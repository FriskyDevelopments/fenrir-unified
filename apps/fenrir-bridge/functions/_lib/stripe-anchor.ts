// stripe-anchor.ts — anchor the Stripe customer to the canonical Supabase
// identity (public.account_billing), keyed by supabase_user_id.
//
// Called right AFTER the existing trial/billing code upserts the D1
// billing_customers row (functions/_lib/billing-db.ts::upsertCustomer). It does
// NOT create a Stripe customer and NEVER duplicates one — it mirrors the SAME
// stripe_customer_id already chosen by the billing/trial system onto the SoT, so:
//   one supabase_user_id  ⇒  one MyFenrir identity  ⇒  one Stripe customer.
//
// Best-effort and non-throwing: billing must never fail because the mirror is
// momentarily unavailable. Stripe keys are never referenced here.

import type { BillingEnv } from "./billing-env";
import { accountLinksConfigured, resolveSupabaseUserId } from "./account-links";

const nowIso = () => new Date().toISOString();

export async function anchorStripeCustomer(
  env: BillingEnv,
  input: {
    stripe_customer_id: string;
    frisky_org_id?: string | null;
    frisky_user_id?: string | null;
    email?: string | null;
  }
): Promise<{ ok: boolean; reason?: string }> {
  if (!accountLinksConfigured(env)) return { ok: false, reason: "not_configured" };
  // Telegram-Stars uses a synthetic "stars_<id>" placeholder — never a real
  // Stripe customer, so don't anchor it.
  if (!input.stripe_customer_id || input.stripe_customer_id.startsWith("stars_")) {
    return { ok: false, reason: "not_a_stripe_customer" };
  }

  const supabaseUserId = await resolveSupabaseUserId(env, {
    email: input.email ?? null,
    friskyUserId: input.frisky_user_id ?? null
  });
  if (!supabaseUserId) return { ok: false, reason: "unresolved_identity" };

  const base = env.SUPABASE_URL!.replace(/\/$/, "") + "/rest/v1";
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${base}/account_billing?on_conflict=supabase_user_id`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      supabase_user_id: supabaseUserId,
      stripe_customer_id: input.stripe_customer_id,
      frisky_user_id: input.frisky_user_id ?? null,
      frisky_org_id: input.frisky_org_id ?? null,
      email: input.email ?? null,
      updated_at: nowIso()
    })
  }).catch(() => null);

  return { ok: Boolean(res?.ok), reason: res?.ok ? undefined : "write_failed" };
}
