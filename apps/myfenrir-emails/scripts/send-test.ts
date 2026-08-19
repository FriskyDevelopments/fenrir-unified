// Real end-to-end test of the FALLBACK transport (Resend) with a live send.
// The Cloudflare path can only send once myfenrir.com is onboarded in Email
// Service; this proves templates + delivery via a Resend-verified domain.
//
// The Resend account currently verifies `hostcasa.app` (not myfenrir.com), so
// the default TEST_FROM uses it purely as a delivery rail for this smoke test.
// To send from @myfenrir.com via Resend, verify myfenrir.com in Resend first
// (the Cloudflare default needs no such step).
//
// Run with the key injected by 1Password (never paste the key):
//   op run --no-masking -- \
//     env TEST_TO=babaji.alvarez@gmail.com \
//     RESEND_API_KEY="$(op read op://FriskyDev-Infra/Email/password)" \
//     npx tsx scripts/send-test.ts verificacion-codigo
import { getTemplate, TEMPLATE_IDS } from "../src/templates/index.ts";
import { myfenrir } from "../src/brands/myfenrir.ts";

const KEY = process.env.RESEND_API_KEY;
const TO = process.env.TEST_TO || "babaji.alvarez@gmail.com";
const FROM = process.env.TEST_FROM || "MyFenrir <noreply@hostcasa.app>"; // Resend-verified rail
const REPLY_TO = process.env.TEST_REPLY_TO || "hola@myfenrir.com";
const templateId = process.argv[2] || "verificacion-codigo";

if (!KEY) {
  console.error("RESEND_API_KEY not set. See the header of this file for the op command.");
  process.exit(1);
}
const tpl = getTemplate(templateId);
if (!tpl) {
  throw new Error(`Unknown template '${templateId}'. Options: ${TEMPLATE_IDS.join(", ")}`);
}

const { subject, html, text } = tpl.render(myfenrir, tpl.sample);

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: FROM, to: [TO], reply_to: REPLY_TO, subject, html, text }),
});
const data = await res.json().catch(() => ({}));
console.log("status", res.status);
console.log(JSON.stringify(data, null, 2));
if (!res.ok) process.exit(1);
console.log(`\nSent "${subject}" (template=${templateId}) to ${TO} from ${FROM} via Resend.`);
