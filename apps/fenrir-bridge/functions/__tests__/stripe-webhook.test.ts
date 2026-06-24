import { describe, expect, it } from "vitest";
import Stripe from "stripe";

import { constructStripeWebhookEvent } from "../_lib/stripe";
import type { BillingEnv } from "../_lib/billing-env";

// Regression: on the Cloudflare Workers / Pages runtime there is no Node
// `crypto`, so the SYNCHRONOUS Stripe.webhooks.constructEvent throws
// "SubtleCryptoProvider cannot be used in a synchronous context" and every
// webhook fails signature verification — silently dropping all subscription
// updates. constructStripeWebhookEvent must use the async SubtleCrypto path.
//
// We can't reach into the real Workers runtime here, but we CAN prove the
// function is now async and verifies/rejects signatures via the async API
// (the SDK routes constructEventAsync through the SubtleCrypto provider).

const WHSEC = "whsec_test_secret_for_signature_verification";
const env: BillingEnv = { STRIPE_WEBHOOK_SECRET: WHSEC } as BillingEnv;

function signedHeader(payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  // Use the SDK's own test-header generator so the signature scheme matches.
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WHSEC,
    timestamp
  });
}

describe("constructStripeWebhookEvent (Workers SubtleCrypto path)", () => {
  it("returns a Promise (async API), not a synchronous Event", () => {
    const payload = JSON.stringify({ id: "evt_1", type: "ping" });
    const result = constructStripeWebhookEvent(payload, signedHeader(payload), env);
    expect(typeof (result as Promise<unknown>)?.then).toBe("function");
    return result; // settle it so we don't leak an unhandled rejection
  });

  it("verifies a correctly signed payload", async () => {
    const payload = JSON.stringify({ id: "evt_ok", type: "checkout.session.completed" });
    const event = await constructStripeWebhookEvent(payload, signedHeader(payload), env);
    expect(event.id).toBe("evt_ok");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a payload whose signature does not match", async () => {
    const payload = JSON.stringify({ id: "evt_bad", type: "ping" });
    const header = signedHeader("a-different-payload");
    await expect(constructStripeWebhookEvent(payload, header, env)).rejects.toThrow();
  });

  it("throws when the stripe-signature header is missing", () => {
    const payload = JSON.stringify({ id: "evt_x", type: "ping" });
    expect(() => constructStripeWebhookEvent(payload, null, env)).toThrow(/missing_stripe_signature/);
  });

  it("throws missing_env when the webhook secret is not configured", () => {
    const payload = JSON.stringify({ id: "evt_y", type: "ping" });
    expect(() => constructStripeWebhookEvent(payload, "t=1,v1=abc", {} as BillingEnv)).toThrow(
      /missing_env:STRIPE_WEBHOOK_SECRET/
    );
  });
});
