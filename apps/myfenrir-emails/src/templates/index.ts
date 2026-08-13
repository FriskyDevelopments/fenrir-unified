import type { Brand } from "../brands/types";
import type { RenderedEmail } from "./types";
import * as verificacion from "./verificacion-codigo";
import * as acceso from "./acceso";
import * as bienvenida from "./bienvenida";
import * as cuentaVinculada from "./cuenta-vinculada";
import * as notificacion from "./notificacion";
import * as activacionIdentidad from "./activacion-identidad";
import * as invitacionLore from "./invitacion-lore";
import * as continuarLore from "./continuar-lore";

export type { RenderedEmail } from "./types";

export interface TemplateModule {
  id: string;
  label: string;
  render: (brand: Brand, data: any) => RenderedEmail;
  sample: any;
}

// Template registry. Add a template by dropping a file + one line here.
export const TEMPLATES: Record<string, TemplateModule> = {
  "verificacion-codigo": { id: "verificacion-codigo", label: "Verificación de cuenta / código", render: verificacion.render, sample: verificacion.sample },
  "acceso": { id: "acceso", label: "Acceso / magic link", render: acceso.render, sample: acceso.sample },
  "bienvenida": { id: "bienvenida", label: "Bienvenida", render: bienvenida.render, sample: bienvenida.sample },
  "cuenta-vinculada": { id: "cuenta-vinculada", label: "Cuenta vinculada (Telegram)", render: cuentaVinculada.render, sample: cuentaVinculada.sample },
  "notificacion": { id: "notificacion", label: "Notificación genérica", render: notificacion.render, sample: notificacion.sample },
  "activacion-identidad": { id: "activacion-identidad", label: "Activación de identidad MyFenrir", render: activacionIdentidad.render, sample: activacionIdentidad.sample },
  "invitacion-lore": { id: "invitacion-lore", label: "Invitación transaccional a LORE", render: invitacionLore.render, sample: invitacionLore.sample },
  "continuar-lore": { id: "continuar-lore", label: "Recuperación del recorrido LORE", render: continuarLore.render, sample: continuarLore.sample },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

export function getTemplate(id: string): TemplateModule | undefined {
  return TEMPLATES[id];
}
