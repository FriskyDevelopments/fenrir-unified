import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireCommunitySession } from "@/lib/authentik.functions";
import { founderCheckoutParams } from "@/lib/stripe-checkout";
import { founderCheckoutEligibility } from "@/lib/stripe-entitlements.server";

const founderAmount = 1499;

export const createFounderCheckout = createServerFn({ method: "POST" })
  .middleware([requireCommunitySession])
  .inputValidator(() => undefined)
  .handler(async ({ context }) => {
    const eligibility = await founderCheckoutEligibility(context.userId);
    if (!eligibility.eligible) {
      throw new Error(`founder_checkout_unavailable: ${eligibility.reason}`);
    }
    const secret = process.env["STRIPE_SECRET_KEY"]?.trim();
    const priceId = process.env["STRIPE_FOUNDER_PACK_PRICE_ID"]?.trim();
    if (!secret) throw new Error("founder_checkout_unavailable: missing STRIPE_SECRET_KEY");
    if (!priceId) throw new Error("founder_checkout_unavailable: missing STRIPE_FOUNDER_PACK_PRICE_ID");
    if (!secret.startsWith("sk_test_")) throw new Error("founder_checkout_unavailable: Quality requires Stripe test mode");

    const request = getRequest();
    if (!request) throw new Error("founder_checkout_unavailable: request origin missing");
    const origin = new URL(request.url).origin;
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `community-founder-${context.userId}-${crypto.randomUUID()}`,
      },
      body: founderCheckoutParams({ priceId, userId: context.userId, origin }),
    });
    const result = (await response.json().catch(() => null)) as { url?: unknown; error?: { message?: unknown } } | null;
    if (!response.ok || typeof result?.url !== "string" || !result.url.startsWith("https://checkout.stripe.com/")) {
      const reason = typeof result?.error?.message === "string" ? result.error.message : `Stripe HTTP ${response.status}`;
      throw new Error(`founder_checkout_failed: ${reason}`);
    }
    return { url: result.url, amount: founderAmount, currency: "usd" as const };
  });
