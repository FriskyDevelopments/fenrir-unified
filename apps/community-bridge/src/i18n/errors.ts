/**
 * Errores visibles al usuario, por código.
 *
 * El problema que resuelve: los server functions lanzan `throw new Error(...)`
 * y **no saben el idioma del visitante** —no hay locale en el contexto de la
 * petición—. Si el texto se escribe en el servidor, queda congelado en un
 * idioma. Así que el servidor lanza un CÓDIGO y el cliente, que sí sabe el
 * locale, lo traduce. Es el mismo mecanismo que ya usa `gate-availability.ts`
 * para el 503: el código viaja dentro del mensaje y sobrevive la frontera
 * server-fn, que sólo serializa `Error.message`.
 *
 * FORMATO EN EL CABLE: `"<code>: <texto en inglés>"`. El prefijo es lo que el
 * cliente busca; el texto que sigue es el fallback legible si algo se muestra
 * en crudo (logs, curl, un cliente viejo). Nunca se pierde información.
 *
 * ⚠️ REVISIÓN NATIVA PENDIENTE (fr, de). Escribí las cuatro variantes para que
 * el sistema quede completo y compile, pero el francés y el alemán **no están
 * revisados por hablante nativo**. Marcados aquí a propósito: prefiero un
 * hueco señalado a una traducción inventada que nadie audite.
 */
import { defineCopy, type Locale } from "./locale";

/** Códigos estables. Cambiar uno rompe el contrato con el cliente. */
export const ERROR_CODES = [
  "telegram_identity_missing",
  "gate_not_ready",
  "gate_security_blocked",
  "access_request_not_found",
  "owner_access_required",
  "courtesy_not_configured",
  "stripe_not_configured",
  "session_missing_account_id",
  "account_missing_email",
  "stripe_no_checkout_url",
  "nowpayments_no_invoice_url",
  "gate_limit_unresolved",
  "telegram_mapping_unconfirmed",
  "telegram_group_not_verified",
  "telegram_handoff_not_configured",
  "telegram_identity_unusable",
  "handoff_payload_too_long",
  "gate_no_destination",
  "gate_request_not_granted",
  "gate_destination_invalid",
  "gate_lookup_unavailable",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** El inglés es la base: de aquí sale la forma que los demás deben igualar. */
const en: Record<ErrorCode, string> = {
  telegram_identity_missing:
    "Telegram identity missing from this SSO session. Return from Telegram and continue through the Gate.",
  gate_not_ready: "This Gate is not ready for access requests.",
  gate_security_blocked: "Access blocked by the Gate security screen.",
  access_request_not_found: "Access request not found for this Gate.",
  owner_access_required: "Owner access required.",
  courtesy_not_configured: "The courtesy service is not configured.",
  stripe_not_configured: "Card checkout is not configured.",
  session_missing_account_id: "Your session is missing a valid account id. Sign in again.",
  account_missing_email:
    "Your account has no email address on file. Add one before paying by card.",
  stripe_no_checkout_url: "Stripe did not return a checkout URL. Try again in a moment.",
  nowpayments_no_invoice_url: "NOWPayments did not return an invoice URL. Try again in a moment.",
  gate_limit_unresolved: "Could not resolve this profile's Gate limit.",
  telegram_mapping_unconfirmed: "Telegram mapping must be confirmed in Fenrir.",
  telegram_group_not_verified: "Choose a Telegram group Fenrir has verified for your account.",
  telegram_handoff_not_configured: "The Telegram handoff is not configured yet.",
  telegram_identity_unusable: "This Telegram identity cannot be used for a secure handoff.",
  handoff_payload_too_long: "The secure Telegram handoff payload is too long.",
  gate_no_destination:
    "This Gate has no verified Telegram destination configured, so no invite can be issued. This is a configuration gap on the Gate, not a decision about your request.",
  gate_request_not_granted:
    "Your access request for this Gate has not been granted yet, so no invite can be issued.",
  gate_destination_invalid:
    "The Telegram destination stored for this Gate is not a valid group id, so no invite can be issued.",
  gate_lookup_unavailable:
    "We could not reach the Gate directory just now, so we cannot tell whether this Gate exists. This is a problem on our side, not with your link. Please try again in a moment.",
};

export const errorCopy = defineCopy(en, {
  es: {
    telegram_identity_missing:
      "Falta la identidad de Telegram en esta sesión SSO. Vuelve desde Telegram y continúa por el Gate.",
    gate_not_ready: "Este Gate todavía no admite solicitudes de acceso.",
    gate_security_blocked: "La revisión de seguridad del Gate bloqueó este acceso.",
    access_request_not_found: "No se encontró la solicitud de acceso para este Gate.",
    owner_access_required: "Se requiere acceso de owner.",
    courtesy_not_configured: "El servicio de cortesías no está configurado.",
    stripe_not_configured: "El cobro con tarjeta no está configurado.",
    session_missing_account_id:
      "A tu sesión le falta un id de cuenta válido. Inicia sesión de nuevo.",
    account_missing_email:
      "Tu cuenta no tiene correo registrado. Añade uno antes de pagar con tarjeta.",
    stripe_no_checkout_url: "Stripe no devolvió una URL de pago. Inténtalo en un momento.",
    nowpayments_no_invoice_url:
      "NOWPayments no devolvió una URL de factura. Inténtalo en un momento.",
    gate_limit_unresolved: "No se pudo resolver el límite de Gates de este perfil.",
    telegram_mapping_unconfirmed: "El mapeo de Telegram debe confirmarse en Fenrir.",
    telegram_group_not_verified:
      "Elige un grupo de Telegram que Fenrir haya verificado para tu cuenta.",
    telegram_handoff_not_configured: "El handoff de Telegram todavía no está configurado.",
    telegram_identity_unusable:
      "Esta identidad de Telegram no puede usarse para un handoff seguro.",
    handoff_payload_too_long: "El payload del handoff seguro de Telegram es demasiado largo.",
    gate_no_destination:
      "Este Gate no tiene un destino de Telegram verificado configurado, así que no se puede emitir invitación. Es una falta de configuración del Gate, no una decisión sobre tu solicitud.",
    gate_request_not_granted:
      "Tu solicitud de acceso a este Gate todavía no ha sido concedida, así que no se puede emitir invitación.",
    gate_destination_invalid:
      "El destino de Telegram guardado para este Gate no es un id de grupo válido, así que no se puede emitir invitación.",
    gate_lookup_unavailable:
      "No pudimos alcanzar el directorio de Gates ahora mismo, así que no podemos saber si este Gate existe. Es un problema nuestro, no de tu enlace. Inténtalo en un momento.",
  },
  fr: {
    telegram_identity_missing:
      "Identité Telegram absente de cette session SSO. Revenez depuis Telegram et continuez par le Gate.",
    gate_not_ready: "Ce Gate n'accepte pas encore de demandes d'accès.",
    gate_security_blocked: "Le contrôle de sécurité du Gate a bloqué cet accès.",
    access_request_not_found: "Demande d'accès introuvable pour ce Gate.",
    owner_access_required: "Accès propriétaire requis.",
    courtesy_not_configured: "Le service de gratuités n'est pas configuré.",
    stripe_not_configured: "Le paiement par carte n'est pas configuré.",
    session_missing_account_id:
      "Il manque un identifiant de compte valide à votre session. Reconnectez-vous.",
    account_missing_email:
      "Votre compte n'a pas d'adresse e-mail enregistrée. Ajoutez-en une avant de payer par carte.",
    stripe_no_checkout_url: "Stripe n'a pas renvoyé d'URL de paiement. Réessayez dans un instant.",
    nowpayments_no_invoice_url:
      "NOWPayments n'a pas renvoyé d'URL de facture. Réessayez dans un instant.",
    gate_limit_unresolved: "Impossible de déterminer la limite de Gates de ce profil.",
    telegram_mapping_unconfirmed: "L'association Telegram doit être confirmée dans Fenrir.",
    telegram_group_not_verified:
      "Choisissez un groupe Telegram que Fenrir a vérifié pour votre compte.",
    telegram_handoff_not_configured: "Le handoff Telegram n'est pas encore configuré.",
    telegram_identity_unusable: "Cette identité Telegram ne peut pas servir à un handoff sécurisé.",
    handoff_payload_too_long: "Le payload du handoff Telegram sécurisé est trop long.",
    gate_no_destination:
      "Ce Gate n'a aucune destination Telegram vérifiée configurée, aucune invitation ne peut donc être émise. C'est une lacune de configuration du Gate, pas une décision sur votre demande.",
    gate_request_not_granted:
      "Votre demande d'accès à ce Gate n'a pas encore été accordée, aucune invitation ne peut donc être émise.",
    gate_destination_invalid:
      "La destination Telegram enregistrée pour ce Gate n'est pas un identifiant de groupe valide, aucune invitation ne peut donc être émise.",
    gate_lookup_unavailable:
      "Nous n'avons pas pu joindre l'annuaire des Gates à l'instant, nous ne pouvons donc pas dire si ce Gate existe. Le problème vient de chez nous, pas de votre lien. Réessayez dans un instant.",
  },
  de: {
    telegram_identity_missing:
      "In dieser SSO-Sitzung fehlt die Telegram-Identität. Kehre von Telegram zurück und fahre über das Gate fort.",
    gate_not_ready: "Dieses Gate nimmt noch keine Zugriffsanfragen an.",
    gate_security_blocked: "Die Sicherheitsprüfung des Gates hat diesen Zugriff blockiert.",
    access_request_not_found: "Zugriffsanfrage für dieses Gate nicht gefunden.",
    owner_access_required: "Owner-Zugriff erforderlich.",
    courtesy_not_configured: "Der Kulanz-Dienst ist nicht konfiguriert.",
    stripe_not_configured: "Die Kartenzahlung ist nicht konfiguriert.",
    session_missing_account_id: "Deiner Sitzung fehlt eine gültige Konto-ID. Melde dich erneut an.",
    account_missing_email:
      "Für dein Konto ist keine E-Mail-Adresse hinterlegt. Füge eine hinzu, bevor du per Karte zahlst.",
    stripe_no_checkout_url:
      "Stripe hat keine Checkout-URL zurückgegeben. Versuche es gleich noch einmal.",
    nowpayments_no_invoice_url:
      "NOWPayments hat keine Rechnungs-URL zurückgegeben. Versuche es gleich noch einmal.",
    gate_limit_unresolved: "Das Gate-Limit dieses Profils konnte nicht ermittelt werden.",
    telegram_mapping_unconfirmed: "Die Telegram-Zuordnung muss in Fenrir bestätigt werden.",
    telegram_group_not_verified:
      "Wähle eine Telegram-Gruppe, die Fenrir für dein Konto verifiziert hat.",
    telegram_handoff_not_configured: "Der Telegram-Handoff ist noch nicht konfiguriert.",
    telegram_identity_unusable:
      "Diese Telegram-Identität kann nicht für einen sicheren Handoff verwendet werden.",
    handoff_payload_too_long: "Die Nutzlast des sicheren Telegram-Handoffs ist zu lang.",
    gate_no_destination:
      "Für dieses Gate ist kein verifiziertes Telegram-Ziel konfiguriert, daher kann keine Einladung ausgestellt werden. Das ist eine Konfigurationslücke des Gates, keine Entscheidung über deine Anfrage.",
    gate_request_not_granted:
      "Deine Zugriffsanfrage für dieses Gate wurde noch nicht genehmigt, daher kann keine Einladung ausgestellt werden.",
    gate_destination_invalid:
      "Das für dieses Gate gespeicherte Telegram-Ziel ist keine gültige Gruppen-ID, daher kann keine Einladung ausgestellt werden.",
    gate_lookup_unavailable:
      "Wir konnten das Gate-Verzeichnis gerade nicht erreichen und können daher nicht sagen, ob dieses Gate existiert. Das liegt an uns, nicht an deinem Link. Versuche es gleich noch einmal.",
  },
});

/** Construye el mensaje que cruza el cable: `"<code>: <inglés>"`. */
export function codedError(code: ErrorCode): Error {
  return new Error(`${code}: ${errorCopy.en[code]}`);
}

/** Extrae el código de un error que cruzó la frontera server-fn. */
export function errorCodeOf(error: unknown): ErrorCode | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const head = message.split(":", 1)[0]?.trim();
  return (ERROR_CODES as readonly string[]).includes(head ?? "") ? (head as ErrorCode) : null;
}

/**
 * Texto para el visitante. Si el error no trae código conocido devuelve
 * `null`: quien llama decide su propio fallback en vez de recibir una cadena
 * inventada. Ningún fallo silencioso.
 */
export function translateError(error: unknown, locale: Locale): string | null {
  const code = errorCodeOf(error);
  return code ? errorCopy[locale][code] : null;
}
