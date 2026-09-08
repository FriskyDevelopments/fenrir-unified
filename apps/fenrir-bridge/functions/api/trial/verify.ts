// User: verify the SetupIntent and start the card-backed trial.
//   POST /api/trial/verify  { code? }
//
// Confirms the SetupIntent succeeded (card saved by Stripe), sets it as the
// customer's default payment method for later conversion, consumes one code use,
// and flips the trial to active.

import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, missingEnvResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { getStripe } from "../../_lib/stripe";
import {
  activateTrial,
  claimInviteUse,
  getInviteCode,
  getTrialByOrgAndCode,
  getTrialForOrg,
  isCodeExpired,
  normalizeInviteCode,
  publicTrial,
  releaseInviteUse,
  setTrialCardOnFile
} from "../../_lib/trials-db";

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

  if (!trial) return noStoreJson({ ok: false, error: "no_trial" }, { status: 404 });
  if (trial.status === "active" || trial.status === "converted") {
    return noStoreJson({ ok: true, alreadyActive: true, trial: publicTrial(trial) });
  }
  if (!trial.stripe_setup_intent_id) {
    return noStoreJson({ ok: false, error: "no_setup_intent", next: "/api/trial/setup-intent" }, { status: 409 });
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
    const setupIntent = await stripe.setupIntents.retrieve(trial.stripe_setup_intent_id);
    if (setupIntent.status !== "succeeded") {
      return noStoreJson(
        { ok: false, error: "card_not_confirmed", setupIntentStatus: setupIntent.status },
        { status: 409 }
      );
    }

    // Save the captured payment method as the customer default (for conversion).
    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id ?? null;
    const customerId = trial.stripe_customer_id ?? (typeof setupIntent.customer === "string" ? setupIntent.customer : null);
    if (paymentMethodId && customerId) {
      try {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId }
        });
      } catch (error) {
        console.error("trial_default_pm_update_failed", error);
      }
    }

    await setTrialCardOnFile(db, trial.id, true);

    const invite = await getInviteCode(db, trial.code);
    if (!invite || invite.status !== "active") {
      return noStoreJson({ ok: false, error: "invite_code_invalid", cardOnFile: true }, { status: 409 });
    }
    if (isCodeExpired(invite)) {
      return noStoreJson({ ok: false, error: "invite_code_expired", cardOnFile: true }, { status: 410 });
    }

    const claimed = await claimInviteUse(db, trial.code);
    if (!claimed) {
      // Card is safely on file, but the code ran out of capacity in the meantime.
      return noStoreJson({ ok: false, error: "invite_code_exhausted", cardOnFile: true }, { status: 409 });
    }

    const activated = await activateTrial(db, trial.id, {
      durationDays: invite.duration_days,
      cardOnFile: true
    });
    if (!activated) {
      // Another verifier/webhook won the pending_card -> active transition.
      // Return this request's invite claim so concurrent calls consume one use
      // in total, then report the winning state idempotently.
      await releaseInviteUse(db, trial.code);
      const current = await getTrialForOrg(db, session.frisky_org_id);
      if (current?.status === "active" || current?.status === "converted") {
        return noStoreJson({ ok: true, alreadyActive: true, trial: publicTrial(current) });
      }
      return noStoreJson({ ok: false, error: "trial_start_failed" }, { status: 500 });
    }

    return noStoreJson({ ok: true, trial: publicTrial(activated) });
  } catch (error) {
    console.error("trial_verify_error", error);
    return noStoreJson({ ok: false, error: "stripe_verify_failed" }, { status: 502 });
  }
}
