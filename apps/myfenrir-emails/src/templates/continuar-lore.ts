import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { button, cta, h1, p, spacer } from "../components";
import { esc, firstName } from "../format";
import type { RenderedEmail } from "./types";

export interface ContinuarLoreData {
  nombre?: string;
  email?: string;
  aura?: string;
  ctaUrl?: string;
}

export const sample: ContinuarLoreData = {
  nombre: "Francisco",
  email: "francisco@example.com",
  aura: "Oracle",
  ctaUrl: "https://lore.myfenrir.com/profile/new",
};

export function subject(_brand: Brand, d: ContinuarLoreData): string {
  return d.aura ? `Continúa como ${d.aura}` : "Tu historia quedó esperando";
}

export function render(brand: Brand, d: ContinuarLoreData): RenderedEmail {
  const name = d.nombre || firstName(d.email);
  const aura = d.aura ? esc(d.aura) : "";
  const url = d.ctaUrl || "https://lore.myfenrir.com/profile/new";
  const body = `
    ${h1(brand, aura ? `Continúa como ${aura}` : "Tu historia sigue esperando")}
    ${p(brand, `${name ? `Hola <b style="color:${brand.colors.heading}">${esc(name)}</b>. ` : ""}Tu progreso en LORE sigue guardado. Puedes regresar exactamente al punto donde lo dejaste.`)}
    ${p(brand, aura ? `Tu Aura es <b style="color:${brand.colors.purple}">${aura}</b>. Vuelve para continuar tu perfil y tu historia.` : "Vuelve para completar el recorrido, descubrir tu Aura y crear tu perfil.")}
    ${spacer(20)}
    ${cta(button(brand, aura ? `Continue as ${aura}` : "Continuar mi historia", url, "purple"))}`;

  return {
    subject: subject(brand, d),
    html: layout({ brand, preheader: aura ? `Tu Aura es ${aura}. Continúa tu historia.` : "Continúa tu recorrido en LORE.", heroBadge: "LORE", accentKey: "purple", body }),
    text: [
      "MyFenrir — LORE",
      "",
      ...(name ? [`Hola ${name}.`, ""] : []),
      "Tu progreso en LORE sigue guardado.",
      ...(d.aura ? [`Tu Aura es ${d.aura}.`] : ["Vuelve para descubrir tu Aura."]),
      "",
      `${d.aura ? `Continue as ${d.aura}` : "Continuar mi historia"}: ${url}`,
      "",
      brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
    ].join("\n"),
  };
}
