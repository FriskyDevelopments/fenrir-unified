// User: convert an active card-backed trial into a paid subscription.
//   POST /api/trial/convert  { plan? }
//
// Requires a card on file (captured earlier via SetupIntent). Creates a Stripe
// subscription on the same Customer using the saved default payment method; the
// existing /api/stripe/webhook persists billing_subscriptions on
// customer.subscription.created. Non-card trials are routed to normal checkout.

import { readSession } from "../../_lib/auth";
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
    const subscription = await stripe.subscriptions.create({
      customer: trial.stripe_customer_id,
      items: [{ price: priceId }],
      metadata: {
        frisky_user_id: session.frisky_user_id,
        frisky_org_id: session.frisky_org_id,
        plan,
        source: "myfenrir_trial_conversion"
      }
    });

    const converted = await markTrialStatus(db, trial.id, "converted");

    return noStoreJson({
      ok: true,
      plan,
      subscriptionStatus: subscription.status,
      stripeSubscriptionId: subscription.id,
      trial: converted ? publicTrial(converted) : null
    });
  } catch (error) {
    console.error("trial_convert_error", error);
    return noStoreJson({ ok: false, error: "stripe_convert_failed" }, { status: 502 });
  }
}
