import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { codeBox, callout, h1, p, spacer } from "../components";
import { esc, spacedCode, firstName } from "../format";
import type { RenderedEmail } from "./types";

// Account verification / one-time code. Use for sign-up email verification or
// step-up confirmation where the user types a short code back into MyFenrir.
export interface VerificacionData {
  codigo: string;          // e.g. "F7K2Q9" or "482913"
  nombre?: string;         // greeting name (or derived from email)
  email?: string;          // used to derive a name when nombre is absent
  minutos?: number;        // validity window in minutes (default 15)
  accion?: string;         // what the code confirms, e.g. "crear tu cuenta"
}

export const sample: VerificacionData = {
  nombre: "Francisco",
  codigo: "F7K2Q9",
  minutos: 15,
  accion: "verificar tu cuenta MyFenrir",
};

export function subject(_brand: Brand, d: VerificacionData): string {
  return `${d.codigo} es tu código de verificación de MyFenrir`;
}

export function render(brand: Brand, d: VerificacionData): RenderedEmail {
  const mins = d.minutos ?? 15;
  const name = d.nombre || firstName(d.email);
  const accion = d.accion || "verificar tu cuenta MyFenrir";
  const body = `
    ${h1(brand, "Confirma que eres tú")}
    ${p(brand, `${name ? `Hola <b style="color:${brand.colors.heading}">${esc(name)}</b>, ` : ""}usa este código para ${esc(accion)}. Escríbelo en la pantalla donde lo solicita MyFenrir.`)}
    ${spacer(6)}
    ${codeBox(brand, d.codigo, `Válido por ${mins} minutos`)}
    ${spacer(20)}
    ${callout(brand, {
      title: "Seguridad",
      tone: "purple",
      lines: [
        "Nunca compartas este código. El equipo de MyFenrir jamás te lo pedirá.",
        "Si tú no iniciaste esto, ignora este correo — tu cuenta sigue protegida.",
      ],
    })}`;

  const html = layout({
    brand,
    preheader: `Tu código: ${spacedCode(d.codigo)} · válido ${mins} min`,
    heroBadge: "Verificación",
    accentKey: "accent",
    body,
  });

  const text = [
    `MyFenrir — Código de verificación`,
    ``,
    ...(name ? [`Hola ${name},`, ``] : []),
    `Usa este código para ${accion}:`,
    ``,
    `    ${d.codigo}`,
    ``,
    `Válido por ${mins} minutos. Nunca compartas este código; MyFenrir jamás te lo pedirá.`,
    `Si tú no lo solicitaste, ignora este correo.`,
    ``,
    brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
  ].join("\n");

  return { subject: subject(brand, d), html, text };
}
