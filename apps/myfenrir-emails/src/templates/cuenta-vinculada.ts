import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { button, cta, dataTable, callout, h1, p, spacer } from "../components";
import { esc, fecha, firstName } from "../format";
import type { RenderedEmail } from "./types";

// "Cuenta vinculada" — confirmation that a Telegram account was linked to a
// MyFenrir identity. Fired after consumeTelegramLinkCode writes
// telegram_identity_links (see functions/_lib/telegram-identity.ts).
export interface CuentaVinculadaData {
  nombre?: string;
  email?: string;
  telegramUsername?: string;   // without @
  telegramNombre?: string;     // Telegram first name
  fechaISO?: string;           // link timestamp
  ctaUrl?: string;             // default: dashboard /main
}

export const sample: CuentaVinculadaData = {
  nombre: "Francisco",
  telegramUsername: "friskypup",
  telegramNombre: "Frisky",
  fechaISO: new Date().toISOString(),
  ctaUrl: "https://www.myfenrir.com/main",
};

export function subject(_brand: Brand, _d: CuentaVinculadaData): string {
  return "Tu Telegram quedó vinculado a MyFenrir";
}

export function render(brand: Brand, d: CuentaVinculadaData): RenderedEmail {
  const name = d.nombre || firstName(d.email);
  const url = d.ctaUrl || "https://www.myfenrir.com/main";
  const rows: { label: string; value: string; mono?: boolean }[] = [];
  if (d.telegramNombre) rows.push({ label: "Cuenta Telegram", value: d.telegramNombre });
  if (d.telegramUsername) rows.push({ label: "Usuario", value: `@${d.telegramUsername}`, mono: true });
  if (d.email) rows.push({ label: "Identidad MyFenrir", value: d.email, mono: true });
  rows.push({ label: "Vinculado", value: d.fechaISO ? fecha(d.fechaISO, true) : fecha(new Date(), true) });

  const body = `
    ${h1(brand, "Vínculo confirmado")}
    ${p(brand, `${name ? `Hola <b style="color:${brand.colors.heading}">${esc(name)}</b>, ` : ""}conectaste tu Telegram con tu identidad Fenrir. Ya puedes usar la manada desde el bot y recibir accesos sin fricción.`)}
    ${spacer(8)}
    ${dataTable(brand, rows)}
    ${spacer(20)}
    ${callout(brand, {
      title: "¿No fuiste tú?",
      tone: "danger",
      lines: [
        `Si no reconoces este vínculo, desvincúlalo desde tu panel y <a href="mailto:${esc(brand.supportEmail ?? "hola@myfenrir.com")}" style="color:${brand.colors.accentSoft};text-decoration:none;">avísanos</a> de inmediato.`,
      ],
    })}
    ${spacer(20)}
    ${cta(button(brand, "Ver mi panel", url, "accent"))}`;

  const html = layout({
    brand,
    preheader: "Tu cuenta de Telegram quedó vinculada a MyFenrir.",
    heroBadge: "Cuenta vinculada",
    accentKey: "accent",
    body,
  });

  const text = [
    `MyFenrir — Telegram vinculado`,
    ``,
    ...(name ? [`Hola ${name},`, ``] : []),
    `Conectaste tu Telegram con tu identidad Fenrir.`,
    ...(d.telegramNombre ? [`Cuenta Telegram: ${d.telegramNombre}`] : []),
    ...(d.telegramUsername ? [`Usuario: @${d.telegramUsername}`] : []),
    ...(d.email ? [`Identidad MyFenrir: ${d.email}`] : []),
    `Vinculado: ${d.fechaISO ? fecha(d.fechaISO, true) : fecha(new Date(), true)}`,
    ``,
    `Si no fuiste tú, desvincúlalo desde tu panel y avísanos: ${brand.supportEmail ?? "hola@myfenrir.com"}`,
    ``,
    `Ver mi panel: ${url}`,
    ``,
    brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
  ].join("\n");

  return { subject: subject(brand, d), html, text };
}
