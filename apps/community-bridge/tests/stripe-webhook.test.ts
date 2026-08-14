import assert from "node:assert/strict";
import test from "node:test";

import { applyStripeEventOnce, verifyStripeSignature, type EntitlementStore, type FounderEntitlement, type StripeWebhookEvent } from "../src/lib/stripe-webhook.ts";

test("Stripe signature is verified against the exact raw payload", async () => {
  const payload = '{"id":"evt_test_founder"}';
  const timestamp = 1_786_690_000;
  const secret = "whsec_test_fixture";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const signature = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifyStripeSignature({ payload, secret, signatureHeader: `t=${timestamp},v1=${signature}`, nowSeconds: timestamp }), true);
  assert.equal(await verifyStripeSignature({ payload: `${payload} `, secret, signatureHeader: `t=${timestamp},v1=${signature}`, nowSeconds: timestamp }), false);
});

test("duplicate webhook fixture applies Founder entitlement exactly once", async () => {
  const processed = new Set<string>();
  const applied: FounderEntitlement[] = [];
  const store: EntitlementStore = {
    async hasProcessedEvent(id) { return processed.has(id); },
    async apply(id, entitlement) { processed.add(id); applied.push(entitlement); },
  };
  const event: StripeWebhookEvent = {
    id: "evt_test_founder_complete",
    type: "checkout.session.completed",
    data: { object: {
      client_reference_id: "00000000-0000-4000-8000-000000000001",
      customer: "cus_test",
      subscription: "sub_test",
      metadata: { offer: "founder_pack_1499", community_user_id: "00000000-0000-4000-8000-000000000001" },
    } },
  };
  assert.equal(await applyStripeEventOnce(event, store), "applied");
  assert.equal(await applyStripeEventOnce(event, store), "duplicate");
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0], {
    userId: "00000000-0000-4000-8000-000000000001",
    customerId: "cus_test",
    subscriptionId: "sub_test",
    status: "active",
    offer: "founder_pack_1499",
  });
});
