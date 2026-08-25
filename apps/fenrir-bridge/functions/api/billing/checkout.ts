import { readSession } from "../../_lib/auth";
import { cardBillingNotLiveResponse, isCardBillingEnabled, missingEnvResponse, siteOrigin, type BillingEnv } from "../../_lib/billing-env";
import { isSellablePlan, normalizePaidPlanKey, priceIdForPaidPlan } from "../../_lib/plan-catalog";
import { noStoreJson } from "../../_lib/responses";
import { getStripe } from "../../_lib/stripe";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  if (!isCardBillingEnabled(context.env)) {
    return cardBillingNotLiveResponse();
  }

  let body: { plan?: unknown; courtesyCode?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const plan = normalizePaidPlanKey(body.plan);
  if (!plan || !isSellablePlan(plan)) {
    // "standard" (The Pack) parses as a valid plan for entitlement reads, but is
    // sold by the fenrir-stars-payments Worker, not here.
    return noStoreJson(
      { ok: false, error: "invalid_plan", detail: "plan must be starter, pro, or operator." },
      { status: 400 }
    );
  }
  const courtesyCode = typeof body.courtesyCode === "string" ? body.courtesyCode.trim() : "";
  if (courtesyCode) {
    // Validate the code value up front (cheap, no state change) so an invalid
    // code fails before we ever touch Stripe.
    if (!context.env.DB || !context.env.FENRIR_COURTESY_CODE || courtesyCode !== context.env.FENRIR_COURTESY_CODE) return noStoreJson({ ok: false, error: "invalid_courtesy_code" }, { status: 400 });
    // Fast-fail if the code was already redeemed — but DO NOT claim it here.
    // The single-use claim is committed only AFTER Stripe confirms the checkout
    // session below, so a Stripe failure can never burn a valid courtesy code.
    const already = await context.env.DB.prepare("SELECT 1 AS used FROM billing_courtesy_redemptions WHERE code = ? LIMIT 1").bind(courtesyCode).first<{ used: number }>();
    if (already) return noStoreJson({ ok: false, error: "courtesy_code_used" }, { status: 409 });
  }

  let priceId: string;
  try {
    priceId = priceIdForPaidPlan(context.env, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("missing_env:")) {
      const name = message.split(":")[1] ?? "unknown";
      return missingEnvResponse(name);
    }
    throw error;
  }

  try {
    const stripe = getStripe(context.env);
    const origin = siteOrigin(context.request, context.env);
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: session.frisky_org_id,
      customer_email: session.email,
      // quantity: 1 es CORRECTO aquí, y no es el bug del eje de cobro.
      //
      // Esta ruta rechaza "standard" arriba a propósito: sólo vende starter,
      // pro y operator, que son planes PLANOS con tope de locks (ver
      // _lib/plan-catalog.ts) — su precio no depende de cuántas comunidades
      // haya enlazadas, así que la cantidad siempre es 1 licencia de plan.
      //
      // El que SÍ se cobra por comunidad enlazada es The Pack, y se vende por
      // workers/fenrir-stars-payments.js. Si algún día este endpoint empieza a
      // vender The Pack, esta línea deja de ser correcta: usa
      // checkoutSeatQuantity() y reconcilia con syncCommunitySeatQuantity().
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
      metadata: {
        frisky_user_id: session.frisky_user_id,
        frisky_org_id: session.frisky_org_id,
        plan, ...(courtesyCode ? { access_type: "complimentary_admin_courtesy", courtesy_duration: "6_months" } : {})
      },
      ...(courtesyCode && context.env.STRIPE_COURTESY_COUPON_ID ? { discounts: [{ coupon: context.env.STRIPE_COURTESY_COUPON_ID }] } : {}),
      subscription_data: {
        metadata: {
          frisky_user_id: session.frisky_user_id,
          frisky_org_id: session.frisky_org_id,
          plan
        }
      }
    });
    if (!checkout.url) {
      return noStoreJson({ ok: false, error: "checkout_no_url" }, { status: 502 });
    }
    // Checkout is confirmed created — NOW consume the one-use courtesy code
    // atomically. If a concurrent request already claimed it, reject as used;
    // this checkout session is simply left unused (it expires on Stripe's side)
    // and no valid code is ever burned by an upstream Stripe failure.
    if (courtesyCode && context.env.DB) {
      const claim = await context.env.DB
        .prepare("INSERT INTO billing_courtesy_redemptions (code, frisky_org_id, frisky_user_id, redeemed_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM billing_courtesy_redemptions WHERE code = ?)")
        .bind(courtesyCode, session.frisky_org_id, session.frisky_user_id, new Date().toISOString(), courtesyCode)
        .run();
      if (!claim.success || !claim.meta.changes) {
        return noStoreJson({ ok: false, error: "courtesy_code_used" }, { status: 409 });
      }
    }
    return noStoreJson({ ok: true, url: checkout.url });
  } catch (error) {
    console.error("stripe_checkout_error", error);
    return noStoreJson({ ok: false, error: "stripe_checkout_failed" }, { status: 502 });
  }
}
