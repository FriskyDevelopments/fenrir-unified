// User: get a Stripe SetupIntent client_secret for a card-required trial.
//   POST /api/trial/setup-intent  { code? }
//
// Returns { clientSecret } for the front-end Stripe.js to confirm the card.
// The card details are entered in Stripe Elements and sent straight to Stripe —
// they NEVER touch this Worker. We persist only the Customer + SetupIntent IDs.

import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { getCustomer, upsertCustomer } from "../../_lib/billing-db";
import { getStripe } from "../../_lib/stripe";
import { anchorStripeCustomer } from "../../_lib/stripe-anchor";
import {
  attachStripeToTrial,
  getTrialByOrgAndCode,
  getTrialForOrg,
  normalizeInviteCode,
  publicTrial
} from "../../_lib/trials-db";

const REUSABLE_SETUP_INTENT_STATES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing"
]);

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();
  const db = context.env.DB;

  let body: { code?: unknown };
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const requestedCode = normalizeInviteCode(body?.code);
  const trial = requestedCode
    ? await getTrialByOrgAndCode(db, session.frisky_org_id, requestedCode)
    : await getTrialForOrg(db, session.frisky_org_id);

  if (!trial) return noStoreJson({ ok: false, error: "no_trial", detail: "Redeem a card-required invite code first." }, { status: 404 });
  if (trial.status === "active" || trial.status === "converted") {
    return noStoreJson({ ok: false, error: "trial_already_active", trial: publicTrial(trial) }, { status: 409 });
  }

  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe(context.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("missing_env:")) return missingEnvResponse(message.split(":")[1] ?? "STRIPE_SECRET_KEY");
    throw error;
  }

  try {
    // Ensure a Stripe Customer (shared with billing so conversion reuses it).
    let customerId = trial.stripe_customer_id ?? (await getCustomer(db, session.frisky_org_id))?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.email,
        name: session.name,
        metadata: {
          frisky_org_id: session.frisky_org_id,
          frisky_user_id: session.frisky_user_id,
          source: "myfenrir_trial"
        }
      });
      customerId = customer.id;
      await upsertCustomer(db, {
        frisky_org_id: session.frisky_org_id,
        frisky_user_id: session.frisky_user_id,
        stripe_customer_id: customerId,
        email: session.email || "pending@unknown"
      });
    }
    await anchorStripeCustomer(context.env, {
      stripe_customer_id: customerId,
      frisky_org_id: session.frisky_org_id,
      frisky_user_id: session.frisky_user_id,
      email: session.email || "pending@unknown"
    }).catch((error) => console.error("trial_stripe_customer_anchor_failed", String(error)));

    // Reuse an in-flight SetupIntent when possible, otherwise mint a new one.
    let setupIntent: Awaited<ReturnType<typeof stripe.setupIntents.create>> | null = null;
    if (trial.stripe_setup_intent_id) {
      try {
        const existing = await stripe.setupIntents.retrieve(trial.stripe_setup_intent_id);
        if (existing.status === "succeeded") {
          return noStoreJson({ ok: false, error: "card_already_captured", next: "/api/trial/verify" }, { status: 409 });
        }
        if (REUSABLE_SETUP_INTENT_STATES.has(existing.status)) setupIntent = existing;
      } catch {
        setupIntent = null; // stale id -> create a fresh one
      }
    }

    if (!setupIntent) {
      setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: "off_session",
        payment_method_types: ["card"],
        metadata: {
          kind: "myfenrir_trial",
          trial_id: trial.id,
          code: trial.code,
          frisky_org_id: session.frisky_org_id,
          frisky_user_id: session.frisky_user_id
        }
      });
    }

    await attachStripeToTrial(db, trial.id, {
      stripe_customer_id: customerId,
      stripe_setup_intent_id: setupIntent.id
    });

    return noStoreJson({
      ok: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId,
      trialId: trial.id
    });
  } catch (error) {
    console.error("trial_setup_intent_error", error);
    return noStoreJson({ ok: false, error: "stripe_setup_intent_failed" }, { status: 502 });
  }
}
