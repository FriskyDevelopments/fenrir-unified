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
  grantedBody: "Security cleared. Confirmation sent. Opening the private handoff…",
  blockedTitle: "Access denied.",
  blockedBody: "The Gate security screen blocked this entry. No private invite was issued.",
  reviewTitle: "Request received.",
  reviewBody:
    "Security flagged this for owner review. They can approve, deny, or ask for more info.",
  emailPrefix: "Confirmation email",
  securityComplete: "Gate security complete",
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
    grantedBody: "Seguridad aprobada. Confirmación enviada. Abriendo el handoff privado…",
    blockedTitle: "Acceso denegado.",
    blockedBody: "La seguridad del Gate bloqueó esta entrada. No se emitió invite privado.",
    reviewTitle: "Solicitud recibida.",
    reviewBody:
      "Seguridad marcó este acceso para revisión del owner. Puede aprobar, negar o pedir más info.",
    emailPrefix: "Correo de confirmación",
    securityComplete: "Seguridad del Gate completa",
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
    grantedBody: "Sécurité validée. Confirmation envoyée. Ouverture du handoff privé…",
    blockedTitle: "Accès refusé.",
    blockedBody:
      "Le contrôle de sécurité du Gate a bloqué cette entrée. Aucun lien privé n’a été émis.",
    reviewTitle: "Demande reçue.",
    reviewBody:
      "La sécurité a envoyé cette entrée en revue owner. Ils peuvent approuver, refuser ou demander plus d’infos.",
    emailPrefix: "Email de confirmation",
    securityComplete: "Sécurité Gate terminée",
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
    grantedBody: "Sicherheit freigegeben. Bestätigung gesendet. Privater Handoff wird geöffnet…",
    blockedTitle: "Zugriff verweigert.",
    blockedBody:
      "Die Gate-Sicherheitsprüfung hat diesen Eintritt blockiert. Kein privater Invite wurde erstellt.",
    reviewTitle: "Anfrage erhalten.",
    reviewBody:
      "Die Sicherheit hat diesen Eintritt zur Owner-Prüfung markiert. Sie können genehmigen, ablehnen oder mehr Infos anfordern.",
    emailPrefix: "Bestätigungs-E-Mail",
    securityComplete: "Gate-Sicherheit abgeschlossen",
    humanStep: "Schritt 1 von 3 · privater Zugriff",
    humanTitle: "Vor dem Eintritt verifizieren",
    humanBody:
      "Schließe eine private Prüfung ab. Danach geht es mit diesem Gate weiter — nichts wird geteilt oder veröffentlicht.",
    humanBack: "← Zurück zum Gate",
  },
});

export type GateCopy = (typeof gateCopy)["en"];
