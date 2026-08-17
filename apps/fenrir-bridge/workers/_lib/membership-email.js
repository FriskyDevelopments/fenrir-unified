/**
 * membership-email — the confirmation that replaces the one that lied.
 *
 * The email being sent today claims "6 MONTHS ON US — no charge, no strings"
 * and "STATUS: ACTIVE" for a grant that was never landed. This one renders
 * getMembershipFacts() and nothing else: what you bought, what you paid, until
 * when, what it unlocked. Where a fact is unknown it prints the reason in the
 * slot instead of a confident-looking placeholder.
 *
 * ---------------------------------------------------------------------------
 * LANGUAGE — English only, on purpose.
 *
 * MyFenrir ships in English and its feature names are English at the source:
 * The Pack, Telegram Locks, Multi-admin, Audit logs, Custom domain. The bug
 * being fixed here was a half-Spanish email sitting on top of an English
 * product, so this module no longer takes a locale: there is nothing to
 * branch on, and a second half-translated copy deck is what created the mess.
 *
 * Wording is lifted from the surfaces that already speak to the member, so the
 * email and the product say the same words:
 *   - the bot's activation message (workers/fenrir-stars-payments.js):
 *       "MyFenrir Standard Pack activated. / Access: active / Stars: N /
 *        Payment rail: Telegram Stars"
 *     -> Access, Stars, Payment rail come from there verbatim.
 *   - this worker's own Telegram confirmation:
 *       "Locks: unlimited · multi-admin · audit logs · custom domain"
 *   - src/components/PackCelebration.tsx and src/components/MembershipPanel.tsx:
 *       "MEMBERSHIP CONFIRMED", "PAYMENT NEEDS ATTENTION", "Plan", "Paid",
 *       "Renews", "What this unlocks", "Telegram Locks", "Multi-admin",
 *       "Audit logs", "Custom domain", "Unlimited", "Included",
 *       "Not included", "Enter the Pack".
 * No synonyms were invented. Where the bot and the panel both have a word, the
 * bot wins — it is the surface the buyer sees first.
 *
 * ---------------------------------------------------------------------------
 * BRAND — this is a MyFenrir email, so it wears the MyFenrir email identity.
 *
 * Tokens are copied verbatim from apps/myfenrir-emails/src/brands/myfenrir.ts,
 * the authoritative MyFenrir mail brand (reconciled there from the landing
 * design system + the dashboard). Layout, hero, data table, callout and CTA
 * follow apps/myfenrir-emails/src/{layout,components}.ts so this email is a
 * sibling of every other MyFenrir email, not a one-off.
 *
 * It does NOT use the gold-over-ink PROTOCOL kit from src/theme/brandThemes.ts:
 * that is the Fenrir Bridge *admin app* skin, not the MyFenrir mail identity.
 * It also does not use the violet/aurora set in ~/fenrir-brand, which is still
 * marked "Propuesta para aprobación".
 *
 * Not imported from myfenrir-emails on purpose: that package is TypeScript with
 * its own build, and this worker deploys as plain ESM with no bundler config.
 * Extracting a shared package is tracked as follow-up; duplicating ~18 constants
 * is the honest cost of keeping this worker deployable today.
 *
 * ---------------------------------------------------------------------------
 * MEDIUM CONSTRAINTS, TREATED AS HARD
 *   - Tables + inline styles. No flex, no grid, no JS. Gmail / Apple Mail / Outlook.
 *   - 600px max, and the layout must hold at 320px. The four-across fact grid
 *     that ran off the right edge on iPhone is gone: facts are now a stacked
 *     key/value table with no fixed column widths, so there is nothing left
 *     that can overflow. It does not depend on a media query to be correct.
 *   - System fonts only. The brand's display face cannot travel in email, so
 *     hierarchy is carried by size, weight and space instead of by a typeface
 *     that would silently fall back to Times.
 *   - No images. The wordmark is live text, so the email is complete with
 *     images blocked and makes no external request.
 *   - Dark by design (MyFenrir is a dark identity). The palette is pinned in
 *     both colour schemes so a dark-mode client renders it as authored instead
 *     of auto-inverting it into a washed-out patch.
 */

/* Brand tokens — apps/myfenrir-emails/src/brands/myfenrir.ts */
const B = {
  ink: "#05060B",        // outer canvas + footer
  inkAlt: "#0B0E1A",     // hero
  surface: "#0B0E1A",    // content card
  surfaceAlt: "#121734", // inset panels
  // myfenrir.ts border is rgba(150,166,224,.16); Outlook drops rgba on borders,
  // so this is the same colour pre-composited over #0B0E1A.
  line: "#21263A",
  heading: "#ECEEFF",
  body: "#CFD3E8",
  muted: "#AEB5D0",
  faint: "#858BA8",
  accent: "#00E5FF",
  accentSoft: "#4FD7E0",
  accentDark: "#00A7C4",
  onAccent: "#04121A",
  gold: "#F1B75C",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO =
  "'SFMono-Regular',ui-monospace,Consolas,'Liberation Mono',Menlo,monospace";

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

/** Render a date as a plain, unambiguous UTC day. Never invents one. */
function formatDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/** Every string the member reads. See the LANGUAGE note for provenance. */
const COPY = {
  eyebrow: "MYFENRIR // THE PACK",
  confirmed: "Membership confirmed",
  attention: "Payment needs attention",
  lead: "Your payment went through. Here is what you bought and what is open now.",

  detail: "Your membership",
  plan: "Plan",
  paid: "Paid",
  rail: "Payment rail",     // bot: "Payment rail: Telegram Stars"
  term: "Renews",
  access: "Access",         // bot: "Access: active"

  unlocked: "What this unlocks",
  locks: "Telegram Locks",
  multiAdmin: "Multi-admin",
  audit: "Audit logs",
  domain: "Custom domain",
  unlimited: "Unlimited",
  included: "Included",
  notIncluded: "Not included",

  cta: "Enter the Pack",

  // The open-ended case. "Active" is the bot's own word for this state.
  openEnded: "Active — no end date",
  noTermNote:
    "No end date on file, so your access stays open. When one is recorded it will show here and in your portal.",

  noAmount: "Amount not recorded",
  noAmountNote:
    "The amount was not stored alongside your subscription. Your payment provider's receipt is the authoritative record.",
  noCharge: "No charge",

  pastDue:
    "Your last payment did not go through. Access is on for now — please update your payment method.",
  cancelling:
    "This membership is set to end at the close of the current period. It will not renew.",
  unknownPlan: "Unrecognised plan",
  unknownPlanNote:
    "Your subscription is active but its plan key is not one this build recognises, so its allowances are not shown. Support has been notified.",
  heads: "Heads up",

  footerLegal: "Fenrir Protocol · MyFenrir — The digital pack",
  footerWhy: "You are receiving this because a membership was confirmed on your MyFenrir account.",
  footerSignoff: "Sent by MyFenrir · myfenrir.com",
  openApp: "Open MyFenrir",
  wiki: "Fenrir Wiki",
};

/** Rail names as the product says them. membership-facts already returns these
 *  for the two live rails; this map keeps the email stable if that changes. */
const RAIL = {
  telegram_stars: "Telegram Stars",
  stripe: "Stripe",
  courtesy: "Courtesy grant",
  referral: "Referral reward",
};

/* --------------------------------------------------------------------------
 * Components (mirroring apps/myfenrir-emails/src/components.ts)
 * -------------------------------------------------------------------------- */

/** Section label: mono, spaced, cyan. The only ornament in the email. */
function sectionLabel(text) {
  return (
    `<div style="font:700 11px/1 ${MONO};letter-spacing:2px;text-transform:uppercase;` +
    `color:${B.accentSoft};">${esc(text)}</div>`
  );
}

/**
 * Key/value table. No fixed column widths and no nowrap: this is what makes the
 * layout hold at 320px, where the old four-across grid was cut off on the right.
 * rows = [{ label, value, dim }] — `dim` renders the value as secondary text.
 */
function dataTable(rows) {
  const cells = rows
    .map((r, i) => {
      const last = i === rows.length - 1;
      const colour = r.dim ? B.faint : B.heading;
      // Side by side, both cells carry the hairline so it spans the full row.
      // When they stack on a narrow phone the 400px rule drops it from the
      // label cell, so the rule lands once under the pair rather than between
      // a label and its own value.
      const bd = last ? "" : `border-bottom:1px solid ${B.line};`;
      return (
        `<tr>` +
        `<td class="cell kv-l" valign="top" style="padding:14px 16px;${bd}font:400 13px/1.5 ${FONT};color:${B.muted};">${esc(r.label)}</td>` +
        `<td class="cell kv-v" valign="top" align="right" style="padding:14px 16px;${bd}font:700 14px/1.5 ${FONT};color:${colour};">${esc(r.value)}</td>` +
        `</tr>`
      );
    })
    .join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `bgcolor="${B.surfaceAlt}" class="panel" style="background:${B.surfaceAlt};border:1px solid ${B.line};` +
    `border-radius:12px;border-collapse:separate;">${cells}</table>`
  );
}

/** Warning card. Reserved for things the member may need to act on. */
function callout(title, lines, tone) {
  const items = lines
    .map((l) => `<div class="t-body" style="font:400 13px/1.7 ${FONT};color:${B.body};">${esc(l)}</div>`)
    .join(`<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>`);
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `bgcolor="${B.surfaceAlt}" class="panel" style="background:${B.surfaceAlt};border:1px solid ${B.line};border-radius:12px;"><tr>` +
    `<td width="3" bgcolor="${tone}" style="background:${tone};font-size:0;line-height:0;">&nbsp;</td>` +
    `<td class="cell" style="padding:16px 18px;">` +
    `<div style="font:700 11px/1 ${MONO};letter-spacing:1.6px;text-transform:uppercase;color:${tone};padding-bottom:9px;">${esc(title)}</div>` +
    items +
    `</td></tr></table>`
  );
}

/** Bulletproof CTA. VML gives Outlook a real button instead of a bare link. */
function ctaButton(label, url) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" bgcolor="${B.accent}" style="border-radius:12px;">` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${esc(url)}" style="height:52px;v-text-anchor:middle;width:240px;" arcsize="24%" ` +
    `strokecolor="${B.accentDark}" fillcolor="${B.accent}"><w:anchorlock/>` +
    `<center style="color:${B.onAccent};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(label)}</center>` +
    `</v:roundrect><![endif]-->` +
    `<!--[if !mso]><!-- -->` +
    `<a class="btn" href="${esc(url)}" target="_blank" style="display:inline-block;padding:16px 32px;` +
    `border-radius:12px;background:${B.accent};color:${B.onAccent};font:800 15px/1 ${FONT};` +
    `letter-spacing:.2px;text-decoration:none;mso-hide:all;">${esc(label)}</a>` +
    `<!--<![endif]-->` +
    `</td></tr></table>`
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Build the confirmation email from facts.
 * @param {object} facts  getMembershipFacts() output with entitled === true
 * @param {object} opts   { portalUrl }
 */
export function membershipEmail(facts, opts = {}) {
  const c = COPY;
  const portalUrl = opts.portalUrl || "https://www.myfenrir.com/dashboard";
  const site = "https://www.myfenrir.com/main";
  const wiki = "https://myfenrir.com/wiki";

  const planName = facts.plan.display;
  const headline = planName ? `You're in ${planName}` : c.unknownPlan;

  const attention = Boolean(facts.status.needsAttention);
  const badge = attention ? c.attention : c.confirmed;
  const badgeTone = attention ? B.gold : B.accent;

  const termDay = formatDay(facts.term.currentPeriodEnd);

  // The bot prints "Stars: 500". Say it the same way rather than re-styling the
  // same number differently in the email. Never guesses an amount.
  let amountDisplay;
  if (facts.amount.charged === false) {
    amountDisplay = c.noCharge;
  } else if (facts.amount.currency === "XTR" && facts.amount.amount != null) {
    amountDisplay = `${Number(facts.amount.amount).toLocaleString("en-US")} Stars`;
  } else {
    amountDisplay = facts.amount.display || null;
  }

  const railLabel = RAIL[facts.rail.key] || facts.rail.label || null;

  /* --- the membership -------------------------------------------------- */
  const purchaseRows = [
    { label: c.plan, value: planName || c.unknownPlan, dim: !planName },
    { label: c.paid, value: amountDisplay || c.noAmount, dim: !amountDisplay },
    { label: c.rail, value: railLabel || "—", dim: !railLabel },
    // The open-ended case is a state, not an error, so it gets its own label and
    // normal weight instead of warning styling. The day a term is recorded this
    // row becomes "Renews <date>" on its own, with no code change here.
    facts.term.known
      ? { label: c.term, value: termDay }
      : { label: c.access, value: c.openEnded },
  ];

  /* --- what this unlocks ----------------------------------------------- */
  const limits = facts.limits;
  const featureRows = limits
    ? [
        { label: c.locks, value: limits.locksUnlimited ? c.unlimited : String(limits.maxTelegramLocks) },
        { label: c.multiAdmin, value: limits.multiAdmin ? c.included : c.notIncluded, dim: !limits.multiAdmin },
        { label: c.audit, value: limits.auditLogs ? c.included : c.notIncluded, dim: !limits.auditLogs },
        { label: c.domain, value: limits.customDomain ? c.included : c.notIncluded, dim: !limits.customDomain },
      ]
    : null;

  /* --- notes -----------------------------------------------------------
   * Split by weight, which is the whole point. Something the member may need to
   * act on gets a card. A disclosure about what we do and do not know gets a
   * footnote. The old email gave both the same visual weight, so a perfectly
   * healthy membership looked like it had a problem. */
  const warnings = [];
  if (attention) warnings.push(c.pastDue);
  if (facts.status.cancelAtPeriodEnd) warnings.push(c.cancelling);
  if (!facts.plan.recognised) warnings.push(c.unknownPlanNote);

  const footnotes = [];
  if (!facts.term.known) footnotes.push(c.noTermNote);
  if (facts.amount.charged !== false && !amountDisplay) footnotes.push(c.noAmountNote);

  const gap = (px) => `<tr><td style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</td></tr>`;

  const bodyRows = [
    `<tr><td><h1 class="h1 t-heading" style="margin:0;font:800 30px/1.22 ${FONT};letter-spacing:-.6px;color:${B.heading};">${esc(headline)}</h1></td></tr>`,
    gap(12),
    `<tr><td class="t-body" style="font:400 15px/1.7 ${FONT};color:${B.body};">${esc(c.lead)}</td></tr>`,
    gap(28),
    `<tr><td>${sectionLabel(c.detail)}</td></tr>`,
    gap(12),
    `<tr><td>${dataTable(purchaseRows)}</td></tr>`,
  ];

  if (featureRows) {
    bodyRows.push(gap(28), `<tr><td>${sectionLabel(c.unlocked)}</td></tr>`, gap(12), `<tr><td>${dataTable(featureRows)}</td></tr>`);
  }
  if (warnings.length) {
    bodyRows.push(gap(24), `<tr><td>${callout(c.heads, warnings, attention ? B.gold : B.accentSoft)}</td></tr>`);
  }
  bodyRows.push(gap(32), `<tr><td align="left">${ctaButton(c.cta, portalUrl)}</td></tr>`);
  if (footnotes.length) {
    bodyRows.push(
      gap(26),
      `<tr><td class="t-faint" style="font:400 12px/1.75 ${FONT};color:${B.faint};">` +
        footnotes.map((n) => esc(n)).join(`<br><br>`) +
        `</td></tr>`
    );
  }

  const preheader = `${headline}. Here is what you bought and what is open now.`;

  const html =
`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(headline)}</title>
<!--[if mso]><style>table,td,div,p,a,h1{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
 :root{color-scheme:dark;supported-color-schemes:dark}
 body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
 table,td{mso-table-lspace:0;mso-table-rspace:0}
 img{border:0;line-height:100%;outline:none;text-decoration:none}
 body{margin:0;padding:0;width:100%!important;background:${B.ink}}
 a{color:${B.accent}}
 /* The identity is dark. Pin it in both schemes so a client that would
    otherwise auto-invert renders the email as authored. */
 @media (prefers-color-scheme:light){
  body,.canvas{background:${B.ink}!important}
  .hero{background-color:${B.inkAlt}!important}
  .card{background-color:${B.surface}!important}
  .panel{background-color:${B.surfaceAlt}!important}
  .t-heading,.h1{color:${B.heading}!important}
  .t-body{color:${B.body}!important}
  .t-muted{color:${B.muted}!important}
  .t-faint{color:${B.faint}!important}
 }
 [data-ogsc] body,[data-ogsc] .canvas{background:${B.ink}!important}
 [data-ogsc] .hero{background-color:${B.inkAlt}!important}
 [data-ogsc] .card{background-color:${B.surface}!important}
 [data-ogsc] .panel{background-color:${B.surfaceAlt}!important}
 [data-ogsc] .t-heading,[data-ogsc] .h1{color:${B.heading}!important}
 [data-ogsc] .t-body{color:${B.body}!important}
 [data-ogsc] .t-faint{color:${B.faint}!important}
 @media only screen and (max-width:620px){
  .container{width:100%!important}
  .px{padding-left:24px!important;padding-right:24px!important}
  .h1{font-size:26px!important;line-height:32px!important}
 }
 /* Narrow phones: stack each label over its value. Nothing here is load-bearing
    — with the query unsupported the rows simply stay side by side, which is
    already correct and already fits. This only buys back breathing room. */
 @media only screen and (max-width:400px){
  .px{padding-left:16px!important;padding-right:16px!important}
  .cell{padding-left:14px!important;padding-right:14px!important}
  .h1{font-size:23px!important;line-height:29px!important}
  .btn{display:block!important;text-align:center!important}
  /* box-sizing is not optional here: without it the 100%-wide cell adds its own
     padding on top and its hairline runs past the panel's right edge. */
  .kv-l,.kv-v{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:left!important}
  .kv-l{border-bottom:0!important;padding-bottom:0!important}
  .kv-v{padding-top:3px!important}
 }
</style></head>
<body style="margin:0;padding:0;background:${B.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;color:${B.ink};font-size:1px;line-height:1px;">${esc(preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;">&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
<table role="presentation" class="canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${B.ink}" style="background:${B.ink};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

 <!-- hero -->
 <tr><td class="hero px" bgcolor="${B.inkAlt}" style="background:${B.inkAlt};background-color:${B.inkAlt};background-image:radial-gradient(120% 140% at 12% 0%, rgba(139,124,255,.20) 0%, rgba(11,14,26,0) 46%),radial-gradient(120% 160% at 100% 0%, rgba(79,215,224,.12) 0%, rgba(11,14,26,0) 40%);padding:36px 40px 26px;border:1px solid ${B.line};border-bottom:0;border-radius:18px 18px 0 0;">
  <div style="font:800 11px/1 ${MONO};letter-spacing:2.6px;color:${B.accentSoft};">${esc(c.eyebrow)}</div>
  <div class="t-heading" style="margin-top:14px;font:900 30px/1 ${FONT};letter-spacing:-.5px;color:${B.heading};">FENRIR<span style="color:${B.accent};">.</span></div>
  <div style="margin-top:18px;width:54px;height:3px;background:${B.accent};border-radius:2px;font-size:0;line-height:3px;">&nbsp;</div>
  <div style="margin-top:18px;">
   <span style="display:inline-block;padding:7px 15px;border-radius:999px;border:1px solid ${badgeTone};color:${badgeTone};font:800 11px/1 ${MONO};letter-spacing:1.4px;text-transform:uppercase;">${esc(badge)}</span>
  </div>
 </td></tr>

 <!-- content -->
 <tr><td class="card px" bgcolor="${B.surface}" style="background:${B.surface};padding:30px 40px 38px;border-left:1px solid ${B.line};border-right:1px solid ${B.line};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
   ${bodyRows.join("\n   ")}
  </table>
 </td></tr>

 <!-- footer -->
 <tr><td class="px" bgcolor="${B.ink}" style="background:${B.ink};padding:24px 40px 30px;border:1px solid ${B.line};border-top:0;border-radius:0 0 18px 18px;">
  <div style="height:1px;background:${B.line};font-size:0;line-height:1px;">&nbsp;</div>
  <div style="margin-top:18px;font:600 13px/1.6 ${FONT};">
   <a href="${esc(site)}" target="_blank" style="color:${B.muted};text-decoration:none;">${esc(c.openApp)}</a>
   <span style="color:${B.faint};">&nbsp;&middot;&nbsp;</span>
   <a href="${esc(wiki)}" target="_blank" style="color:${B.muted};text-decoration:none;">${esc(c.wiki)}</a>
  </div>
  <div class="t-faint" style="margin-top:14px;font:400 12px/1.6 ${FONT};color:${B.faint};">${esc(c.footerLegal)}</div>
  <div class="t-faint" style="margin-top:12px;font:400 11px/1.7 ${FONT};color:${B.faint};">${esc(c.footerWhy)}</div>
  <div class="t-faint" style="margin-top:12px;font:400 11px/1.6 ${FONT};color:${B.faint};">${esc(c.footerSignoff)}</div>
 </td></tr>

</table></td></tr></table></body></html>`;

  /* --- plain text ------------------------------------------------------ */
  const textLines = [headline, "", c.lead, "", c.detail.toUpperCase()];
  for (const r of purchaseRows) textLines.push(`${r.label}: ${r.value}`);
  if (featureRows) {
    textLines.push("", c.unlocked.toUpperCase());
    for (const r of featureRows) textLines.push(`${r.label}: ${r.value}`);
  }
  if (warnings.length) textLines.push("", c.heads.toUpperCase(), ...warnings);
  textLines.push("", `${c.cta}: ${portalUrl}`);
  if (footnotes.length) textLines.push("", ...footnotes);
  textLines.push("", c.footerLegal, c.footerWhy, c.footerSignoff);

  const subject = planName
    ? `Confirmed: you're in ${planName} · MyFenrir`
    : "Membership confirmed · MyFenrir";

  return { subject, html, text: textLines.join("\n") };
}
