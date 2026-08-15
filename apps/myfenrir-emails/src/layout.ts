import type { Brand } from "./brands/types";
import { DEFAULT_FONT_STACK } from "./brands/types";
import { esc } from "./format";
import type { Locale } from "./locale";

export interface LayoutOptions {
  brand: Brand;
  preheader: string; // hidden inbox preview text
  heroBadge: string; // small label in the hero, e.g. "Verificación"
  body: string; // inner HTML (composed from components)
  accentKey?: "accent" | "purple" | "gold" | "danger"; // hero accent (default cyan)
  locale?: Locale;
}

// Hero header: deep-void band with an amethyst→cyan glow, the FENRIR wordmark,
// THE PACK tagline, a thin accent rule and a status badge. Image-free by design
// (no external fetch to break); a hosted PNG logo is used only if brand.logoUrl.
function hero(brand: Brand, heroBadge: string, accent: string): string {
  const { ink, inkAlt, heading, accentSoft, purple } = brand.colors;
  const mark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" width="${brand.logoWidth ?? 72}" alt="${esc(brand.name)}"
        style="display:block;border:0;outline:none;max-width:${brand.logoWidth ?? 72}px;height:auto;">`
    : `<div style="font-size:30px;font-weight:900;letter-spacing:-.5px;color:${heading};line-height:1;">
        ${esc(brand.wordmark)}${brand.wordmarkDot ? `<span style="color:${accent};">.</span>` : ""}</div>`;
  return `
  <tr><td style="padding:38px 40px 30px 40px;background:${inkAlt};
    background-image:radial-gradient(120% 140% at 12% 0%, ${hexA(purple, 0.22)} 0%, rgba(11,14,26,0) 46%),
      radial-gradient(120% 160% at 100% 0%, ${hexA(accentSoft, 0.12)} 0%, rgba(11,14,26,0) 40%);
    background-color:${inkAlt};">
    <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:${accentSoft};text-transform:uppercase;margin-bottom:14px;">
      MYFENRIR &#47;&#47; ${esc(brand.tagline ?? "THE PACK")}</div>
    ${mark}
    <div style="margin-top:18px;height:3px;width:54px;background:${accent};border-radius:2px;line-height:3px;">&nbsp;</div>
    <div style="margin-top:16px;">
      <span style="display:inline-block;padding:7px 15px;border-radius:999px;
        border:1px solid ${hexA(accent, 0.42)};background:${hexA(accent, 0.1)};
        color:${accent};font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">
        ${esc(heroBadge)}</span>
    </div>
  </td></tr>`;
}

function footer(brand: Brand, locale: Locale): string {
  const { ink, muted, faint, accent } = brand.colors;
  const localized = {
    en: { legal: "Fenrir Protocol · MyFenrir — The digital pack", note: "If you did not request this email, you can safely ignore it; nobody can access your account without this message. We will never ask for your password by email.", signoff: "Sent by MyFenrir · myfenrir.com", open: "Open MyFenrir" },
    es: { legal: brand.footer.legal ?? "", note: brand.footer.note ?? "", signoff: brand.footer.signoff ?? "", open: "Abrir MyFenrir" },
    fr: { legal: "Fenrir Protocol · MyFenrir — La meute numérique", note: "Si vous n’avez pas demandé cet e-mail, vous pouvez l’ignorer en toute sécurité. Nous ne vous demanderons jamais votre mot de passe par e-mail.", signoff: "Envoyé par MyFenrir · myfenrir.com", open: "Ouvrir MyFenrir" },
    de: { legal: "Fenrir Protocol · MyFenrir — Das digitale Rudel", note: "Falls du diese E-Mail nicht angefordert hast, kannst du sie sicher ignorieren. Wir werden dich niemals per E-Mail nach deinem Passwort fragen.", signoff: "Gesendet von MyFenrir · myfenrir.com", open: "MyFenrir öffnen" },
  }[locale];
  const links = (brand.footer.links ?? [])
    .map(
      (l) =>
        `<a href="${esc(l.url)}" target="_blank" style="color:${muted};text-decoration:none;font-weight:600;">${esc(l.url.includes("/main") ? localized.open : l.label)}</a>`,
    )
    .join(`<span style="color:${faint};">&nbsp;&middot;&nbsp;</span>`);
  return `
  <tr><td style="padding:26px 40px 40px 40px;background:${ink};">
    <div style="height:1px;background:rgba(150,166,224,.14);line-height:1px;">&nbsp;</div>
    ${links ? `<div style="margin-top:18px;font-size:13px;">${links}</div>` : ""}
    <div style="margin-top:14px;font-size:12px;line-height:1.6;color:${faint};">${esc(localized.legal)}</div>
    ${brand.footer.address ? `<div style="margin-top:4px;font-size:11px;color:${faint};">${esc(brand.footer.address)}</div>` : ""}
    ${
      localized.note
        ? `<div style="margin-top:16px;font-size:11px;line-height:1.7;color:${faint};">${esc(localized.note)}</div>`
        : ""
    }
    <div style="margin-top:16px;font-size:11px;color:${faint};">
      ${esc(localized.signoff)}
    </div>
  </td></tr>`;
}

export function layout(opts: LayoutOptions): string {
  const { brand, preheader, heroBadge, body } = opts;
  const locale = opts.locale ?? "es";
  const font = brand.fontStack ?? DEFAULT_FONT_STACK;
  const accent = brand.colors[opts.accentKey ?? "accent"];
  const { ink, surface, border, body: bodyText } = brand.colors;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${esc(brand.name)}</title>
  <!--[if mso]><style>table,td,div,p,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
  <style>
    body,table,td{margin:0;padding:0;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a{color:${accent};}
    @media only screen and (max-width:620px){
      .container{width:100% !important;}
      .px{padding-left:24px !important;padding-right:24px !important;}
      .hero{padding-left:24px !important;padding-right:24px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${ink};font-family:${font};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</div>
  <div style="display:none;max-height:0;overflow:hidden;">&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${ink}" style="background:${ink};">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0"
        style="width:600px;max-width:600px;">
        <tr><td style="border-radius:22px 22px 0 0;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="hero">
            ${hero(brand, heroBadge, accent)}
          </table>
        </td></tr>
        <tr><td class="px" bgcolor="${surface}" style="background:${surface};padding:36px 40px;
          border-left:1px solid ${border};border-right:1px solid ${border};color:${bodyText};">
          ${body}
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border-radius:0 0 22px 22px;overflow:hidden;">
            ${footer(brand, locale)}
          </table>
        </td></tr>
        <tr><td align="center" style="padding:18px 12px;">
          <div style="font-size:11px;color:rgba(174,181,208,.42);">
            &copy; ${new Date().getFullYear()} MyFenrir &middot; Fenrir Protocol
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Turn a #rrggbb into an rgba() with the given alpha (for glows / tints).
// Passes through non-hex inputs unchanged (e.g. already-rgba brand borders).
export function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
