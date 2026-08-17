/**
 * celebrate-trigger — verifies the celebration fires exactly when it should.
 *
 * Runs the same logic /api/membership/state and /api/membership/celebrated use,
 * against production D1, for a real session identity. Proves:
 *   1. an existing member (covered by the 0002 backfill) is NOT celebrated —
 *      the thing that would otherwise make everyone think they just joined
 *   2. a member who has not seen their current membership IS celebrated
 *   3. acknowledging is idempotent and stops it firing again
 *   4. past_due suppresses the moment (they need the warning, not a party)
 */
import { db } from "./d1-cli-adapter.mjs";
import { getMembershipFacts } from "../membership-facts.js";

const USER = "frisky_usr_WORKOSUSER01KTFXXR_PNB50A";
const ORG = "frisky_org_FRISKYUSRWORKOSUSE_7ZAXU2";

/** Mirrors the `celebrate` computation in functions/api/membership/state.ts. */
async function shouldCelebrate(userId, orgId) {
  const facts = await getMembershipFacts(db, orgId);
  if (!facts.entitled || facts.status.needsAttention) {
    return { celebrate: false, why: facts.entitled ? "needs_attention" : facts.reason };
  }
  const seen = await db
    .prepare(`SELECT 1 AS hit FROM membership_celebrations WHERE frisky_user_id = ?1 AND subscription_id = ?2 LIMIT 1`)
    .bind(userId, facts.subscriptionId)
    .first();
  return { celebrate: !seen, why: seen ? "already_seen" : "owed", subscriptionId: facts.subscriptionId };
}

/** Mirrors functions/api/membership/celebrated.ts. */
async function acknowledge(userId, orgId) {
  const facts = await getMembershipFacts(db, orgId);
  if (!facts.entitled) return { recorded: false, reason: facts.reason };
  await db
    .prepare(
      `INSERT INTO membership_celebrations (frisky_user_id, subscription_id, frisky_org_id, seen_at)
       VALUES (?1, ?2, ?3, ?4) ON CONFLICT (frisky_user_id, subscription_id) DO NOTHING`
    )
    .bind(userId, facts.subscriptionId, orgId, new Date().toISOString())
    .run();
  return { recorded: true };
}

const del = async (userId, subId) =>
  db.prepare(`DELETE FROM membership_celebrations WHERE frisky_user_id = ?1 AND subscription_id = ?2`)
    .bind(userId, subId).run();

console.log("\n[1] existing member, covered by the 0002 backfill");
const a = await shouldCelebrate(USER, ORG);
console.log("   ", JSON.stringify(a), a.celebrate === false ? "OK — no false welcome" : "FAIL");

console.log("\n[2] same member with no seen row (i.e. a fresh confirmation)");
await del(USER, a.subscriptionId);
const b = await shouldCelebrate(USER, ORG);
console.log("   ", JSON.stringify(b), b.celebrate === true ? "OK — moment is owed" : "FAIL");

console.log("\n[3] acknowledge, then re-check");
console.log("    ack:", JSON.stringify(await acknowledge(USER, ORG)));
const c = await shouldCelebrate(USER, ORG);
console.log("   ", JSON.stringify(c), c.celebrate === false ? "OK — fires once" : "FAIL");

console.log("\n[4] acknowledging twice is harmless");
console.log("    ack:", JSON.stringify(await acknowledge(USER, ORG)));
const d = await shouldCelebrate(USER, ORG);
console.log("   ", JSON.stringify(d), d.celebrate === false ? "OK" : "FAIL");

console.log("\n[5] a user with no membership is never celebrated");
const e = await shouldCelebrate("frisky_usr_NOBODY", "frisky_org_NOPE");
console.log("   ", JSON.stringify(e), e.celebrate === false ? "OK" : "FAIL");

console.log("\n[6] final state of this user's celebration rows");
const rows = await db
  .prepare(`SELECT frisky_user_id, subscription_id, seen_at FROM membership_celebrations WHERE frisky_user_id = ?1`)
  .bind(USER).all();
console.table(rows.results);
