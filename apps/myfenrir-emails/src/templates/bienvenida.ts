import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { button, cta, steps, h1, p, spacer, pill } from "../components";
import { esc, firstName } from "../format";
import { hexA } from "../layout";
import type { RenderedEmail } from "./types";

// Welcome email — sent after a member's account is created/verified.
export interface BienvenidaData {
  nombre?: string;
  email?: string;
  plan?: string;           // e.g. "Starter", "Pro", "Operator" (optional badge)
  ctaUrl?: string;         // default: dashboard /main
}

export const sample: BienvenidaData = {
  nombre: "Francisco",
  plan: "Starter",
  ctaUrl: "https://www.myfenrir.com/main",
};

export function subject(_brand: Brand, d: BienvenidaData): string {
  const name = d.nombre || firstName(d.email);
  return name ? `Bienvenido a la manada, ${name}` : "Bienvenido a la manada — MyFenrir";
}

export function render(brand: Brand, d: BienvenidaData): RenderedEmail {
  const name = d.nombre || firstName(d.email);
  const url = d.ctaUrl || "https://www.myfenrir.com/main";
  const planBadge = d.plan
    ? `<div style="margin-bottom:14px;">${pill(hexA(brand.colors.gold, 0.12), brand.colors.gold, `Plan ${d.plan}`, hexA(brand.colors.gold, 0.4))}</div>`
    : "";
  const body = `
    ${planBadge}
    ${h1(brand, name ? `Bienvenido, ${esc(name)}` : "Bienvenido a la manada")}
    ${p(brand, "Tu cuenta MyFenrir está lista. Fenrir es tu identidad y tu llave para toda la manada: comunidades, accesos y automatizaciones, en un solo lugar.")}
    ${spacer(10)}
    ${steps(brand, [
      { title: "Completa tu perfil", body: "Ponle cara y nombre a tu identidad Fenrir." },
      { title: "Vincula tu Telegram", body: 'En el panel toca "Link Telegram ID" para conectar la manada.' },
      { title: "Explora tus comunidades", body: "Entra a los espacios a los que perteneces." },
    ])}
    ${spacer(22)}
    ${cta(button(brand, "Abrir mi panel", url))}
    ${spacer(18)}
    ${p(brand, `<span style="font-size:13px;color:${brand.colors.muted}">¿Dudas? Responde a este correo o visita la <a href="https://myfenrir.com/wiki" style="color:${brand.colors.accentSoft};text-decoration:none;">Fenrir Wiki</a>.</span>`)}`;

  const html = layout({
    brand,
    preheader: "Tu cuenta MyFenrir está lista — así empiezas.",
    heroBadge: "Bienvenido",
    accentKey: "purple",
    body,
  });

  const text = [
    `MyFenrir — Bienvenido a la manada`,
    ``,
    ...(name ? [`Hola ${name},`, ``] : []),
    `Tu cuenta MyFenrir está lista.${d.plan ? ` Plan: ${d.plan}.` : ""}`,
    ``,
    `Primeros pasos:`,
    `1. Completa tu perfil.`,
    `2. Vincula tu Telegram desde el panel ("Link Telegram ID").`,
    `3. Explora tus comunidades.`,
    ``,
    `Abre tu panel: ${url}`,
    ``,
    `¿Dudas? Responde a este correo o visita https://myfenrir.com/wiki`,
    ``,
    brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
  ].join("\n");

  return { subject: subject(brand, d), html, text };
}
