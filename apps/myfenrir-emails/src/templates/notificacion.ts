import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { button, cta, pill, h1, spacer } from "../components";
import { esc } from "../format";
import { hexA } from "../layout";
import type { RenderedEmail } from "./types";

// Generic notification — the flexible workhorse for anything without a bespoke
// template (billing notices, security alerts, community announcements, etc.).
export interface NotificacionData {
  titulo: string;
  parrafos: string[];       // one or more paragraphs of body copy
  saludo?: string;          // optional "Hola X"
  etiqueta?: string;        // small pill above the title
  badge?: string;           // hero badge override (default "Notificación")
  ctaLabel?: string;
  ctaUrl?: string;
  tono?: "accent" | "purple" | "gold" | "danger"; // accent color for this message
}

export const sample: NotificacionData = {
  etiqueta: "Aviso",
  titulo: "Novedades en tu manada",
  saludo: "Hola",
  parrafos: [
    "Hay actividad nueva en una de tus comunidades de MyFenrir. Entra para ponerte al día con lo último de la manada.",
    "Puedes ajustar qué avisos recibes desde la configuración de tu cuenta.",
  ],
  ctaLabel: "Abrir MyFenrir",
  ctaUrl: "https://www.myfenrir.com/main",
  tono: "accent",
};

export function subject(_brand: Brand, d: NotificacionData): string {
  return d.titulo;
}

export function render(brand: Brand, d: NotificacionData): RenderedEmail {
  const tono = d.tono ?? "accent";
  const toneColor = brand.colors[tono];
  const paras = (d.parrafos ?? [])
    .map((t) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:${brand.colors.body};">${esc(t)}</p>`)
    .join("");
  const body = `
    ${d.etiqueta ? `<div style="margin-bottom:10px;">${pill(hexA(toneColor, 0.12), toneColor, d.etiqueta, hexA(toneColor, 0.4))}</div>` : ""}
    ${h1(brand, d.titulo)}
    ${d.saludo ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:${brand.colors.body};">${esc(d.saludo)},</p>` : ""}
    ${paras}
    ${
      d.ctaLabel && d.ctaUrl
        ? `${spacer(10)}${cta(button(brand, d.ctaLabel, d.ctaUrl, tono === "danger" ? "accent" : (tono as "accent" | "purple" | "gold")))}`
        : ""
    }`;

  const html = layout({
    brand,
    preheader: d.parrafos?.[0]?.slice(0, 140) ?? d.titulo,
    heroBadge: d.badge ?? "Notificación",
    accentKey: tono,
    body,
  });

  const text = [
    `MyFenrir — ${d.titulo}`,
    ``,
    ...(d.saludo ? [`${d.saludo},`, ``] : []),
    ...(d.parrafos ?? []),
    ...(d.ctaLabel && d.ctaUrl ? [``, `${d.ctaLabel}: ${d.ctaUrl}`] : []),
    ``,
    brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
  ].join("\n");

  return { subject: subject(brand, d), html, text };
}
