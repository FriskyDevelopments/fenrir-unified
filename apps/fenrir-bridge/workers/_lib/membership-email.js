/**
 * membership-email — the confirmation that replaces the one that lied.
 *
 * The email being sent today claims "6 MONTHS ON US — no charge, no strings"
 * and "STATUS: ACTIVE" for a grant that was never landed. This one renders
 * getMembershipFacts() and nothing else: what you bought, what you paid, until
 * when, what it unlocked. Where a fact is unknown it prints the reason in the
 * slot instead of a confident-looking placeholder.
 *
 * Keeps the fenrirEmailTemplate contract — { html, text }, escaped input,
 * eyebrow / title / body / CTA — repainted to the live PROTOCOL palette
 * (gold over ink, from packages/tokens/src/brands/fenrir.css, whose own source
 * of truth is src/theme/brandThemes.ts). The violet/aurora set in ~/fenrir-brand
 * is still marked "PROPUESTA, pendiente de aprobación", so it is not used here.
 *
 * Table layout + inline styles: this has to survive Gmail, Outlook and Apple Mail.
 */

const INK = "#0B0B0C";
const PANEL = "#141414";
const PANEL_2 = "#1C1C1E";
const LINE = "#2A2A2C";
const GOLD = "#C2A469";
const TEAL = "#7FAE9D";
const PAPER = "#F4F0E6";
const MUTE = "#9A9588";

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

/** Render a date as a plain, unambiguous UTC day. Never invents one. */
function formatDay(iso, locale) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

const COPY = {
  en: {
    eyebrow: "MYFENRIR // MEMBERSHIP",
    confirmed: "MEMBERSHIP CONFIRMED",
    attention: "PAYMENT NEEDS ATTENTION",
    plan: "PLAN", paid: "PAID", rail: "PAID WITH", term: "RENEWS",
    unlocked: "What this unlocks",
    locks: "Telegram Locks", multiAdmin: "Multi-admin", audit: "Audit logs", domain: "Custom domain",
    unlimited: "Unlimited", included: "Included", notIncluded: "Not included",
    cta: "Open your portal",
    noTerm: "No renewal date on file",
    noTermWhy: "This rail did not record a term. Your access is live; we are not going to print an end date we cannot prove.",
    noAmount: "Not recorded",
    noAmountWhy: "The amount was not stored with your subscription. Your receipt from the payment provider is the authoritative record.",
    noCharge: "No charge",
    pastDue: "Your last payment did not go through. Access is still on for now — please update your payment method.",
    cancelling: "Set to end at the close of the current period — it will not renew.",
    unknownPlan: "Unrecognised plan",
    unknownPlanWhy: "Your subscription is active but its plan key is not one we recognise. Support has been notified.",
    footer: "Fenrir Protocol · Secure community access",
    why: "You are receiving this because a membership was confirmed on your MyFenrir account.",
  },
  es: {
    eyebrow: "MYFENRIR // MEMBRESÍA",
    confirmed: "MEMBRESÍA CONFIRMADA",
    attention: "EL PAGO REQUIERE ATENCIÓN",
    plan: "PLAN", paid: "PAGASTE", rail: "PAGADO CON", term: "RENUEVA",
    unlocked: "Qué desbloquea",
    locks: "Locks de Telegram", multiAdmin: "Multi-admin", audit: "Audit logs", domain: "Dominio propio",
    unlimited: "Ilimitados", included: "Incluido", notIncluded: "No incluido",
    cta: "Abrir tu portal",
    noTerm: "Sin fecha de renovación registrada",
    noTermWhy: "Este riel no registró una vigencia. Tu acceso está activo; no vamos a imprimir una fecha de término que no podemos comprobar.",
    noAmount: "No registrado",
    noAmountWhy: "El importe no se guardó junto a tu suscripción. El recibo de tu proveedor de pago es el registro autoritativo.",
    noCharge: "Sin cargo",
    pastDue: "Tu último pago no se procesó. El acceso sigue activo por ahora — actualiza tu método de pago.",
    cancelling: "Programada para terminar al cierre del periodo actual — no se renovará.",
    unknownPlan: "Plan no reconocido",
    unknownPlanWhy: "Tu suscripción está activa pero su plan no es uno que reconozcamos. Soporte ya fue notificado.",
    footer: "Fenrir Protocol · Acceso seguro a la comunidad",
    why: "Recibes esto porque se confirmó una membresía en tu cuenta de MyFenrir.",
  },
};

/** One cell of the fact grid. `value` null => renders the muted reason text. */
function factCell({ label, value, fallback, width, last }) {
  const shown = value
    ? `<div style="margin-top:9px;font:700 17px/1.2 Arial,Helvetica,sans-serif;color:${PAPER};">${esc(value)}</div>`
    : `<div style="margin-top:9px;font:400 14px/1.35 Arial,Helvetica,sans-serif;color:${MUTE};font-style:italic;">${esc(fallback)}</div>`;
  return (
    `<td class="stackcell" width="${width}" bgcolor="${PANEL_2}" style="background:${PANEL_2};padding:16px 18px;` +
    (last ? "" : `border-right:1px solid ${LINE};`) +
    `vertical-align:top;">` +
    `<div style="font:700 10px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:2.5px;color:${TEAL};">${esc(label)}</div>` +
    shown +
    `</td>`
  );
}

function featureRow(label, value, on) {
  const colour = on ? PAPER : MUTE;
  const dot = on ? GOLD : LINE;
  return (
    `<tr>` +
    `<td style="padding:11px 0;border-bottom:1px solid ${LINE};font:400 15px/1.3 Arial,Helvetica,sans-serif;color:${MUTE};">` +
    `<span style="display:inline-block;width:7px;height:7px;background:${dot};margin-right:11px;"></span>${esc(label)}</td>` +
    `<td align="right" style="padding:11px 0;border-bottom:1px solid ${LINE};font:700 15px/1.3 Arial,Helvetica,sans-serif;color:${colour};">${esc(value)}</td>` +
    `</tr>`
  );
}

/**
 * Build the confirmation email from facts.
 * @param {object} facts  getMembershipFacts() output with entitled === true
 * @param {object} opts   { locale, portalUrl, displayName }
 */
export function membershipEmail(facts, opts = {}) {
  const locale = opts.locale === "es" ? "es" : "en";
  const c = COPY[locale];
  const portalUrl = opts.portalUrl || "https://www.myfenrir.com/dashboard";

  const planName = facts.plan.display;
  const headline = planName ? (locale === "es" ? `Estás en ${planName}` : `You're in ${planName}`) : c.unknownPlan;

  const badge = facts.status.needsAttention ? c.attention : c.confirmed;
  const badgeColour = facts.status.needsAttention ? "#E8B24C" : TEAL;

  const termDay = formatDay(facts.term.currentPeriodEnd, locale);
  const amountDisplay = facts.amount.charged === false ? c.noCharge : facts.amount.display;

  // Notes only appear when there is a real caveat to disclose.
  const notes = [];
  if (facts.status.needsAttention) notes.push(c.pastDue);
  if (facts.status.cancelAtPeriodEnd) notes.push(c.cancelling);
  if (!facts.term.known) notes.push(c.noTermWhy);
  if (facts.amount.charged !== false && !facts.amount.display) notes.push(c.noAmountWhy);
  if (!facts.plan.recognised) notes.push(c.unknownPlanWhy);

  const noteBlock = notes.length
    ? `<tr><td class="px" style="padding:26px 36px 0;background:${PANEL};border-left:1px solid ${LINE};border-right:1px solid ${LINE};">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL_2}" style="background:${PANEL_2};border:1px solid ${LINE};"><tr>` +
      `<td width="3" bgcolor="${GOLD}" style="background:${GOLD};font-size:0;line-height:0;">&nbsp;</td>` +
      `<td style="padding:16px 20px;font:400 14px/22px Arial,Helvetica,sans-serif;color:${MUTE};">` +
      notes.map((n) => esc(n)).join("<br><br>") +
      `</td></tr></table></td></tr>`
    : "";

  const limits = facts.limits;
  const featureBlock = limits
    ? `<tr><td class="px" style="padding:34px 36px 0;background:${PANEL};border-left:1px solid ${LINE};border-right:1px solid ${LINE};">` +
      `<div style="font:700 10px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:2.5px;color:${TEAL};">${esc(c.unlocked.toUpperCase())}</div>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">` +
      featureRow(c.locks, limits.locksUnlimited ? c.unlimited : String(limits.maxTelegramLocks), true) +
      featureRow(c.multiAdmin, limits.multiAdmin ? c.included : c.notIncluded, limits.multiAdmin) +
      featureRow(c.audit, limits.auditLogs ? c.included : c.notIncluded, limits.auditLogs) +
      featureRow(c.domain, limits.customDomain ? c.included : c.notIncluded, limits.customDomain) +
      `</table></td></tr>`
    : "";

  const html =
`<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(headline)}</title>
<style>
 body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
 table,td{mso-table-lspace:0;mso-table-rspace:0}
 body{margin:0;padding:0;width:100%!important;background:${INK}}
 a{color:${GOLD}}
 @media (max-width:620px){
  .wrap{width:100%!important}
  .px{padding-left:22px!important;padding-right:22px!important}
  .h1{font-size:34px!important;line-height:36px!important}
  .stackcell{display:block!important;width:100%!important;border-right:0!important;border-bottom:1px solid ${LINE}!important}
 }
</style></head>
<body style="margin:0;padding:0;background:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${INK};font-size:1px;line-height:1px;">${esc(headline)} — ${esc(planName || "")} ${esc(amountDisplay || "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background:${INK};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

 <tr><td bgcolor="#0E0E10" class="px" style="background:#0E0E10;padding:20px 36px;border:1px solid ${LINE};border-bottom:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
   <td align="left" style="font:700 11px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:3.5px;color:${GOLD};">${esc(c.eyebrow)}</td>
   <td align="right" style="font:700 10px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:2px;color:#5F6672;">FENRIR&nbsp;PROTOCOL</td>
  </tr></table></td></tr>

 <tr><td bgcolor="${GOLD}" style="background:${GOLD};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>

 <tr><td bgcolor="${PANEL}" class="px" style="background:${PANEL};padding:42px 36px 0;border-left:1px solid ${LINE};border-right:1px solid ${LINE};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
   <td style="border:1px solid ${badgeColour};padding:7px 13px;font:700 11px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:2.5px;color:${badgeColour};">${esc(badge)}</td>
  </tr></table>
  <div class="h1" style="margin:24px 0 0;font:800 42px/44px Arial,Helvetica,sans-serif;letter-spacing:-1.2px;color:${PAPER};text-transform:uppercase;">${esc(headline)}</div>
  <div style="width:52px;height:3px;background:${GOLD};margin-top:22px;font-size:0;line-height:3px;">&nbsp;</div>
 </td></tr>

 <tr><td class="px" style="padding:26px 36px 0;background:${PANEL};border-left:1px solid ${LINE};border-right:1px solid ${LINE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};"><tr>
   ${factCell({ label: c.plan, value: planName, fallback: c.unknownPlan, width: "25%" })}
   ${factCell({ label: c.paid, value: amountDisplay, fallback: c.noAmount, width: "25%" })}
   ${factCell({ label: c.rail, value: facts.rail.label, fallback: "—", width: "25%" })}
   ${factCell({ label: c.term, value: termDay, fallback: c.noTerm, width: "25%", last: true })}
  </tr></table></td></tr>

 ${featureBlock}
 ${noteBlock}

 <tr><td class="px" align="left" style="padding:34px 36px 42px;background:${PANEL};border-left:1px solid ${LINE};border-right:1px solid ${LINE};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${GOLD}" style="background:${GOLD};">
   <a href="${esc(portalUrl)}" target="_blank" style="display:inline-block;padding:16px 32px;font:800 14px/1 Arial,Helvetica,sans-serif;letter-spacing:1.2px;color:${INK};text-decoration:none;text-transform:uppercase;">${esc(c.cta)} &nbsp;&rarr;</a>
  </td></tr></table></td></tr>

 <tr><td bgcolor="${GOLD}" style="background:${GOLD};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
 <tr><td bgcolor="#0E0E10" class="px" style="background:#0E0E10;padding:20px 36px;border:1px solid ${LINE};border-top:0;">
  <div style="font:700 11px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:2px;color:#8B909B;">${esc(c.footer)}</div>
  <div style="margin-top:8px;font:400 11px/17px Arial,Helvetica,sans-serif;color:#565B66;">${esc(c.why)}</div>
 </td></tr>

</table></td></tr></table></body></html>`;

  const textLines = [
    headline.toUpperCase(),
    "",
    `${c.plan}: ${planName || c.unknownPlan}`,
    `${c.paid}: ${amountDisplay || c.noAmount}`,
    `${c.rail}: ${facts.rail.label || "—"}`,
    `${c.term}: ${termDay || c.noTerm}`,
  ];
  if (limits) {
    textLines.push("", `${c.unlocked}:`);
    textLines.push(`- ${c.locks}: ${limits.locksUnlimited ? c.unlimited : limits.maxTelegramLocks}`);
    textLines.push(`- ${c.multiAdmin}: ${limits.multiAdmin ? c.included : c.notIncluded}`);
    textLines.push(`- ${c.audit}: ${limits.auditLogs ? c.included : c.notIncluded}`);
    textLines.push(`- ${c.domain}: ${limits.customDomain ? c.included : c.notIncluded}`);
  }
  if (notes.length) textLines.push("", ...notes);
  textLines.push("", `${c.cta}: ${portalUrl}`, "", c.footer, c.why);

  const subject = planName
    ? locale === "es" ? `Confirmado: estás en ${planName} · MyFenrir` : `Confirmed: you're in ${planName} · MyFenrir`
    : locale === "es" ? "Membresía confirmada · MyFenrir" : "Membership confirmed · MyFenrir";

  return { subject, html, text: textLines.join("\n") };
}
