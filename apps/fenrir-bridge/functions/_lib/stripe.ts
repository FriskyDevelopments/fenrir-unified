import Stripe from "stripe";
import type { BillingEnv } from "./billing-env";
import { requireEnv } from "./billing-env";

export function getStripe(env: BillingEnv) {
  const key = requireEnv(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient()
  });
}

export function constructStripeWebhookEvent(rawBody: string, signature: string | null, env: BillingEnv) {
  const secret = requireEnv(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
  if (!signature) {
    throw new Error("missing_stripe_signature");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}
