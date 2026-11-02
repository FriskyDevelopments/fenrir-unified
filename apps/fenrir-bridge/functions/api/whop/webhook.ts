import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import {
  releaseWhopEvent,
  tryClaimWhopEvent,
  upsertCustomer,
  upsertSubscription
} from "../../_lib/billing-db";
import {
  isWhopBillingEnabled,
  orgIdFromWhopMembership,
  parseWhopEvent,
  periodEndForWhopMembership,
  planFromWhopMembership,
  userIdFromWhopMembership,
  verifyWhopSignature,
  whopBillingNotLiveResponse,
  type WhopMembership
} from "../../_lib/whop";

/**
 * POST /api/whop/webhook — Whop v1 webhook receiver.
 *
 * Mirrors functions/api/stripe/webhook.ts, but writes Whop memberships into
 * the same billing_customers / billing_subscriptions tables so the existing
 * entitlement reads (effectiveBillingPlanFromRow, /api/billing/status) work
 * unchanged. Whop ids are namespaced with a `whop:` prefix so they can never
 * collide with Stripe `cus_` / `sub_` ids in those columns.
 *
 * Gate order matters: DB first, then the explicit WHOP_BILLING_ENABLED flag,
 * then signature verification. A disabled rail returns 409, not a silent 200,
 * so a misconfigured dashboard registration is visible instead of swallowed.
 * Unknown / payment-only events are acknowledged (200) — Whop retries
 * non-2xx for ~3 days, and there is nothing to grant from them.
 */
async function persistMembership(env: BillingEnv, membership: WhopMembership) {
  const db = env.DB;
  if (!db) return;

  const plan = planFromWhopMembership(env, membership);
  if (!plan) {
    console.error("whop_membership_unresolved_plan", membership.id, membership.variant_id ?? "");
    return;
  }
  const orgId = orgIdFromWhopMembership(membership);
  if (!orgId) {
    // Checkout metadata is the only org link: without it we must grant
    // nothing, or one buyer's payment would land on the wrong org.
    // The checkout endpoint always sets frisky_org_id, so this path means
    // the purchase came from a dashboard checkout link, not our flow.
    console.error("whop_membership_missing_org", membership.id);
    return;
  }

  const memberRef = membership.member_id ?? membership.user_id ?? "";
  const customerId = `whop:${memberRef}`;
  const userId = userIdFromWhopMembership(membership) ?? memberRef;
  const meta = membership.metadata ?? {};
  const email = typeof meta.email === "string" && meta.email.trim() ? meta.email.trim() : "pending@unknown";

  await upsertCustomer(db, {
    frisky_org_id: orgId,
    frisky_user_id: userId || "pending@unknown",
    stripe_customer_id: customerId,
    email
  });

  await upsertSubscription(db, {
    stripe_subscription_id: `whop:${membership.id}`,
    frisky_org_id: orgId,
    stripe_customer_id: customerId,
    plan,
    status: membership.status,
    current_period_end: periodEndForWhopMembership(membership),
    cancel_at_period_end: membership.cancel_at_period_end ?? false
  });
}

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  if (!context.env.DB) {
    return dbNotConfiguredResponse();
  }
  if (!isWhopBillingEnabled(context.env)) {
    return whopBillingNotLiveResponse();
  }
  if (!context.env.WHOP_WEBHOOK_SECRET?.trim()) {
    return missingEnvResponse("WHOP_WEBHOOK_SECRET");
  }

  let rawBody: string;
  try {
    rawBody = await context.request.text();
  } catch {
    return new Response("invalid body", { status: 400 });
  }

  const verified = await verifyWhopSignature(rawBody, context.request.headers, context.env.WHOP_WEBHOOK_SECRET);
  if (!verified) {
    console.error("whop_webhook_verify_failed");
    return new Response("invalid signature", { status: 400 });
  }

  const event = parseWhopEvent(rawBody);
  if (!event) {
    return new Response("invalid event", { status: 400 });
  }

  let claimed: boolean;
  try {
    claimed = await tryClaimWhopEvent(context.env.DB, event.id);
  } catch (error) {
    // Most likely cause: docs/whop-d1-schema.sql was not applied yet.
    // Return 500 so Whop retries, instead of granting twice or dropping it.
    console.error("whop_event_claim_failed", error);
    return new Response("event ledger unavailable", { status: 500 });
  }
  if (!claimed) {
    return Response.json({ ok: true, received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "membership.activated":
      case "membership.updated": {
        await persistMembership(context.env, event.data);
        break;
      }
      case "payment.succeeded":
      case "payment.failed":
      case "payment.requires_action":
        // Acknowledged only. Membership events are the source of truth for
        // access; revoking on payment.failed alone would cut access during
        // retries / 3DS recovery that later succeeds.
        break;
      default:
        break;
    }
  } catch (error) {
    await releaseWhopEvent(context.env.DB, event.id);
    console.error("whop_webhook_handler_failed", error);
    return new Response("handler failed", { status: 500 });
  }

  return Response.json({ ok: true, received: true });
}
