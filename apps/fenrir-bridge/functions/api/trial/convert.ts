// User: convert an active card-backed trial into a paid subscription.
//   POST /api/trial/convert  { plan? }
//
// Requires a card on file (captured earlier via SetupIntent). Creates a Stripe
// subscription on the same Customer using the saved default payment method; the
// route persists billing_subscriptions immediately; the webhook remains an
// idempotent reconciliation path. Non-card trials use normal checkout.

import { readSession } from "../../_lib/auth";
import { getPrimarySubscriptionForOrg, upsertSubscription } from "../../_lib/billing-db";
import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { normalizePaidPlanKey, priceIdForPaidPlan, type PaidPlanKey } from "../../_lib/plan-catalog";
import { noStoreJson } from "../../_lib/responses";
import { getStripe } from "../../_lib/stripe";
import { getTrialForOrg, markTrialStatus, publicTrial } from "../../_lib/trials-db";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();
  const db = context.env.DB;

  let body: { plan?: unknown };
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const trial = await getTrialForOrg(db, session.frisky_org_id);
  if (!trial) {
    return noStoreJson({ ok: false, error: "no_active_trial" }, { status: 404 });
  }
  if (trial.status === "converted") {
    return noStoreJson({ ok: false, error: "trial_already_converted", trial: publicTrial(trial) }, { status: 409 });
  }
  if (trial.status !== "active" && trial.status !== "pending_card") {
    return noStoreJson({ ok: false, error: "no_active_trial" }, { status: 404 });
  }
  if (trial.card_on_file !== 1 || !trial.stripe_customer_id) {
    return noStoreJson(
      {
        ok: false,
        error: "card_required",
        detail: "No card on file for direct conversion. Add one via /api/trial/setup-intent + /api/trial/verify, or use /api/billing/checkout.",
        next: "/api/billing/checkout"
      },
      { status: 400 }
    );
  }

  const plan: PaidPlanKey | null = normalizePaidPlanKey(body?.plan) ?? (trial.plan ? normalizePaidPlanKey(trial.plan) : null);
  if (!plan) {
    return noStoreJson({ ok: false, error: "plan_required", detail: "Provide plan: starter, pro, or operator." }, { status: 400 });
  }

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe(context.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("missing_env:")) return missingEnvResponse(message.split(":")[1] ?? "STRIPE_SECRET_KEY");
    throw error;
  }

  let priceId: string;
  try {
    priceId = priceIdForPaidPlan(context.env, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("missing_env:")) return missingEnvResponse(message.split(":")[1] ?? "unknown");
    throw error;
  }

  try {
    const existingBilling = await getPrimarySubscriptionForOrg(db, session.frisky_org_id);
    if (
      existingBilling &&
      existingBilling.status !== "canceled" &&
      existingBilling.status !== "incomplete_expired"
    ) {
      const converted = await markTrialStatus(db, trial.id, "converted");
      return noStoreJson({
        ok: true,
        alreadySubscribed: true,
        plan: existingBilling.plan,
        subscriptionStatus: existingBilling.status,
        stripeSubscriptionId: existingBilling.stripe_subscription_id,
        trial: converted ? publicTrial(converted) : null
      });
    }

    // Stripe keeps idempotency keys for a bounded period. The metadata lookup
    // also finds a prior conversion after that window if the route crashed
    // after Stripe created the subscription but before D1 was updated.
    const prior = await stripe.subscriptions.list({
      customer: trial.stripe_customer_id,
      status: "all",
      limit: 100
    });
    const priorConversion = prior.data.find(
      (candidate) =>
        candidate.metadata?.source === "myfenrir_trial_conversion" &&
        candidate.metadata?.trial_id === trial.id &&
        candidate.status !== "canceled" &&
        candidate.status !== "incomplete_expired"
    );

    const subscription =
      priorConversion ??
      (await stripe.subscriptions.create(
        {
          customer: trial.stripe_customer_id,
          items: [{ price: priceId }],
          metadata: {
            frisky_user_id: session.frisky_user_id,
            frisky_org_id: session.frisky_org_id,
            trial_id: trial.id,
            plan,
            source: "myfenrir_trial_conversion"
          }
        },
        // Stable per trial, not per requested plan. Concurrent requests with
        // different plans must conflict at Stripe instead of creating two
        // subscriptions for the same conversion.
        { idempotencyKey: `myfenrir_trial_conversion:${trial.id}` }
      ));

    const persistedPlan = normalizePaidPlanKey(subscription.metadata?.plan) ?? plan;

    await upsertSubscription(db, {
      stripe_subscription_id: subscription.id,
      frisky_org_id: session.frisky_org_id,
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      plan: persistedPlan,
      status: subscription.status,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end
    });

    const converted = await markTrialStatus(db, trial.id, "converted");

    return noStoreJson({
      ok: true,
      plan: persistedPlan,
      subscriptionStatus: subscription.status,
      stripeSubscriptionId: subscription.id,
      trial: converted ? publicTrial(converted) : null
    });
  } catch (error) {
    console.error("trial_convert_error", error);
    return noStoreJson({ ok: false, error: "stripe_convert_failed" }, { status: 502 });
  }
}
