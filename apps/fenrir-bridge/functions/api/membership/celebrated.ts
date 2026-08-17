/**
 * POST /api/membership/celebrated
 *
 * Acknowledges that this user has been shown the moment for their current
 * membership, so it never fires twice.
 *
 * The subscription id is resolved server-side from the caller's own session
 * rather than accepted from the request body — otherwise a client could mark
 * an arbitrary subscription as celebrated and suppress someone else's moment.
 */
import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
// @ts-expect-error — plain-JS module shared with the Stars worker runtime.
import { getMembershipFacts } from "../../../workers/_lib/membership-facts.js";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!context.env.DB) {
    return dbNotConfiguredResponse();
  }

  const facts = await getMembershipFacts(context.env.DB, session.frisky_org_id);
  if (!facts.entitled) {
    // Nothing to acknowledge. Not an error — just nothing to record.
    return noStoreJson({ ok: true, recorded: false, reason: facts.reason ?? "not_entitled" });
  }

  await context.env.DB.prepare(
    `INSERT INTO membership_celebrations (frisky_user_id, subscription_id, frisky_org_id, seen_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (frisky_user_id, subscription_id) DO NOTHING`
  )
    .bind(session.frisky_user_id, facts.subscriptionId, session.frisky_org_id, new Date().toISOString())
    .run();

  return noStoreJson({ ok: true, recorded: true });
}
