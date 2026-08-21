/**
 * Separa dos verdades que hoy se ven iguales para el visitante:
 *
 *   404  "consulté y NO hay Gate publicado en esta dirección"   → hecho verificado
 *   503  "NO pude consultar; no sé si hay Gate o no"            → falta de conocimiento
 *
 * Un usuario legítimo con la base caída jamás debe recibir el mismo mensaje que
 * alguien cuyo enlace de verdad no existe: el primero se va creyendo que perdió
 * su comunidad. El código viaja en el mensaje del Error porque los server
 * functions de TanStack sólo serializan `message` a través de la frontera.
 */
export const GATE_UNAVAILABLE_CODE = "gate_lookup_unavailable";

/**
 * Marca interna de respuesta. El render del documento fija el status final
 * (200 al devolver, 500 al lanzar) y pisa cualquier `setResponseStatus` hecho
 * dentro del server fn o del loader — medido en vivo, las dos rutas. Las
 * CABECERAS sí sobreviven, así que marcamos con una y el entry del servidor
 * (`src/server.ts`) reescribe el status a 503 y borra la marca antes de salir.
 * Nunca llega al cliente.
 */
export const GATE_UNAVAILABLE_HEADER = "x-fenrir-gate-unavailable";

/** Mensaje único para el visitante cuando la verdad es "no pude comprobar". */
export const GATE_UNAVAILABLE_MESSAGE =
  "We could not reach the Gate directory just now, so we cannot tell whether this Gate exists. " +
  "This is a problem on our side, not with your link. Please try again in a moment.";

/** True sólo para el fallo de infraestructura, nunca para una ausencia real. */
export function isGateUnavailableError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes(GATE_UNAVAILABLE_CODE);
}

/*
 * Mensajes del handoff de Telegram. Antes los tres estados de abajo compartían
 * un solo texto —"Your access request must be accepted…"— que culpaba a una
 * solicitud pendiente aunque la causa real fuera que el Gate no tiene destino
 * configurado. Descriptivos del estado real, sin copy de producto añadida.
 */

/** No hay destino de Telegram verificado para este Gate: falta configuración. */
export const GATE_NO_DESTINATION_MESSAGE =
  "This Gate has no verified Telegram destination configured, so no invite can be issued. " +
  "This is a configuration gap on the Gate, not a decision about your request.";
export const GATE_NO_DESTINATION_MESSAGE_ES =
  "Este Gate no tiene un destino de Telegram verificado configurado, así que no se puede emitir invitación. " +
  "Es una falta de configuración del Gate, no una decisión sobre tu solicitud.";

/** Hay destino configurado, pero esta persona aún no tiene acceso concedido. */
export const GATE_REQUEST_NOT_GRANTED_MESSAGE =
  "Your access request for this Gate has not been granted yet, so no invite can be issued.";
export const GATE_REQUEST_NOT_GRANTED_MESSAGE_ES =
  "Tu solicitud de acceso a este Gate todavía no ha sido concedida, así que no se puede emitir invitación.";

/** Hay fila de destino, pero el id almacenado no es un grupo de Telegram válido. */
export const GATE_DESTINATION_INVALID_MESSAGE =
  "The Telegram destination stored for this Gate is not a valid group id, so no invite can be issued.";
export const GATE_DESTINATION_INVALID_MESSAGE_ES =
  "El destino de Telegram guardado para este Gate no es un id de grupo válido, así que no se puede emitir invitación.";

/** Error tipado que cruza la frontera server-fn conservando su clasificación. */
export function gateUnavailableError(cause: unknown): Error {
  const error = new Error(`${GATE_UNAVAILABLE_CODE}: ${GATE_UNAVAILABLE_MESSAGE}`);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}
