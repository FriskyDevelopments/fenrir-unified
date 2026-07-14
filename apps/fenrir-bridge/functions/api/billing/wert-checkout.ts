import { readSession } from '../../_lib/auth';
import type { BillingEnv } from '../../_lib/billing-env';
import { normalizePaidPlanKey, usdPriceForPaidPlan } from '../../_lib/plan-catalog';
import { noStoreJson } from '../../_lib/responses';
import { sandboxMode, wertEnabled, wertWidgetOptions } from '../../_lib/wert';

/**
 * POST /api/billing/wert-checkout — builds the Wert.io widget options for the
 * signed-in user's chosen plan, so the SPA can open the card→crypto widget.
 *
 * Auth is required: the frisky_org_id / frisky_user_id come from the session
 * (never the client), and get baked into the widget's click_id so the webhook
 * grants the entitlement to the right workspace. The amount is computed
 * server-side from the plan — the client cannot pick its own price.
 *
 * When Wert creds are not configured the endpoint returns `enabled:false` (a
 * 200, not an error) so the button can say "card payments coming soon" and fall
 * back to Stars.
 */
export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  }

  let body: { plan?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return noStoreJson({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const plan = normalizePaidPlanKey(body.plan);
  if (!plan) {
    return noStoreJson(
      { ok: false, error: 'invalid_plan', detail: 'plan must be starter, pro, or operator.' },
      { status: 400 }
    );
  }

  if (!wertEnabled(context.env)) {
    // Honest "coming soon" — no partner creds yet. Not an error.
    return noStoreJson({ ok: true, enabled: false });
  }

  const amountUsd = usdPriceForPaidPlan(context.env, plan);
  const wert = wertWidgetOptions({
    env: context.env,
    plan,
    orgId: session.frisky_org_id,
    userId: session.frisky_user_id,
    amountUsd,
  });
  if (!wert) {
    return noStoreJson({ ok: true, enabled: false });
  }

  return noStoreJson({
    ok: true,
    enabled: true,
    plan,
    amountUsd,
    sandbox: sandboxMode(context.env),
    wert,
  });
}
