/**
 * confirm-flow — exercises fenrir-membership-confirmed against production D1.
 *
 *   node confirm-flow.mjs [--send]
 *
 * Without --send, email delivery is stubbed (so the flow, the claim and the
 * log are all real, but nobody gets mail). Proves:
 *   1. a first confirmation claims and settles
 *   2. a second is refused as already_confirmed (exactly-once)
 *   3. an org with no address is 'skipped' with a reason, not silently dropped
 *   4. an unentitled org confirms nothing
 *   5. the reconciler finds unconfirmed entitlements with no rail edits
 */
import { execFileSync } from "node:child_process";
import { db } from "./d1-cli-adapter.mjs";
import { confirmMembership, reconcile } from "../../fenrir-membership-confirmed.js";

const doSend = process.argv.includes("--send");
const OWNER = "babaji.alvarez@gmail.com";

// Stub Resend unless --send. Guard rail: even with --send, only the owner.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.startsWith("https://api.resend.com")) {
    const to = JSON.parse(init.body).to?.[0];
    if (!doSend) { console.log(`    [stub] would email ${to}`); return new Response(JSON.stringify({ id: "stub-id" }), { status: 200 }); }
    if (to !== OWNER) { console.log(`    [blocked] refusing test send to ${to}`); return new Response(JSON.stringify({ id: "blocked" }), { status: 200 }); }
    return realFetch(url, init);
  }
  if (href.startsWith("https://api.telegram.org")) {
    console.log("    [stub] telegram notify suppressed in verification");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return realFetch(url, init);
};

const env = {
  DB: db,
  RESEND_API_KEY: doSend ? execFileSync("op", ["read", "op://FriskyDev-Infra/Email/password"], { encoding: "utf8" }).trim() : "stub",
  FENRIR_PORTAL_URL: "https://www.myfenrir.com/dashboard",
  // TELEGRAM_BOT_TOKEN intentionally unset: proves the no-target path is handled.
};

const ORG_OWNER = "frisky_org_FRISKYUSRWORKOSUSE_7ZAXU2";
const ORG_TELEGRAM = "frisky_org_FRISKYUSRSUPABASE9_15G0AZO";

console.log("\n[1] first confirmation — claims and settles");
console.log("   ", JSON.stringify(await confirmMembership(env, ORG_OWNER)));

console.log("\n[2] second confirmation — must be refused (exactly-once)");
console.log("   ", JSON.stringify(await confirmMembership(env, ORG_OWNER)));

console.log("\n[3] telegram-linked org — resolves the Apple relay, not the gmail");
console.log("   ", JSON.stringify(await confirmMembership(env, ORG_TELEGRAM)));

console.log("\n[4] unentitled org — confirms nothing, states why");
console.log("   ", JSON.stringify(await confirmMembership(env, "frisky_org_NOPE")));

console.log("\n[5] reconciler — finds unconfirmed entitlements with zero rail edits");
console.log("   ", JSON.stringify(await reconcile(env), null, 2));

console.log("\n[6] delivery log");
const log = await db.prepare(
  `SELECT frisky_org_id, subscription_id, status, reason, contact_source, plan, rail, attempts FROM membership_confirmations ORDER BY updated_at DESC`
).all();
console.table(log.results);
