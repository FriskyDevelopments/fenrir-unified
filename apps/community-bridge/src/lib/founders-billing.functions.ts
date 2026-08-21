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

/**
 * Identity for the billing worker. It validates userId and orgId as UUIDs and
 * binds the Stripe session to both, so a session bought by one account can
 * never be confirmed by another.
 *
 * ⚠️ ASSUMPTION, NOT A VERIFIED FACT — orgId === userId.
 *
 * This was decided here, not read from a spec. There is no organization entity
 * in this codebase today, and the worker's own contract test asserts the case
 * where they are equal (`isValidFoundersStripeSession(session, userId, userId)`
 * with `client_reference_id === orgId === userId`). So collapsing them is
 * consistent with everything that exists right now.
 *
 * It is still a guess, and it is baked into live billing. The day MyFenrir
 * grows real organizations — a team paying once for several members — this line
 * silently binds every subscription to an individual instead of the org, and
 * `handleFoundersConfirm` will reject anyone but the buyer. Whoever adds orgs
 * must revisit this function first.
 */
function billingIdentity(context: { userId: string; claims: Record<string, unknown> }) {
  const userId = String(context.userId ?? "").trim();
  const email = String((context.claims as { email?: unknown })?.email ?? "").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Your session is missing a valid account id. Sign in again.");
  if (!email.includes("@")) throw new Error("Your account has no email address on file. Add one before paying by card.");
  return { userId, orgId: userId, email };
}

/**
 * Card rail — first on screen. The checkout session itself is built by
 * fenrir-stars-payments (/api/internal/founders-checkout), which owns the live
 * Stripe key and the Pack price id. Nothing about pricing is decided here.
 */
export const createFoundersStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        billingPeriod: z.enum(["monthly", "annual"]).default("monthly"),
        refCode: z.string().regex(/^[A-Za-z0-9]{6,16}$/).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId, orgId, email } = billingIdentity(context);
    const result = await billingRequest("/api/internal/founders-checkout", {
      userId,
      orgId,
      email,
      billingPeriod: data.billingPeriod,
      ...(data.refCode ? { refCode: data.refCode } : {}),
    });
    const url = typeof result["url"] === "string" ? result["url"] : "";
    if (!url) throw new Error("Stripe did not return a checkout URL. Try again in a moment.");
    return { url, sessionId: typeof result["sessionId"] === "string" ? result["sessionId"] : "" };
  });

/**
 * Crypto rail — same $14.99 as card and Stars. NOWPayments shows its own fee on
 * its checkout screen; we never fold a fee into the advertised number.
 */
export const createFoundersNowPaymentsCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => undefined)
  .handler(async ({ context }) => {
    const { userId } = billingIdentity(context);
    const result = await billingRequest("/api/internal/founders-nowpayments-checkout", { userId });
    const url = typeof result["url"] === "string" ? result["url"] : "";
    if (!url) throw new Error("NOWPayments did not return an invoice URL. Try again in a moment.");
    return { url };
  });

/** Called on return from Stripe with ?stripe=success&session_id=… */
export const confirmFoundersStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ sessionId: z.string().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/) }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId, orgId } = billingIdentity(context);
    const result = await billingRequest("/api/internal/founders-confirm", {
      sessionId: data.sessionId,
      userId,
      orgId,
    });
    return {
      plan: typeof result["plan"] === "string" ? result["plan"] : "standard",
      status: typeof result["status"] === "string" ? result["status"] : "active",
    };
  });
