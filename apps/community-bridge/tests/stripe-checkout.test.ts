import assert from "node:assert/strict";
import test from "node:test";

import { founderCheckoutParams } from "../src/lib/stripe-checkout.ts";

test("Founder checkout is server-bound to the configured price and signed-in user", () => {
  const params = founderCheckoutParams({
    priceId: "price_test_founder",
    userId: "00000000-0000-4000-8000-000000000001",
    origin: "https://quality.communities.myfenrir.com",
  });
  assert.equal(params.get("mode"), "subscription");
  assert.equal(params.get("line_items[0][price]"), "price_test_founder");
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.equal(params.get("client_reference_id"), "00000000-0000-4000-8000-000000000001");
  assert.equal(params.get("metadata[offer]"), "founder_pack_1499");
  assert.equal(params.get("success_url"), "https://quality.communities.myfenrir.com/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}");
  assert.equal(params.get("cancel_url"), "https://quality.communities.myfenrir.com/upgrade?checkout=cancel");
});
