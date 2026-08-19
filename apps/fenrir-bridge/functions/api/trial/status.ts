// User: current trial status.
//   GET /api/trial/status
//
// Lazily flips an active trial to expired once ends_at has passed, then reports
// the current state (status, cardOnFile, plan, endsAt, daysRemaining).

import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { expireIfNeeded, getTrialForOrg, publicTrial } from "../../_lib/trials-db";

export async function onRequestGet(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();
  const db = context.env.DB;

  let trial = await getTrialForOrg(db, session.frisky_org_id);
  if (trial) trial = await expireIfNeeded(db, trial);

  return noStoreJson({
    ok: true,
    hasTrial: Boolean(trial),
    trial: trial ? publicTrial(trial) : null
  });
}
