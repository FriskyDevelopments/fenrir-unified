import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { resolveBillingForOrg } from "../../_lib/billing-db";
import { effectiveBillingPlanFromRow, limitsForPlan, type BillingPlanKey } from "../../_lib/plan-catalog";
import { noStoreJson } from "../../_lib/responses";
import { syncPendingStarsForFriskyUser } from "../../_lib/stars-billing";

export async function onRequestGet(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  if (!context.env.DB) {
    return dbNotConfiguredResponse();
  }

  await syncPendingStarsForFriskyUser(context.env.DB, context.env, session.frisky_user_id);
  const { customer, subscription } = await resolveBillingForOrg(context.env, session.frisky_org_id);
  const plan: BillingPlanKey = effectiveBillingPlanFromRow(subscription);

  return noStoreJson({
    ok: true,
    plan,
    subscriptionStatus: subscription?.status ?? null,
    stripeCustomerId: customer?.stripe_customer_id ?? null,
    stripeSubscriptionId: subscription?.stripe_subscription_id ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    cancelAtPeriodEnd: subscription ? subscription.cancel_at_period_end === 1 : null,
    limits: limitsForPlan(plan)
  });
}
