import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { button, callout, cta, h1, p, spacer } from "../components";
import { esc, firstName } from "../format";
import type { RenderedEmail } from "./types";

// Magic link / passwordless login link ("Tu acceso a MyFenrir").
// This is the branded upgrade of the plain magic-link email in
// functions/api/community-auth/magic-link/request.ts.
export interface AccesoData {
  url: string;             // the one-time magic link
  nombre?: string;
  email?: string;
  minutos?: number;        // link validity (default 15)
  comunidad?: string;      // community/brand name for context ("La Manada")
}

export const sample: AccesoData = {
  nombre: "Francisco",
  url: "https://www.myfenrir.com/api/community-auth/magic-link/consume?token=demo-token-0000",
  minutos: 15,
  comunidad: "MyFenrir",
};

export function subject(_brand: Brand, d: AccesoData): string {
  return d.comunidad && d.comunidad !== "MyFenrir"
    ? `Tu acceso a ${d.comunidad} en MyFenrir`
    : "Tu acceso a MyFenrir";
}

export function render(brand: Brand, d: AccesoData): RenderedEmail {
  const mins = d.minutos ?? 15;
  const name = d.nombre || firstName(d.email);
  const dest = d.comunidad && d.comunidad !== "MyFenrir" ? esc(d.comunidad) : "la manada";
  const body = `
    ${h1(brand, "Entra con un solo toque")}
    ${p(brand, `${name ? `Hola <b style="color:${brand.colors.heading}">${esc(name)}</b>, ` : ""}toca el botón para entrar a ${dest}. No necesitas contraseña — este enlace te identifica de forma segura.`)}
    ${spacer(10)}
    ${cta(button(brand, "Entrar a MyFenrir", d.url))}
    ${spacer(18)}
    ${callout(brand, {
      title: "Sobre este enlace",
      tone: "accent",
      lines: [
        `Caduca en <b style="color:${brand.colors.body}">${mins} minutos</b> y solo puede usarse una vez.`,
        "Si tú no lo pediste, ignóralo — nadie entra a tu cuenta sin este correo.",
      ],
    })}
    ${spacer(18)}
    ${p(brand, `<span style="font-size:12px;color:${brand.colors.faint}">¿El botón no funciona? Copia y pega esta dirección en tu navegador:</span><br><span style="font-size:12px;color:${brand.colors.accentSoft};word-break:break-all;">${esc(d.url)}</span>`)}`;

  const html = layout({
    brand,
    preheader: `Tu enlace de acceso a MyFenrir · caduca en ${mins} min`,
    heroBadge: "Acceso",
    accentKey: "accent",
    body,
  });

  const text = [
    `MyFenrir — Tu acceso`,
    ``,
    ...(name ? [`Hola ${name},`, ``] : []),
    `Entra a MyFenrir con este enlace (caduca en ${mins} minutos, un solo uso):`,
    ``,
    d.url,
    ``,
    `Si tú no lo solicitaste, ignora este correo.`,
    ``,
    brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
  ].join("\n");

  return { subject: subject(brand, d), html, text };
}
