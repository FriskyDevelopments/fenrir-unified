import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, missingEnvResponse, siteOrigin, type BillingEnv } from "../../_lib/billing-env";
import { getCustomer } from "../../_lib/billing-db";
import { noStoreJson } from "../../_lib/responses";
import { getStripe } from "../../_lib/stripe";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  if (!context.env.DB) {
    return dbNotConfiguredResponse();
  }

  try {
    getStripe(context.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("missing_env:")) {
      return missingEnvResponse(message.split(":")[1] ?? "STRIPE_SECRET_KEY");
    }
    throw error;
  }

  const customer = await getCustomer(context.env.DB, session.frisky_org_id);
  if (!customer) {
    return noStoreJson(
      {
        ok: false,
        error: "no_stripe_customer",
        detail: "Complete subscription checkout before opening the billing portal."
      },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe(context.env);
    const origin = siteOrigin(context.request, context.env);
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${origin}/?billing=portal_return`
    });
    if (!portal.url) {
      return noStoreJson({ ok: false, error: "portal_no_url" }, { status: 502 });
    }
    return noStoreJson({ ok: true, url: portal.url });
  } catch (error) {
    console.error("stripe_portal_error", error);
    return noStoreJson({ ok: false, error: "stripe_portal_failed" }, { status: 502 });
  }
}
