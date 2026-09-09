import Stripe from "stripe";
import { missingEnvResponse, dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import {
  getSubscriptionByStripeId,
  releaseStripeEvent,
  tryClaimStripeEvent,
  upsertCustomer,
  upsertSubscription
} from "../../_lib/billing-db";
import { assertPaidPlanMetadata, paidPlanFromStripePriceId } from "../../_lib/plan-catalog";
import { constructStripeWebhookEvent, getStripe } from "../../_lib/stripe";
import { anchorStripeCustomer } from "../../_lib/stripe-anchor";
import { sendBillingEmail } from "../../_lib/transactional-email";
import {
  activateTrial,
  claimInviteUse,
  getInviteCode,
  getTrialBySetupIntent,
  isCodeExpired,
  releaseInviteUse,
  setTrialCardOnFile
} from "../../_lib/trials-db";

function subscriptionCustomerId(sub: Stripe.Subscription) {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

async function persistSubscriptionFromStripe(env: BillingEnv, stripe: Stripe, sub: Stripe.Subscription, orgFallback?: string | null) {
  const db = env.DB;
  if (!db) return;

  const priceId = sub.items.data[0]?.price?.id ?? "";
  const fromPrice = paidPlanFromStripePriceId(env, priceId);
  const fromMeta = assertPaidPlanMetadata(sub.metadata?.plan ?? "");
  const plan = fromPrice ?? fromMeta;
  if (!plan) {
    console.error("stripe_subscription_unresolved_plan", sub.id, priceId);
    return;
  }

  const customerId = subscriptionCustomerId(sub);
  let orgId = sub.metadata?.frisky_org_id ?? orgFallback ?? null;
  if (!orgId) {
    const existing = await getSubscriptionByStripeId(db, sub.id);
    orgId = existing?.frisky_org_id ?? null;
  }
  if (!orgId) {
    console.error("stripe_subscription_missing_org", sub.id);
    return;
  }

  await upsertSubscription(db, {
    stripe_subscription_id: sub.id,
    frisky_org_id: orgId,
    stripe_customer_id: customerId,
    plan,
    status: sub.status,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end
  });
}

async function handleCheckoutSessionCompleted(env: BillingEnv, stripe: Stripe, session: Stripe.Checkout.Session) {
  const db = env.DB;
  if (!db) return;

  const orgId = session.metadata?.frisky_org_id ?? session.client_reference_id;
  const userId = session.metadata?.frisky_user_id;
  const planMeta = session.metadata?.plan;
  if (!orgId || !userId || !planMeta) {
    console.error("checkout_metadata_incomplete", { orgId, userId, planMeta });
    return;
  }
  const metaPlan = assertPaidPlanMetadata(planMeta);
  if (!metaPlan) {
    console.error("checkout_invalid_plan_metadata", planMeta);
    return;
  }

  const customerRef = session.customer;
  const customerId = typeof customerRef === "string" ? customerRef : customerRef?.id;
  const subRef = session.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!customerId || !subId) {
    console.error("checkout_missing_ids", { customerId, subId });
    return;
  }

  const email =
    session.customer_details?.email ??
    (typeof session.customer_email === "string" ? session.customer_email : "") ??
    "";

  await upsertCustomer(db, {
    frisky_org_id: orgId,
    frisky_user_id: userId,
    stripe_customer_id: customerId,
    email: email || "pending@unknown"
  });
  await anchorStripeCustomer(env, {
    stripe_customer_id: customerId,
    frisky_org_id: orgId,
    frisky_user_id: userId,
    email: email || "pending@unknown"
  }).catch((error) => console.error("stripe_customer_anchor_failed", String(error)));

  const sub = await stripe.subscriptions.retrieve(subId);
  await persistSubscriptionFromStripe(env, stripe, sub, orgId);
  if (email) await sendBillingEmail(env, { to: email, subject: "Welcome to MyFenrir · Access granted", title: "Welcome to the Pack", body: "Your MyFenrir subscription is active and your community access is ready.", status: "ACCESS GRANTED", detail: "Plan: " + metaPlan + " · Payment method saved securely by Stripe" });
}

async function handleInvoicePaymentFailed(env: BillingEnv, stripe: Stripe, invoice: Stripe.Invoice) {
  const subRef = invoice.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subId) return;
  const sub = await stripe.subscriptions.retrieve(subId);
  await persistSubscriptionFromStripe(env, stripe, sub);
  const email = typeof invoice.customer_email === "string" ? invoice.customer_email : "";
  if (email) await sendBillingEmail(env, { to: email, subject: "MyFenrir · Payment needs attention", title: "Payment needs attention", body: "Your latest payment could not be completed. Your access may be affected if the payment is not updated.", status: "PAYMENT ACTION", detail: "Open your Stripe billing portal to update your payment method." });
}

// Backstop for the MyFenrir trial flow: if the client never calls
// /api/trial/verify, this activates a card-required trial once Stripe confirms
// the SetupIntent. Idempotent — it no-ops if verify already handled the trial.
async function handleTrialSetupIntentSucceeded(env: BillingEnv, setupIntent: Stripe.SetupIntent) {
  const db = env.DB;
  if (!db) return;
  if (setupIntent.metadata?.kind !== "myfenrir_trial") return;

  const trial = await getTrialBySetupIntent(db, setupIntent.id);
  if (!trial) return;

  await setTrialCardOnFile(db, trial.id, true);
  if (trial.status !== "pending_card") return; // /api/trial/verify already activated it

  const invite = await getInviteCode(db, trial.code);
  if (!invite || invite.status !== "active" || isCodeExpired(invite)) return;

  const claimed = await claimInviteUse(db, trial.code);
  if (!claimed) return;

  const activated = await activateTrial(db, trial.id, {
    durationDays: invite.duration_days,
    cardOnFile: true
  });
  if (!activated) await releaseInviteUse(db, trial.code);
}

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  if (!context.env.DB) {
    return dbNotConfiguredResponse();
  }

  let rawBody: string;
  try {
    rawBody = await context.request.text();
  } catch {
    return new Response("invalid body", { status: 400 });
  }

  const signature = context.request.headers.get("stripe-signature");
  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(rawBody, signature, context.env) as Stripe.Event;
  } catch (error) {
    console.error("stripe_webhook_verify_failed", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("missing_env:")) {
      return missingEnvResponse("STRIPE_WEBHOOK_SECRET");
    }
    return new Response("invalid signature", { status: 400 });
  }

  const claimed = await tryClaimStripeEvent(context.env.DB, event.id);
  if (!claimed) {
    return Response.json({ ok: true, received: true, duplicate: true });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe(context.env);
  } catch (error) {
    await releaseStripeEvent(context.env.DB, event.id);
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("missing_env:")) {
      return missingEnvResponse(message.split(":")[1] ?? "STRIPE_SECRET_KEY");
    }
    throw error;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          await handleCheckoutSessionCompleted(context.env, stripe, session);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await persistSubscriptionFromStripe(context.env, stripe, sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(context.env, stripe, invoice);
        break;
      }
      case "setup_intent.succeeded": {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        await handleTrialSetupIntentSucceeded(context.env, setupIntent);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("stripe_webhook_handler_error", event.type, error);
    await releaseStripeEvent(context.env.DB, event.id);
    return Response.json({ ok: false, error: "webhook_processing_failed" }, { status: 500 });
  }

  return Response.json({ ok: true, received: true });
}
