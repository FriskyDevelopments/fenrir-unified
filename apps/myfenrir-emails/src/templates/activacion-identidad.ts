import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { button, callout, cta, h1, p, spacer, steps } from "../components";
import { esc, firstName } from "../format";
import type { RenderedEmail } from "./types";

export interface ActivacionIdentidadData {
  nombre?: string;
  email?: string;
  ctaUrl?: string;
  minutos?: number;
}

export const sample: ActivacionIdentidadData = {
  nombre: "Francisco",
  email: "francisco@example.com",
  ctaUrl: "https://www.myfenrir.com/main",
  minutos: 15,
};

export function subject(): string {
  return "La puerta está abierta — activa tu identidad MyFenrir";
}

export function render(brand: Brand, d: ActivacionIdentidadData): RenderedEmail {
  const name = d.nombre || firstName(d.email);
  const url = d.ctaUrl || "https://www.myfenrir.com/main";
  const minutes = Number.isFinite(d.minutos) ? Number(d.minutos) : 15;
  const body = `
    ${h1(brand, name ? `La puerta está abierta, ${esc(name)}` : "La puerta está abierta")}
    ${p(brand, "Activa tu identidad MyFenrir para gestionar tu cuenta, vincular Telegram y consultar tus accesos desde un solo lugar.")}
    ${spacer(8)}
    ${steps(brand, [
      { title: "Confirma tu identidad", body: "Abre el enlace seguro de este correo." },
      { title: "Vincula Telegram", body: 'Dentro del panel selecciona "Link Telegram ID".' },
      { title: "Consulta tus accesos", body: "El guardián verificará cada entrada de forma privada." },
    ])}
    ${spacer(22)}
    ${cta(button(brand, "Activar mi identidad", url))}
    ${spacer(20)}
    ${callout(brand, {
      title: "Enlace privado",
      lines: [`Este enlace vence en ${minutes} minutos. No lo compartas ni lo reenvíes.`],
    })}`;

  return {
    subject: subject(),
    html: layout({ brand, preheader: "Activa tu identidad MyFenrir y vincula Telegram.", heroBadge: "Activación", body }),
    text: [
      "MyFenrir — Activa tu identidad",
      "",
      ...(name ? [`Hola ${name},`, ""] : []),
      "Activa tu identidad para gestionar tu cuenta, vincular Telegram y consultar tus accesos.",
      "",
      `Activar mi identidad: ${url}`,
      `Este enlace vence en ${minutes} minutos. No lo compartas.`,
      "",
      brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
    ].join("\n"),
  };
}
