import Stripe from "stripe";
import type { BillingEnv } from "./billing-env";
import { requireEnv } from "./billing-env";

export function getStripe(env: BillingEnv) {
  const key = requireEnv(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient()
  });
}

// Cloudflare Workers / Pages Functions have no Node `crypto` module, so the
// synchronous `constructEvent` (which HMACs via node:crypto) throws
// "SubtleCryptoProvider cannot be used in a synchronous context" at runtime —
// silently failing EVERY Stripe webhook and dropping all subscription updates.
// On the Workers runtime you must use the async API with a SubtleCrypto
// provider. Returns a Promise; callers must await it.
export function constructStripeWebhookEvent(rawBody: string, signature: string | null, env: BillingEnv) {
  const secret = requireEnv(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
  if (!signature) {
    throw new Error("missing_stripe_signature");
  }
  return Stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    secret,
    undefined,
    Stripe.createSubtleCryptoProvider()
  );
}
