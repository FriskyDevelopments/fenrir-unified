import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function billingRequest(path: string, body: Record<string, string>) {
  const secret = process.env["COMMUNITY_BRIDGE_BILLING_SECRET"]?.trim();
  if (!secret) throw new Error("Stripe checkout is not configured");
  const response = await fetch(`https://fenrir-stars-payments.hrgrrtks2p.workers.dev${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || result?.["ok"] !== true) {
    throw new Error(typeof result?.["error"] === "string" ? result["error"] : "Billing service unavailable");
  }
  return result;
}

export const getFoundersBillingOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const result = await billingRequest("/api/internal/billing-options", {});
    return {
      stripe: result["stripe"] === true,
      nowpayments: result["nowpayments"] === true,
      stars: result["stars"] === true,
    };
  });

export const createFoundersStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ billingPeriod: z.enum(["monthly", "annual"]).default("monthly") }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const email = typeof context.claims.email === "string" ? context.claims.email : "";
    if (!email) throw new Error("Your signed-in account has no email address");
    const result = await billingRequest("/api/internal/founders-checkout", {
      userId: context.userId,
      orgId: context.userId,
      email,
      billingPeriod: data.billingPeriod,
    });
    return { url: String(result["url"]) };
  });

export const createFoundersNowPaymentsCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await billingRequest("/api/internal/founders-nowpayments-checkout", {
      userId: context.userId,
      orgId: context.userId,
    });
    return { url: String(result["url"]) };
  });

export const confirmFoundersStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ sessionId: z.string().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/) }).parse(data))
  .handler(async ({ context, data }) => {
    await billingRequest("/api/internal/founders-confirm", {
      sessionId: data.sessionId,
      userId: context.userId,
      orgId: context.userId,
    });
    return { ok: true as const };
  });
