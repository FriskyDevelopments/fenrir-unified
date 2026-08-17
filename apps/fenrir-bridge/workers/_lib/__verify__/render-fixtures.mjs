/**
 * render-fixtures — render the confirmation email against hand-built facts.
 *
 *   node render-fixtures.mjs [outDir]     # default: /tmp/fenrir-membership-preview
 *
 * render-and-send.mjs needs production D1 and one real org, so it can only ever
 * show you the one state that org happens to be in. This renders the states
 * that matter — including the ones you cannot conjure on demand — so the layout
 * can be checked at 320px and in both colour schemes before anything ships.
 *
 * The fixtures are shaped exactly like getMembershipFacts() output. If that
 * shape changes, these break loudly, which is the point.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { membershipEmail } from "../membership-email.js";

const outDir = process.argv[2] || "/tmp/fenrir-membership-preview";
mkdirSync(outDir, { recursive: true });

const FULL = { maxTelegramLocks: null, locksUnlimited: true, multiAdmin: true, auditLogs: true, customDomain: true };
const PRO = { maxTelegramLocks: 10, locksUnlimited: false, multiAdmin: true, auditLogs: true, customDomain: false };
const STARTER = { maxTelegramLocks: 3, locksUnlimited: false, multiAdmin: false, auditLogs: false, customDomain: false };

const base = {
  ok: true,
  entitled: true,
  friskyOrgId: "frisky_org_demo",
  subscriptionId: "stars:12345",
  checkedAt: new Date().toISOString(),
  status: { raw: "active", needsAttention: false, cancelAtPeriodEnd: false },
  contact: { email: "member@example.com", source: "telegram_identity_links", telegramUserId: "12345", reason: null },
};

const FIXTURES = {
  // The live Stars case, and the reason the "no end date" wording matters:
  // the Stars rail writes entitlement with current_period_end = NULL.
  "01-pack-stars-no-term": {
    ...base,
    plan: { key: "standard", display: "The Pack", recognised: true },
    term: { currentPeriodEnd: null, known: false, reason: "no_period_end_recorded" },
    rail: { key: "telegram_stars", label: "Telegram Stars" },
    amount: { charged: true, amount: 500, currency: "XTR", display: "500 ⭐ Telegram Stars", reason: null },
    limits: FULL,
  },
  // What the same email looks like the day the term bug is fixed. Nothing in
  // the template changes: the Access row becomes a Renews row and the footnote
  // disappears on its own.
  "02-pack-stripe-renews": {
    ...base,
    subscriptionId: "sub_1234",
    plan: { key: "standard", display: "The Pack", recognised: true },
    term: { currentPeriodEnd: "2027-03-14T00:00:00.000Z", known: true, reason: null },
    rail: { key: "stripe", label: "Stripe" },
    amount: { charged: true, amount: null, currency: null, display: null, reason: "amount_not_recorded_in_bridge" },
    limits: FULL,
  },
  // Warning styling: the only state that should look like it needs the member.
  "03-pro-past-due-cancelling": {
    ...base,
    subscriptionId: "sub_5678",
    plan: { key: "pro", display: "Pro", recognised: true },
    status: { raw: "past_due", needsAttention: true, cancelAtPeriodEnd: true },
    term: { currentPeriodEnd: "2026-09-01T00:00:00.000Z", known: true, reason: null },
    rail: { key: "stripe", label: "Stripe" },
    amount: { charged: true, amount: null, currency: null, display: null, reason: "amount_not_recorded_in_bridge" },
    limits: PRO,
  },
  // Longest label/value pairs plus a grant — the worst case for the 320px width.
  "04-courtesy-starter": {
    ...base,
    subscriptionId: "courtesy:9",
    plan: { key: "starter", display: "Starter", recognised: true },
    term: { currentPeriodEnd: null, known: false, reason: "no_period_end_recorded" },
    rail: { key: "courtesy", label: "Courtesy grant" },
    amount: { charged: false, amount: null, currency: null, display: "No charge — granted", reason: null },
    limits: STARTER,
  },
  // Unknown plan: no allowances shown, and it says so instead of guessing.
  "05-unrecognised-plan": {
    ...base,
    subscriptionId: "sub_9999",
    plan: { key: "legacy_beta", display: null, recognised: false },
    term: { currentPeriodEnd: null, known: false, reason: "no_period_end_recorded" },
    rail: { key: "unknown", label: null },
    amount: { charged: null, amount: null, currency: null, display: null, reason: "unknown_rail" },
    limits: null,
  },
};

const index = [];
for (const [name, facts] of Object.entries(FIXTURES)) {
  const mail = membershipEmail(facts, { portalUrl: "https://www.myfenrir.com/dashboard" });
  writeFileSync(join(outDir, `${name}.html`), mail.html, "utf8");
  writeFileSync(join(outDir, `${name}.txt`), `${mail.subject}\n\n${mail.text}\n`, "utf8");
  index.push({ name, subject: mail.subject });
  console.log(`${name}\n  subject: ${mail.subject}`);
}

writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
console.log(`\n${index.length} fixtures -> ${outDir}`);
