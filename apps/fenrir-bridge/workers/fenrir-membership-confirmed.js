/**
 * fenrir-membership-confirmed — the convergence point that did not exist.
 *
 * THE PROBLEM
 * Four rails write entitlement into `billing_subscriptions` — Telegram Stars,
 * Stripe, courtesy, referral — and each then does its own ad-hoc side effect.
 * Stars sends a Telegram message and no email. Stripe sends an email and no
 * Telegram message. Courtesy and referral do neither. There was no shared
 * "entitlement confirmed" event to hang a celebration on, so the same purchase
 * produced a different experience depending on how it was paid for.
 *
 * THIS WORKER IS THAT EVENT. One place, one behaviour, both rails.
 *
 * TWO WAYS IN, DELIBERATELY
 *   1. POST /membership/confirmed  — the hook. A rail calls it right after it
 *      writes entitlement and the member is confirmed within a second. This is
 *      the one-line change each rail needs; those files are owned by other work
 *      in flight, so this worker does not edit them.
 *   2. The cron reconciler — sweeps `billing_subscriptions` for entitlements
 *      that became active and have no confirmation logged, and confirms them.
 *      This means the feature works TODAY with ZERO edits to the charge path.
 *      When the hooks land it simply has less to do.
 *
 * It never writes to `billing_subscriptions` and never participates in taking
 * money. It reads entitlement and it sends the confirmation.
 *
 * HONESTY RULES, ENFORCED HERE
 *   - No email on file => status 'skipped', reason 'no_email_on_file'. Logged,
 *     visible, never a silent drop and never a fabricated recipient.
 *   - Facts go out exactly as membership-facts resolved them, unknowns included.
 *   - Exactly-once per (org, subscription) via a claim on membership_confirmations.
 */

import { getMembershipFacts } from "./_lib/membership-facts.js";
import { membershipEmail } from "./_lib/membership-email.js";

const nowIso = () => new Date().toISOString();
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* -------------------------------------------------------------------------- */
/* auth                                                                        */
/* -------------------------------------------------------------------------- */

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare so a caller cannot probe the signature byte by byte. */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------------------- */
/* delivery log                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Claim the right to confirm this (org, subscription).
 * Returns false if someone already holds it — the hook and the cron can race
 * and only one may send. INSERT ... ON CONFLICT DO NOTHING is the whole lock.
 */
async function claim(env, orgId, subscriptionId) {
  const ts = nowIso();
  const res = await env.DB.prepare(
    `INSERT INTO membership_confirmations
       (frisky_org_id, subscription_id, status, attempts, created_at, updated_at)
     VALUES (?1, ?2, 'pending', 0, ?3, ?3)
     ON CONFLICT (frisky_org_id, subscription_id) DO NOTHING`
  ).bind(orgId, subscriptionId, ts).run();
  return (res.meta?.changes ?? 0) > 0;
}

async function settle(env, orgId, subscriptionId, patch) {
  const ts = nowIso();
  await env.DB.prepare(
    `UPDATE membership_confirmations
        SET status = ?3, reason = ?4, contact_source = ?5, plan = ?6, rail = ?7,
            provider_message_id = ?8, attempts = attempts + 1, updated_at = ?9
      WHERE frisky_org_id = ?1 AND subscription_id = ?2`
  ).bind(
    orgId, subscriptionId,
    patch.status, patch.reason ?? null, patch.contactSource ?? null,
    patch.plan ?? null, patch.rail ?? null, patch.messageId ?? null, ts
  ).run();
}

/* -------------------------------------------------------------------------- */
/* delivery                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Send through Resend.
 *
 * NOTE ON THE FROM ADDRESS: `noreply@myfenrir.com` is NOT a verified sender in
 * the Resend account — only `hostcasa.app` is. Sending as myfenrir.com would be
 * rejected, so FENRIR_MAIL_FROM defaults to the address that actually delivers.
 * Verifying myfenrir.com in Resend is tracked as follow-up work; until then this
 * constant is the honest one rather than the one we wish were true.
 */
async function sendViaResend(env, { to, subject, html, text }) {
  const from = env.FENRIR_MAIL_FROM || "MyFenrir <noreply@hostcasa.app>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend_${res.status}:${body?.message || "unknown"}`);
  return body?.id ?? null;
}

/**
 * Reach the buyer where they bought. Someone who paid inside Telegram should
 * hear about it in Telegram, not only by email. Best-effort: a Telegram failure
 * must never fail the confirmation, because the email is the record.
 */
async function notifyTelegram(env, telegramUserId, facts) {
  if (!env.TELEGRAM_BOT_TOKEN || !telegramUserId) return { sent: false, reason: "no_telegram_target" };
  const plan = facts.plan.display ?? "your membership";
  const paid = facts.amount.charged === false ? "No charge — granted" : (facts.amount.display ?? "amount not recorded");
  const term = facts.term.currentPeriodEnd
    ? `Renews ${new Date(facts.term.currentPeriodEnd).toISOString().slice(0, 10)}`
    : "No renewal date on file";
  const lines = [
    `🐺 <b>You're in ${plan}.</b>`,
    "",
    `Paid: ${paid}`,
    `Rail: ${facts.rail.label ?? "not recorded"}`,
    term,
    "",
    facts.limits?.locksUnlimited ? "Locks: unlimited · multi-admin · audit logs · custom domain" : "",
    "",
    `<a href="${env.FENRIR_PORTAL_URL || "https://www.myfenrir.com/dashboard"}">Open your portal →</a>`,
  ].filter(Boolean);

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return { sent: res.ok, reason: res.ok ? null : `telegram_${res.status}` };
  } catch (error) {
    return { sent: false, reason: `telegram_error:${String(error)}` };
  }
}

/* -------------------------------------------------------------------------- */
/* the confirmation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Confirm one org. Idempotent, honest about every outcome.
 * `force` re-sends an already-settled confirmation (operator use only).
 */
export async function confirmMembership(env, friskyOrgId, { force = false, locale = "en" } = {}) {
  const facts = await getMembershipFacts(env.DB, friskyOrgId);

  if (!facts.entitled) {
    // Nothing to celebrate. Say why; do not invent an entitlement.
    return { ok: true, confirmed: false, reason: facts.reason ?? "not_entitled" };
  }

  const subscriptionId = facts.subscriptionId;
  const claimed = await claim(env, friskyOrgId, subscriptionId);
  if (!claimed && !force) {
    return { ok: true, confirmed: false, reason: "already_confirmed" };
  }

  // No address => a real, recorded outcome. Never a silent drop.
  if (!facts.contact.email) {
    await settle(env, friskyOrgId, subscriptionId, {
      status: "skipped",
      reason: facts.contact.reason ?? "no_email_on_file",
      plan: facts.plan.key,
      rail: facts.rail.key,
    });
    // Still try Telegram — a Stars buyer with no email on file is exactly the
    // person we can still reach, and reaching them beats reaching no one.
    const tg = await notifyTelegram(env, facts.contact.telegramUserId, facts);
    return {
      ok: true,
      confirmed: false,
      reason: facts.contact.reason ?? "no_email_on_file",
      telegramNotified: tg.sent,
      note: "Entitlement is live; we have no address on file for this member, so no email was sent.",
    };
  }

  const mail = membershipEmail(facts, {
    locale,
    portalUrl: env.FENRIR_PORTAL_URL || "https://www.myfenrir.com/dashboard",
  });

  try {
    const messageId = await sendViaResend(env, {
      to: facts.contact.email, subject: mail.subject, html: mail.html, text: mail.text,
    });
    await settle(env, friskyOrgId, subscriptionId, {
      status: "sent", reason: null, contactSource: facts.contact.source,
      plan: facts.plan.key, rail: facts.rail.key, messageId,
    });
    const tg = await notifyTelegram(env, facts.contact.telegramUserId, facts);
    return { ok: true, confirmed: true, messageId, contactSource: facts.contact.source, telegramNotified: tg.sent };
  } catch (error) {
    await settle(env, friskyOrgId, subscriptionId, {
      status: "failed", reason: String(error).slice(0, 300),
      contactSource: facts.contact.source, plan: facts.plan.key, rail: facts.rail.key,
    });
    // Surfaced, not swallowed. The row stays queryable as a failure.
    return { ok: false, confirmed: false, reason: String(error) };
  }
}

/* -------------------------------------------------------------------------- */
/* reconciler                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sweep for entitlements that went live without a confirmation.
 *
 * This is what lets the celebration ship without touching the charge path: no
 * rail has to call anything for a new member to be confirmed. It is also the
 * safety net for hook delivery failures once the hooks do exist.
 */
export async function reconcile(env, { limit = 25, locale = "en" } = {}) {
  const rows = await env.DB.prepare(
    `SELECT s.frisky_org_id, s.stripe_subscription_id
       FROM billing_subscriptions s
       LEFT JOIN membership_confirmations c
              ON c.frisky_org_id = s.frisky_org_id
             AND c.subscription_id = s.stripe_subscription_id
      WHERE s.status IN ('active','trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > ?1)
        AND c.frisky_org_id IS NULL
      ORDER BY s.updated_at DESC
      LIMIT ?2`
  ).bind(nowIso(), limit).all();

  const results = [];
  for (const row of rows.results ?? []) {
    results.push({
      org: row.frisky_org_id,
      ...(await confirmMembership(env, row.frisky_org_id, { locale })),
    });
  }
  return { ok: true, scanned: rows.results?.length ?? 0, results };
}

/* -------------------------------------------------------------------------- */
/* worker                                                                      */
/* -------------------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The hook. A rail calls this immediately after entitlement is written:
    //   POST /membership/confirmed
    //   x-fenrir-membership-signature: hmac_sha256(secret, rawBody)
    //   { "frisky_org_id": "...", "locale": "en" }
    if (request.method === "POST" && url.pathname === "/membership/confirmed") {
      const raw = await request.text();
      const secret = (env.MEMBERSHIP_CONFIRM_SECRET || "").trim();
      if (!secret) return json({ ok: false, error: "hook_not_configured" }, 503);

      const supplied = request.headers.get("x-fenrir-membership-signature") || "";
      if (!safeEqual(supplied, await hmacHex(secret, raw))) {
        return json({ ok: false, error: "bad_signature" }, 401);
      }

      let body;
      try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad_json" }, 400); }
      const orgId = String(body?.frisky_org_id || "").trim();
      if (!orgId) return json({ ok: false, error: "missing_frisky_org_id" }, 400);

      const result = await confirmMembership(env, orgId, {
        locale: body?.locale === "es" ? "es" : "en",
        force: body?.force === true,
      });
      return json(result, result.ok ? 200 : 502);
    }

    // Operator view: what have we failed or skipped, and why. Same secret.
    if (request.method === "GET" && url.pathname === "/membership/confirmations") {
      const secret = (env.MEMBERSHIP_CONFIRM_SECRET || "").trim();
      const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
      if (!secret || !safeEqual(supplied, secret)) return json({ ok: false, error: "unauthorized" }, 401);
      const rows = await env.DB.prepare(
        `SELECT * FROM membership_confirmations ORDER BY updated_at DESC LIMIT 100`
      ).all();
      return json({ ok: true, confirmations: rows.results ?? [] });
    }

    return json({ ok: false, error: "not_found" }, 404);
  },

  // Safety net + the reason no rail edit is required to ship this.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      reconcile(env).then((r) => console.log("membership_reconcile", JSON.stringify(r)))
    );
  },
};
