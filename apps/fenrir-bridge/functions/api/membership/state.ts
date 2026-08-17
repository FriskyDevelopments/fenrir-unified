/**
 * GET /api/membership/state
 *
 * The one endpoint every surface reads for "what does this member actually
 * have". Wraps getMembershipFacts() — plan, amount, rail, term, limits — and
 * carries the unknowns through instead of flattening them into defaults.
 *
 * It also owns the answer to "should we celebrate right now". That decision is
 * deliberately NOT the client's: the old trigger fired off `?billing=success`,
 * which is only Stripe's post-checkout redirect. A redirect means the browser
 * came back, not that the entitlement landed — so the portal could announce
 * "your subscription is active" while the webhook was still in flight, and
 * Stars buyers (who never pass through that URL) got nothing at all. Here the
 * server celebrates only what it can already see in billing_subscriptions.
 *
 * Deliberately additive: /api/billing/status keeps working untouched, so the
 * Stripe-webhook work in flight does not collide with this. The difference is
 * that /billing/status answers "which plan for gating", while this answers
 * "what do we tell the human", including what we cannot substantiate.
 */
import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
// @ts-expect-error — plain-JS module shared with the Stars worker runtime.
import { getMembershipFacts } from "../../../workers/_lib/membership-facts.js";

export async function onRequestGet(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!context.env.DB) {
    return dbNotConfiguredResponse();
  }

  const facts = await getMembershipFacts(context.env.DB, session.frisky_org_id);

  // Celebrate only a real, currently-visible entitlement this user has not been
  // shown yet. A membership that is entitled but past_due is not a moment — the
  // member needs the warning, not a party.
  let celebrate = false;
  if (facts.entitled && !facts.status.needsAttention) {
    const seen = await context.env.DB.prepare(
      `SELECT 1 FROM membership_celebrations
        WHERE frisky_user_id = ?1 AND subscription_id = ?2 LIMIT 1`
    )
      .bind(session.frisky_user_id, facts.subscriptionId)
      .first();
    celebrate = !seen;
  }

  // The contact block holds the member's email address. The portal has no need
  // for it — only the confirmation sender does — so it is stripped here rather
  // than shipped to the browser.
  const { contact, ...safe } = facts as Record<string, unknown> & { contact?: unknown };

  return noStoreJson({ ok: true, membership: safe, celebrate });
}
