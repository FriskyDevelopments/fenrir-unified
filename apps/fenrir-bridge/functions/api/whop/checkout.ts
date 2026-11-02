import { readSession } from "../../_lib/auth";
import { missingEnvResponse, siteOrigin, type BillingEnv } from "../../_lib/billing-env";
import { isSellablePlan, normalizePaidPlanKey } from "../../_lib/plan-catalog";
import { noStoreJson } from "../../_lib/responses";
import { isWhopBillingEnabled, planIdForPaidPlan, whopBillingNotLiveResponse } from "../../_lib/whop";

/**
 * POST /api/whop/checkout — create a Whop hosted checkout for a sellable plan.
 *
 * Mirrors functions/api/billing/checkout.ts (Stripe) with the same session
 * and plan rules: authenticated session, sellable plans only
 * (starter / pro / operator — "standard" / The Pack stays on the Stars rail).
 * The only Whop-specific parts are the checkout-configuration API call and
 * the metadata, which the webhook later reads back to resolve the org:
 * checkout metadata is inherited by the membership created from it.
 *
 * Whop API: POST https://api.whop.com/api/v1/checkout_configurations
 * with { plan_id, metadata }, Bearer WHOP_API_KEY. Response carries
 * purchase_url (and id ch_...). No @whop/sdk dependency: plain fetch keeps
 * this Pages Function free of Node-only SDK assumptions.
 * This endpoint never grants access itself — only membership.activated /
 * membership.updated on /api/whop/webhook does that.
 */
export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!isWhopBillingEnabled(context.env)) {
    return whopBillingNotLiveResponse();
  }
  if (!context.env.WHOP_API_KEY?.trim()) {
    return missingEnvResponse("WHOP_API_KEY");
  }

  let body: { plan?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const plan = normalizePaidPlanKey(body.plan);
  if (!plan || !isSellablePlan(plan)) {
    return noStoreJson(
      { ok: false, error: "invalid_plan", detail: "plan must be starter, pro, or operator." },
      { status: 400 }
    );
  }

  let planId: string;
  try {
    planId = planIdForPaidPlan(context.env, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("missing_env:")) {
      return missingEnvResponse(message.split(":")[1] ?? "unknown");
    }
    throw error;
  }

  const origin = siteOrigin(context.request, context.env);
  let response: Response;
  try {
    response = await fetch("https://api.whop.com/api/v1/checkout_configurations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.env.WHOP_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plan_id: planId,
        metadata: {
          frisky_user_id: session.frisky_user_id,
          frisky_org_id: session.frisky_org_id,
          plan,
          email: session.email
        },
        // Whop accepts redirect-style fields on some configurations; the
        // hosted purchase_url is the contract used here, so these are
        // best-effort and ignored by Whop if unsupported for the plan.
        success_url: `${origin}/?billing=success`,
        cancel_url: `${origin}/?billing=cancel`
      })
    });
  } catch (error) {
    console.error("whop_checkout_error", error);
    return noStoreJson({ ok: false, error: "whop_checkout_failed" }, { status: 502 });
  }
  if (!response.ok) {
    console.error("whop_checkout_error", response.status);
    return noStoreJson({ ok: false, error: "whop_checkout_failed" }, { status: 502 });
  }
  let checkout: { purchase_url?: unknown; url?: unknown; id?: unknown };
  try {
    checkout = (await response.json()) as typeof checkout;
  } catch {
    return noStoreJson({ ok: false, error: "whop_checkout_failed" }, { status: 502 });
  }
  const url = typeof checkout.purchase_url === "string" ? checkout.purchase_url
    : typeof checkout.url === "string" ? checkout.url : "";
  if (!url) {
    return noStoreJson({ ok: false, error: "checkout_no_url" }, { status: 502 });
  }
  return noStoreJson({ ok: true, url });
}
