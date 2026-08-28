/**
 * Copy del Gate público (`/g/$slug`).
 *
 * Movido tal cual desde `routes/g.$slug.tsx`, donde vivía como isla local
 * `GATE_COPY` con su propia lista de locales y su propio normalizador. El texto
 * no cambia en este paso: sólo cambia de casa, para que exista UNA fuente por
 * dominio en vez de cuatro islas que se repiten y divergen.
 *
 * El inglés es la base: `defineCopy` infiere la forma de `en` y obliga a que
 * es/fr/de la igualen o no compila.
 *
 * ⚠️ fr y de vienen del código anterior y NO están revisados por nativo.
 */
import { defineCopy } from "./locale";

const en = {
  openMyGates: "Open my Gates",
  ownerAccessActive: "Owner access is active. Manage this community's Gates.",
  proceedSso: "Proceed to SSO",
  verifyHuman: "Verify human signal",
  runningSecurity: "Running Gate security…",
  reviewSubmitted: "Security review submitted",
  continueGate: "Continue Gate",
  gateSetupPending: "This Gate is still being connected by its owner",
  resultLabel: "Gate result",
  grantedTitle: "You’re in.",
  grantedBody: "Security cleared. Opening the private handoff…",
  blockedTitle: "Access denied.",
  blockedBody: "The Gate security screen blocked this entry. No private invite was issued.",
  reviewTitle: "Request received.",
  reviewBody:
    "Security flagged this for owner review. They can approve, deny, or ask for more info.",
  emailPrefix: "Confirmation email",
  // Sólo se promete el correo cuando el envío devolvió `true`. Ver
  // access.functions.ts:sendGateConfirmationEmail, que devuelve false en
  // silencio si la identidad de Telegram no trae correo.
  emailNotSent: "No email on this identity — your confirmation arrives in Telegram.",
  securityComplete: "Gate security complete",
  // Etiquetas GENÉRICAS de progreso. El miembro ve que hay etapas y cómo van;
  // nunca qué señal se examinó ni cuál falló. La pantalla de seguridad
  // infantil no se nombra ni se insinúa: va absorbida dentro de "Safety check".
  stageIdentity: "Identity check",
  stageSafety: "Safety check",
  stagePass: "Passed",
  stageReview: "In review",
  stageBlocked: "Not passed",
  humanStep: "Step 1 of 3 · private access",
  humanTitle: "Verify before entering",
  humanBody:
    "Complete one private check. Then we’ll continue to this Gate—nothing is shared or published.",
  humanBack: "← Back to Gate",
} as const;

export const gateCopy = defineCopy(en, {
  es: {
    openMyGates: "Abrir mis Gates",
    ownerAccessActive: "El acceso de owner está activo. Administra los Gates de esta comunidad.",
    proceedSso: "Continuar a SSO",
    verifyHuman: "Verificar señal humana",
    runningSecurity: "Corriendo seguridad del Gate…",
    reviewSubmitted: "Revisión de seguridad enviada",
    continueGate: "Continuar Gate",
    gateSetupPending: "El owner todavía está conectando este Gate",
    resultLabel: "Resultado del Gate",
    grantedTitle: "Estás dentro.",
    grantedBody: "Seguridad aprobada. Abriendo el handoff privado…",
    blockedTitle: "Acceso denegado.",
    blockedBody: "La seguridad del Gate bloqueó esta entrada. No se emitió invite privado.",
    reviewTitle: "Solicitud recibida.",
    reviewBody:
      "Seguridad marcó este acceso para revisión del owner. Puede aprobar, negar o pedir más info.",
    emailPrefix: "Correo de confirmación",
    emailNotSent: "Esta identidad no trae correo — tu confirmación llega por Telegram.",
    securityComplete: "Seguridad del Gate completa",
    stageIdentity: "Revisión de identidad",
    stageSafety: "Revisión de seguridad",
    stagePass: "Aprobada",
    stageReview: "En revisión",
    stageBlocked: "No aprobada",
    humanStep: "Paso 1 de 3 · acceso privado",
    humanTitle: "Verifica antes de entrar",
    humanBody:
      "Completa una revisión privada. Luego seguimos en este Gate; nada se comparte ni se publica.",
    humanBack: "← Volver al Gate",
  },
  fr: {
    openMyGates: "Ouvrir mes Gates",
    ownerAccessActive: "L’accès owner est actif. Gérez les Gates de cette communauté.",
    proceedSso: "Continuer vers SSO",
    verifyHuman: "Vérifier le signal humain",
    runningSecurity: "Contrôle Gate en cours…",
    reviewSubmitted: "Revue de sécurité envoyée",
    continueGate: "Continuer le Gate",
    gateSetupPending: "Le owner connecte encore ce Gate",
    resultLabel: "Résultat du Gate",
    grantedTitle: "Vous êtes dedans.",
    grantedBody: "Sécurité validée. Ouverture du handoff privé…",
    blockedTitle: "Accès refusé.",
    blockedBody:
      "Le contrôle de sécurité du Gate a bloqué cette entrée. Aucun lien privé n’a été émis.",
    reviewTitle: "Demande reçue.",
    reviewBody:
      "La sécurité a envoyé cette entrée en revue owner. Ils peuvent approuver, refuser ou demander plus d’infos.",
    emailPrefix: "Email de confirmation",
    emailNotSent: "Aucun email sur cette identité — votre confirmation arrive sur Telegram.",
    securityComplete: "Sécurité Gate terminée",
    stageIdentity: "Contrôle d’identité",
    stageSafety: "Contrôle de sécurité",
    stagePass: "Validé",
    stageReview: "En revue",
    stageBlocked: "Non validé",
    humanStep: "Étape 1 sur 3 · accès privé",
    humanTitle: "Vérifiez avant d’entrer",
    humanBody:
      "Complétez une vérification privée. Ensuite nous continuons vers ce Gate — rien n’est partagé ni publié.",
    humanBack: "← Retour au Gate",
  },
  de: {
    openMyGates: "Meine Gates öffnen",
    ownerAccessActive: "Der Owner-Zugriff ist aktiv. Verwalte die Gates dieser Community.",
    proceedSso: "Weiter zu SSO",
    verifyHuman: "Human-Signal prüfen",
    runningSecurity: "Gate-Sicherheit läuft…",
    reviewSubmitted: "Sicherheitsprüfung eingereicht",
    continueGate: "Gate fortsetzen",
    gateSetupPending: "Der Owner verbindet dieses Gate noch",
    resultLabel: "Gate-Ergebnis",
    grantedTitle: "Du bist drin.",
    grantedBody: "Sicherheit freigegeben. Privater Handoff wird geöffnet…",
    blockedTitle: "Zugriff verweigert.",
    blockedBody:
      "Die Gate-Sicherheitsprüfung hat diesen Eintritt blockiert. Kein privater Invite wurde erstellt.",
    reviewTitle: "Anfrage erhalten.",
    reviewBody:
      "Die Sicherheit hat diesen Eintritt zur Owner-Prüfung markiert. Sie können genehmigen, ablehnen oder mehr Infos anfordern.",
    emailPrefix: "Bestätigungs-E-Mail",
    emailNotSent: "Keine E-Mail zu dieser Identität — die Bestätigung kommt über Telegram.",
    securityComplete: "Gate-Sicherheit abgeschlossen",
    stageIdentity: "Identitätsprüfung",
    stageSafety: "Sicherheitsprüfung",
    stagePass: "Bestanden",
    stageReview: "In Prüfung",
    stageBlocked: "Nicht bestanden",
    humanStep: "Schritt 1 von 3 · privater Zugriff",
    humanTitle: "Vor dem Eintritt verifizieren",
    humanBody:
      "Schließe eine private Prüfung ab. Danach geht es mit diesem Gate weiter — nichts wird geteilt oder veröffentlicht.",
    humanBack: "← Zurück zum Gate",
  },
});

export type GateCopy = (typeof gateCopy)["en"];
