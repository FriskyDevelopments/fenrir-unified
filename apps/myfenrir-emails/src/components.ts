import type { Brand } from "./brands/types";
import { MONO_STACK } from "./brands/types";
import { esc, spacedCode } from "./format";
import { hexA } from "./layout";

// Bulletproof CTA button (cyan). VML fallback = real rounded button in Outlook.
export function button(brand: Brand, label: string, url: string, accentKey: "accent" | "purple" | "gold" = "accent"): string {
  const accent = brand.colors[accentKey];
  const { accentDark, onAccent } = brand.colors;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr><td align="center" bgcolor="${accent}" style="border-radius:12px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="${esc(url)}" style="height:52px;v-text-anchor:middle;width:320px;" arcsize="24%"
        strokecolor="${accentDark}" fillcolor="${accent}">
        <w:anchorlock/><center style="color:${onAccent};font-family:sans-serif;font-size:16px;font-weight:bold;">
        ${esc(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${esc(url)}" target="_blank"
        style="display:inline-block;padding:16px 34px;border-radius:12px;background:${accent};
        color:${onAccent};font-size:16px;font-weight:800;text-decoration:none;letter-spacing:.2px;
        font-family:inherit;mso-hide:all;">${esc(label)}</a>
      <!--<![endif]-->
    </td></tr>
  </table>`;
}

// Ghost / secondary link button (outlined, for a low-emphasis alternate action).
export function ghostButton(brand: Brand, label: string, url: string): string {
  const { border, body } = brand.colors;
  return `<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 26px;
    border-radius:12px;border:1px solid ${border};color:${body};font-size:14px;font-weight:700;
    text-decoration:none;font-family:inherit;">${esc(label)}</a>`;
}

// The verification-code focal block — big, spaced, monospace, copy-friendly.
export function codeBox(brand: Brand, code: string, caption?: string): string {
  const { surfaceAlt, border, heading, muted, accent } = brand.colors;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="border:1px solid ${hexA(accent, 0.35)};border-radius:16px;background:${surfaceAlt};">
    <tr><td align="center" style="padding:26px 20px;">
      <div style="font-family:${MONO_STACK};font-size:38px;font-weight:700;letter-spacing:10px;
        color:${heading};line-height:1.1;">${esc(spacedCode(code))}</div>
      ${
        caption
          ? `<div style="margin-top:12px;font-size:12px;color:${muted};letter-spacing:.3px;">${esc(caption)}</div>`
          : ""
      }
    </td></tr>
  </table>`;
}

// Key/value data table (e.g. linked-account details). rows = [{label, value, mono?}]
export function dataTable(
  brand: Brand,
  rows: { label: string; value: string; mono?: boolean; strong?: boolean }[],
): string {
  const { border, muted, heading, surfaceAlt } = brand.colors;
  const body = rows
    .map((r, i) => {
      const bg = i % 2 === 1 ? hexA("#8CA0E0", 0.05) : "transparent";
      const mono = r.mono ? `font-family:${MONO_STACK};letter-spacing:.2px;` : "";
      const weight = r.strong ? "font-weight:800;" : "font-weight:600;";
      return `<tr>
        <td style="padding:12px 16px;background:${bg};font-size:13px;color:${muted};
          border-bottom:1px solid ${border};white-space:nowrap;">${esc(r.label)}</td>
        <td align="right" style="padding:12px 16px;background:${bg};font-size:14px;color:${heading};
          border-bottom:1px solid ${border};${weight}${mono}">${esc(r.value)}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="border:1px solid ${border};border-radius:12px;overflow:hidden;">${body}</table>`;
}

// Small status pill.
export function pill(bg: string, color: string, text: string, borderColor?: string): string {
  const bd = borderColor ? `border:1px solid ${borderColor};` : "";
  return `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${bg};${bd}
    color:${color};font-size:12px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;">${esc(text)}</span>`;
}

// Callout card — a tinted panel for security notes, tips, or "what happens next".
export function callout(
  brand: Brand,
  opts: { title?: string; lines: string[]; tone?: "accent" | "purple" | "gold" | "danger" },
): string {
  const tone = brand.colors[opts.tone ?? "accent"];
  const { surfaceAlt, heading, muted } = brand.colors;
  const lines = opts.lines
    .map((l) => `<div style="font-size:13px;line-height:1.7;color:${muted};">${l}</div>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${surfaceAlt};border:1px solid ${hexA(tone, 0.28)};border-left:3px solid ${tone};border-radius:12px;">
    <tr><td style="padding:16px 18px;">
      ${opts.title ? `<div style="font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${tone};margin-bottom:8px;">${esc(opts.title)}</div>` : ""}
      ${lines}
    </td></tr>
  </table>`;
}

// Numbered step list (welcome / next-steps).
export function steps(brand: Brand, items: { title: string; body?: string }[]): string {
  const { accent, heading, muted, surfaceAlt, border } = brand.colors;
  const rows = items
    .map(
      (it, i) => `<tr>
      <td width="34" valign="top" style="padding:10px 0;">
        <div style="width:26px;height:26px;border-radius:999px;background:${hexA(accent, 0.14)};
          border:1px solid ${hexA(accent, 0.4)};color:${accent};font-size:13px;font-weight:800;
          text-align:center;line-height:26px;">${i + 1}</div>
      </td>
      <td valign="top" style="padding:10px 0 10px 12px;">
        <div style="font-size:15px;font-weight:700;color:${heading};">${esc(it.title)}</div>
        ${it.body ? `<div style="margin-top:2px;font-size:13px;line-height:1.6;color:${muted};">${esc(it.body)}</div>` : ""}
      </td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

// Heading + paragraph helpers keep templates terse and consistent.
export function h1(brand: Brand, text: string): string {
  return `<h1 style="margin:8px 0 16px 0;font-size:26px;line-height:1.28;color:${brand.colors.heading};
    font-weight:800;letter-spacing:-.4px;">${esc(text)}</h1>`;
}

export function p(brand: Brand, text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:${brand.colors.body};">${text}</p>`;
}

export function spacer(px: number): string {
  return `<div style="height:${px}px;line-height:${px}px;">&nbsp;</div>`;
}

// Centered CTA wrapper.
export function cta(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">${inner}</td></tr></table>`;
}
