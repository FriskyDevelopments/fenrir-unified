// User: redeem an invite code ("use code").
//   POST /api/trial/redeem  { code }
//
// require_card = false  -> the trial starts immediately (card_on_file = 0).
// require_card = true   -> a pending_card trial is created; the client must then
//                          call /api/trial/setup-intent + /api/trial/verify.
//                          The code use is NOT consumed until the card is verified,
//                          so abandoned card flows don't burn a code.

import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { getCustomer } from "../../_lib/billing-db";
import {
  claimInviteUse,
  getInviteCode,
  getTrialForOrg,
  isCodeExpired,
  normalizeInviteCode,
  publicTrial,
  releaseInviteUse,
  upsertTrial
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
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const code = normalizeInviteCode(body?.code);
  if (!code) return noStoreJson({ ok: false, error: "invite_code_required" }, { status: 400 });

  const invite = await getInviteCode(db, code);
  if (!invite || invite.status !== "active") return noStoreJson({ ok: false, error: "invite_code_invalid" }, { status: 404 });
  if (isCodeExpired(invite)) return noStoreJson({ ok: false, error: "invite_code_expired" }, { status: 410 });
  if (invite.used_count >= invite.max_uses) return noStoreJson({ ok: false, error: "invite_code_exhausted" }, { status: 409 });

  const existing = await getTrialForOrg(db, session.frisky_org_id);
  if (existing && (existing.status === "active" || existing.status === "converted")) {
    return noStoreJson({ ok: false, error: "trial_already_active", trial: publicTrial(existing) }, { status: 409 });
  }

  // Carry any Stripe customer we already know about (billing or a prior pending trial).
  const priorCustomer =
    existing?.stripe_customer_id ?? (await getCustomer(db, session.frisky_org_id))?.stripe_customer_id ?? null;

  if (invite.require_card === 1) {
    const trial = await upsertTrial(db, {
      frisky_org_id: session.frisky_org_id,
      frisky_user_id: session.frisky_user_id,
      user_email: session.email,
      code,
      status: "pending_card",
      card_on_file: existing?.card_on_file ?? 0,
      stripe_customer_id: priorCustomer,
      stripe_setup_intent_id: existing?.stripe_setup_intent_id ?? null,
      plan: invite.plan
    });
    return noStoreJson({
      ok: true,
      requiresCard: true,
      next: "/api/trial/setup-intent",
      trial: trial ? publicTrial(trial) : null
    });
  }

  // No card required: consume a use atomically, then start the trial now.
  const claimed = await claimInviteUse(db, code);
  if (!claimed) return noStoreJson({ ok: false, error: "invite_code_exhausted" }, { status: 409 });

  const startMs = Date.now();
  const trial = await upsertTrial(db, {
    frisky_org_id: session.frisky_org_id,
    frisky_user_id: session.frisky_user_id,
    user_email: session.email,
    code,
    status: "active",
    card_on_file: 0,
    stripe_customer_id: priorCustomer,
    stripe_setup_intent_id: null,
    plan: invite.plan,
    started_at: new Date(startMs).toISOString(),
    ends_at: new Date(startMs + invite.duration_days * 86_400_000).toISOString()
  });

  if (!trial) {
    await releaseInviteUse(db, code); // roll back the consumed use if the write failed
    const current = await getTrialForOrg(db, session.frisky_org_id);
    if (current && (current.status === "active" || current.status === "converted")) {
      return noStoreJson(
        { ok: false, error: "trial_already_active", trial: publicTrial(current) },
        { status: 409 }
      );
    }
    return noStoreJson({ ok: false, error: "trial_start_failed" }, { status: 500 });
  }

  return noStoreJson({ ok: true, requiresCard: false, trial: publicTrial(trial) });
}
