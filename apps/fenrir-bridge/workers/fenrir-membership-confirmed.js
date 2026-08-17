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

/* --------------------------------------------------------------------------
 * SENDER IDENTITY — this is a MyFenrir email and it may only leave as MyFenrir.
 *
 * The confirmation was going out as `noreply@hostcasa.app`. HostCasa is a
 * different product with different customers. A member who paid for The Pack
 * on MyFenrir receiving mail from another brand's domain reads as phishing,
 * and mixing one client's identity into another's is not a fallback we take.
 * That address was not a decision, it was the only domain verified in the
 * Resend account, so the code drifted to whatever happened to deliver.
 *
 * Verified 2026-08-17, from DNS and the Resend API, not from memory:
 *   myfenrir.com        SPF  "v=spf1 include:_spf.mx.cloudflare.net ~all"  PRESENT
 *                       DKIM cf2024-1._domainkey.myfenrir.com              PRESENT
 *                       MX   route{1,2,3}.mx.cloudflare.net                PRESENT
 *                       DMARC _dmarc.myfenrir.com                          ABSENT
 *   mail.myfenrir.com   SPF / DKIM / MX                                    ABSENT
 *                       DMARC _dmarc.mail.myfenrir.com "v=DMARC1; p=reject;"
 *   Resend GET /domains -> [{ name: "hostcasa.app", status: "verified" }]  ONLY
 *
 * Two conclusions follow.
 *
 * 1. mail.myfenrir.com is unusable. It publishes DMARC p=reject with no SPF and
 *    no DKIM, so anything sent from it fails DMARC and is hard-rejected. The
 *    comment in apps/myfenrir-emails/wrangler.toml was right and its own value
 *    was wrong; that file is corrected in the same change. The root domain
 *    myfenrir.com is the identity that authenticates.
 *
 * 2. Resend is gone from this path. It could not send as myfenrir.com anyway —
 *    the domain is not even added to that account — but the deciding reason is
 *    that a second rail is how the drift to hostcasa.app happened in the first
 *    place. One rail is one place it can break. Cloudflare Email Sending is
 *    already authenticated for myfenrir.com and needs no DNS work, so this
 *    worker now delivers through the myfenrir-emails Worker, which owns the
 *    `send_email` binding. (That binding is Workers-only; it cannot live in the
 *    fenrir-bridge Pages project, which is why the mail Worker exists.)
 *
 * There is deliberately NO fallback. A fallback that sends as another client's
 * brand is worse than no fallback. If Cloudflare fails, this fails: the outcome
 * is written to membership_confirmations with a legible reason, so it is visible
 * and countable. A confirmation that does not arrive is a bug we can see; a
 * confirmation wearing HostCasa's name is a brand incident we cannot take back.
 * -------------------------------------------------------------------------- */

/** Domains this worker is allowed to introduce itself as. MyFenrir only. */
const ALLOWED_FROM_DOMAINS = ["myfenrir.com"];

/** The visible name is the brand, never the legal entity. Members bought from
 *  MyFenrir; "Frisky Developments LLC" in a From line is the same category of
 *  error as the wrong domain. */
const DEFAULT_MAIL_FROM = "MyFenrir <noreply@myfenrir.com>";

/** Extract the addr-spec from a "Name <addr>" string. */
function fromAddress(value) {
  const m = /<([^>]+)>/.exec(String(value || ""));
  return (m ? m[1] : String(value || "")).trim().toLowerCase();
}

/**
 * Reject a From that is not MyFenrir, before anything is sent.
 * Subdomains are allowed (foo.myfenrir.com) so a future dedicated sending
 * subdomain does not need a code change — but a bare different domain cannot
 * slip through by being set in [vars].
 */
function assertMyFenrirSender(from) {
  const addr = fromAddress(from);
  const domain = addr.split("@")[1] || "";
  const ok = ALLOWED_FROM_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
  if (!ok) {
    throw new Error(
      `refused_foreign_sender:${domain || "unset"} — this is a MyFenrir email and may only be sent from ` +
      `${ALLOWED_FROM_DOMAINS.join(", ")}. Nothing was sent. See the SENDER IDENTITY note in this file.`
    );
  }
  if (domain === "mail.myfenrir.com") {
    throw new Error(
      "refused_sender:mail.myfenrir.com publishes DMARC p=reject with no SPF/DKIM and is hard-rejected. " +
      "Use noreply@myfenrir.com."
    );
  }
  return from;
}

/**
 * Deliver through the myfenrir-emails Worker (Cloudflare Email Sending).
 *
 * Renders here, delivers there: the confirmation is built from D1 billing facts
 * that belong to this service, while the mail Worker owns the authenticated
 * sender and the `send_email` binding. It is handed the finished HTML via the
 * `raw` shape on POST /send.
 *
 * `provider: "cloudflare"` is pinned in the request rather than left to the mail
 * Worker's env, so a config change over there cannot silently move this
 * confirmation onto another rail.
 *
 * Every failure mode throws with a legible reason and is recorded on
 * membership_confirmations. Nothing here retries onto a different sender.
 */
async function sendViaMyFenrirMail(env, { to, subject, html, text }) {
  const from = assertMyFenrirSender(env.FENRIR_MAIL_FROM || DEFAULT_MAIL_FROM);
  const endpoint = (env.MYFENRIR_MAIL_URL || "").trim();
  const token = (env.MYFENRIR_MAIL_TOKEN || "").trim();

  // Config gaps fail loudly and specifically. "not configured" is a different
  // problem from "the send was rejected", and the operator needs to know which.
  if (!endpoint) throw new Error("mail_not_configured:MYFENRIR_MAIL_URL is unset. Nothing was sent.");
  if (!token) throw new Error("mail_not_configured:MYFENRIR_MAIL_TOKEN secret is unset. Nothing was sent.");

  const addr = fromAddress(from);
  const name = /^\s*([^<]+?)\s*</.exec(from)?.[1] || "MyFenrir";

  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      to,
      provider: "cloudflare",
      brand: "myfenrir",
      from: { email: addr, name },
      replyTo: env.FENRIR_MAIL_REPLY_TO || "hola@myfenrir.com",
      raw: { subject, html, text },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(`cloudflare_mail_${res.status}:${body?.code || ""}:${body?.error || "unknown"}`.slice(0, 300));
  }
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
  // Same words as the bot's own activation message in fenrir-stars-payments.js
  // ("Access: active / Stars: N / Payment rail: Telegram Stars") and the same
  // feature names as the portal, so the two messages a buyer gets in the same
  // minute do not use two different vocabularies for one purchase.
  const paid =
    facts.amount.charged === false
      ? "No charge"
      : facts.amount.currency === "XTR" && facts.amount.amount != null
        ? `${Number(facts.amount.amount).toLocaleString("en-US")} Stars`
        : (facts.amount.display ?? "Amount not recorded");
  const term = facts.term.currentPeriodEnd
    ? `Renews: ${new Date(facts.term.currentPeriodEnd).toISOString().slice(0, 10)}`
    : "Access: active — no end date";
  const lines = [
    `🐺 <b>You're in ${plan}.</b>`,
    "",
    `Paid: ${paid}`,
    `Payment rail: ${facts.rail.label ?? "not recorded"}`,
    term,
    "",
    facts.limits?.locksUnlimited ? "Locks: unlimited · Multi-admin · Audit logs · Custom domain" : "",
    "",
    `<a href="${env.FENRIR_PORTAL_URL || "https://www.myfenrir.com/dashboard"}">Enter the Pack →</a>`,
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
export async function confirmMembership(env, friskyOrgId, { force = false } = {}) {
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
    portalUrl: env.FENRIR_PORTAL_URL || "https://www.myfenrir.com/dashboard",
  });

  try {
    const messageId = await sendViaMyFenrirMail(env, {
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
export async function reconcile(env, { limit = 25 } = {}) {
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
      ...(await confirmMembership(env, row.frisky_org_id)),
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
    //   { "frisky_org_id": "..." }
    // A `locale` field is accepted and ignored: MyFenrir ships in English and
    // the confirmation is English-only. See _lib/membership-email.js.
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

      const result = await confirmMembership(env, orgId, { force: body?.force === true });
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
