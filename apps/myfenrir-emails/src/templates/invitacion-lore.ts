import type { Brand } from "../brands/types";
import { layout } from "../layout";
import { button, callout, cta, h1, p, spacer } from "../components";
import { esc, firstName } from "../format";
import type { RenderedEmail } from "./types";

export interface InvitacionLoreData {
  nombre?: string;
  email?: string;
  ctaUrl?: string;
  motivo?: string;
}

export const sample: InvitacionLoreData = {
  nombre: "Francisco",
  email: "francisco@example.com",
  ctaUrl: "https://lore.myfenrir.com/profile/new",
  motivo: "Tu identidad MyFenrir está activa.",
};

export function subject(): string {
  return "Tu identidad tiene otra capa — entra en LORE";
}

export function render(brand: Brand, d: InvitacionLoreData): RenderedEmail {
  const name = d.nombre || firstName(d.email);
  const url = d.ctaUrl || "https://lore.myfenrir.com/profile/new";
  const reason = d.motivo || "Tu identidad MyFenrir está lista.";
  const body = `
    ${h1(brand, "Tu identidad tiene otra capa")}
    ${p(brand, `${name ? `Hola <b style="color:${brand.colors.heading}">${esc(name)}</b>. ` : ""}${esc(reason)}`)}
    ${p(brand, "Ahora puedes entrar en LORE: una experiencia separada donde tus decisiones revelan un Aura, abren una historia y dan forma a tu perfil.")}
    ${spacer(12)}
    ${callout(brand, {
      title: "LORE",
      tone: "purple",
      lines: ["Tu Aura no es una etiqueta ni una promesa de premio. Es el comienzo de tu historia."],
    })}
    ${spacer(22)}
    ${cta(button(brand, "Descubrir mi Aura", url, "purple"))}`;

  return {
    subject: subject(),
    html: layout({ brand, preheader: "Tu identidad está lista. Descubre tu Aura en LORE.", heroBadge: "Nueva puerta", accentKey: "purple", body }),
    text: [
      "MyFenrir — Invitación a LORE",
      "",
      ...(name ? [`Hola ${name}.`, ""] : []),
      reason,
      "Ahora puedes entrar en LORE, descubrir tu Aura y comenzar tu perfil.",
      "Tu Aura no es una etiqueta ni una promesa de premio. Es el comienzo de tu historia.",
      "",
      `Descubrir mi Aura: ${url}`,
      "",
      brand.footer.signoff ?? "Enviado por MyFenrir · myfenrir.com",
    ].join("\n"),
  };
}
