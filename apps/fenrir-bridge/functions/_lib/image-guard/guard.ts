/**
 * Fenrir Image Guard — decisión.
 *
 * Convierte el resultado del clasificador en un veredicto accionable. El punto
 * importante está en el ORDEN: `needs_review` se evalúa ANTES que las
 * comprobaciones de rechazo.
 *
 * Por qué: el servicio de moderación marca `APPROPRIATE:No` cuando manda algo a
 * revisión, para que quien llame no publique mientras espera al humano. Si
 * mirásemos `appropriate` primero, toda duda se leería como un rechazo
 * definitivo — exactamente lo contrario de lo que la cola existe para evitar.
 */

import type { GuardVerdict, TenantConfig, VisionResult } from "./types.js";

export function decideFromVision(
  result: VisionResult | null,
  tenant?: Partial<TenantConfig>,
): GuardVerdict {
  if (!result || result.model === "none") {
    return {
      decision: "error",
      result,
      reason: "The classifier did not answer. Nothing was published.",
    };
  }

  // Primero la duda: nunca se degrada a rechazo.
  if (result.needsReview) {
    return {
      decision: "needs_review",
      result,
      reason: "The classifier was not confident enough. Queued for human review.",
    };
  }

  const requirePerson = tenant?.requirePerson ?? true;
  const requireAppropriate = tenant?.requireAppropriate ?? true;
  const requireEntering = tenant?.requireEntering ?? true;

  if (requirePerson && !result.personDetected) {
    return { decision: "reject_no_person", result, reason: "No person is visible in the photo." };
  }

  if (requireAppropriate && !result.appropriate) {
    return {
      decision: "reject_inappropriate",
      result,
      reason: "The image did not pass the community's age check.",
    };
  }

  if (requireEntering && !result.entering) {
    return {
      decision: "reject_not_entering",
      result,
      reason: "The photo does not show someone entering.",
    };
  }

  return { decision: "allow", result, reason: "Approved." };
}

/** ¿Este veredicto tiene que aterrizar en la cola de revisión humana? */
export function shouldQueueForReview(verdict: GuardVerdict): boolean {
  return verdict.decision === "needs_review";
}
