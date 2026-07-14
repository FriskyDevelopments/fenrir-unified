import { readSession } from '../../_lib/auth';
import type { BillingEnv } from '../../_lib/billing-env';
import { normalizePaidPlanKey } from '../../_lib/plan-catalog';
import { noStoreJson } from '../../_lib/responses';
import { wertEnabled, wertSandbox, widgetOptions } from '../../_lib/wert';

/**
 * POST /api/wert/session
 * Returns the @wert-io/widget-initializer options for the authenticated buyer's
 * chosen plan. The buyer's frisky_org_id is taken from the SERVER session (never
 * trusted from the client) and encoded into the widget click_id so the webhook
 * can bind the payment. If Wert isn't configured yet, responds 503
 * wert_not_configured so the UI can show an honest "coming soon" — never a broken
 * widget.
 */
export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  }

  if (!wertEnabled(context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: 'wert_not_configured',
        detail: 'Card (Wert) payments are not enabled yet. Use Stars or the Stripe upgrade.',
      },
      { status: 503 }
    );
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

  const options = widgetOptions(context.env, {
    plan,
    friskyOrgId: session.frisky_org_id,
    friskyUserId: session.frisky_user_id,
  });
  if (!options) {
    return noStoreJson({ ok: false, error: 'wert_not_configured' }, { status: 503 });
  }

  return noStoreJson({ ok: true, mode: 'wert', sandbox: wertSandbox(context.env), options });
};
