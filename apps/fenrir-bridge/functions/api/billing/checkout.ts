import { readSession } from "../../_lib/auth";
import { missingEnvResponse, siteOrigin, type BillingEnv } from "../../_lib/billing-env";
import { normalizePaidPlanKey, priceIdForPaidPlan } from "../../_lib/plan-catalog";
import { noStoreJson } from "../../_lib/responses";
import { getStripe } from "../../_lib/stripe";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  let body: { plan?: unknown; courtesyCode?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const plan = normalizePaidPlanKey(body.plan);
  if (!plan) {
    return noStoreJson(
      { ok: false, error: "invalid_plan", detail: "plan must be starter, pro, or operator." },
      { status: 400 }
    );
  }
  const courtesyCode = typeof body.courtesyCode === "string" ? body.courtesyCode.trim() : "";
  if (courtesyCode) {
    if (!context.env.DB || !context.env.FENRIR_COURTESY_CODE || courtesyCode !== context.env.FENRIR_COURTESY_CODE) return noStoreJson({ ok: false, error: "invalid_courtesy_code" }, { status: 400 });
    const claim = await context.env.DB.prepare("INSERT INTO billing_courtesy_redemptions (code, frisky_org_id, frisky_user_id, redeemed_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM billing_courtesy_redemptions WHERE code = ?)").bind(courtesyCode, session.frisky_org_id, session.frisky_user_id, new Date().toISOString(), courtesyCode).run();
    if (!claim.success || !claim.meta.changes) return noStoreJson({ ok: false, error: "courtesy_code_used" }, { status: 409 });
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
    return noStoreJson({ ok: true, url: checkout.url });
  } catch (error) {
    console.error("stripe_checkout_error", error);
    return noStoreJson({ ok: false, error: "stripe_checkout_failed" }, { status: 502 });
  }
}
