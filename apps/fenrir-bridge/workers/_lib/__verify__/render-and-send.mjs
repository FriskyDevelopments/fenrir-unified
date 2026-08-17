/**
 * render-and-send — end-to-end verification of the confirmation email.
 *
 *   node render-and-send.mjs <frisky_org_id> [--send] [--to addr]
 *
 * Runs getMembershipFacts() against production D1, renders membershipEmail(),
 * writes the HTML for screenshotting, and with --send delivers it via Resend.
 *
 * The recipient is NEVER inferred from a flag alone when sending: it comes from
 * resolveContact() unless --to is given, and --to is guarded by an allowlist so
 * a verification run can never reach a third party.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { db } from "./d1-cli-adapter.mjs";
import { getMembershipFacts } from "../membership-facts.js";
import { membershipEmail } from "../membership-email.js";

const argv = process.argv.slice(2);
const orgId = argv.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const doSend = argv.includes("--send");
const outPath = flag("out") || "/tmp/fenrir-membership-email.html";

// Verification safety rail: only the account owner may receive a test send.
const ALLOWED_TEST_RECIPIENTS = new Set(["babaji.alvarez@gmail.com"]);
// Same rule as the worker: a MyFenrir email leaves as MyFenrir or it does not
// leave. This was hostcasa.app — another product's domain — because that is the
// only domain verified in the Resend account. A verification send is still a
// real email landing in a real inbox, so it does not get an exception.
// Until myfenrir.com is provisioned (see docs/MYFENRIR_SENDER_IDENTITY.md) this
// will fail with 403, which is the correct and visible outcome.
const FROM = "MyFenrir <noreply@myfenrir.com>";
const REPLY_TO = "hola@myfenrir.com";

if (!orgId) {
  console.error("usage: render-and-send.mjs <frisky_org_id> [--send] [--locale es] [--to addr]");
  process.exit(1);
}

const facts = await getMembershipFacts(db, orgId);
console.log("\n=== FACTS ===");
console.log(JSON.stringify(facts, null, 2));

if (!facts.entitled) {
  console.log(`\nNot entitled (${facts.reason}). No confirmation would be sent. This is the correct outcome.`);
  process.exit(0);
}

const mail = membershipEmail(facts, { portalUrl: "https://www.myfenrir.com/dashboard" });
writeFileSync(outPath, mail.html);
console.log(`\n=== RENDERED ===\nsubject: ${mail.subject}\nhtml:    ${outPath}\n`);
console.log(mail.text);

if (!doSend) {
  console.log("\n(dry run — pass --send to deliver)");
  process.exit(0);
}

const recipient = flag("to") || facts.contact.email;
if (!recipient) {
  console.error(`\nREFUSING TO SEND: ${facts.contact.reason}. Nothing was delivered and nothing was faked.`);
  process.exit(2);
}
if (!ALLOWED_TEST_RECIPIENTS.has(recipient)) {
  console.error(`\nREFUSING TO SEND to ${recipient} — not in the verification allowlist.`);
  console.error("Resolved contact is real, but test sends are restricted to the account owner.");
  process.exit(3);
}

const apiKey = execFileSync("op", ["read", "op://FriskyDev-Infra/Email/password"], { encoding: "utf8" }).trim();
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [recipient], subject: mail.subject, html: mail.html, text: mail.text }),
});
const body = await res.json();
console.log(`\n=== SEND ===\nHTTP ${res.status}`, body);
if (!res.ok) process.exit(4);
console.log(`Delivered to ${recipient} (resolved via ${facts.contact.source || "--to override"}).`);
