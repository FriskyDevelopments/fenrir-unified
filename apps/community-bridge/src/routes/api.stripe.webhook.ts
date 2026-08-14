import { createFileRoute } from "@tanstack/react-router";
import { ensureBillingTables, neonEntitlementStore } from "@/lib/stripe-entitlements.server";
import { applyStripeEventOnce, verifyStripeSignature, type StripeWebhookEvent } from "@/lib/stripe-webhook";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Stripe webhook unavailable", { status: 503 });
        const payload = await request.text();
        const signatureHeader = request.headers.get("stripe-signature") ?? "";
        if (!(await verifyStripeSignature({ payload, signatureHeader, secret }))) return new Response("Invalid signature", { status: 400 });
        let event: StripeWebhookEvent;
        try {
          event = JSON.parse(payload) as StripeWebhookEvent;
          if (!event.id || !event.type || !event.data?.object) throw new Error("invalid event");
        } catch {
          return new Response("Invalid event", { status: 400 });
        }
        await ensureBillingTables();
        const outcome = await applyStripeEventOnce(event, neonEntitlementStore());
        return Response.json({ received: true, outcome });
      },
    },
  },
});
