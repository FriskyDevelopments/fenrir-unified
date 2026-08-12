import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { copy, detectLocale, languageNames, locales, type Copy, type Locale } from "./i18n";
import { aiOpsService, appService, authService, billingService, bridgeService, commerceService, domainService, liveRoomService, readinessService, telegramIdentityService, telegramService, webauthnService, type AuthSession, type BillingStatusPayload, type PaidPlan, type ReadinessPayload, type TelegramIdentityLinkPayload } from "./services/api";
import { friskyClientAuthEngine, type AuthProvider } from "./services/authGateway";
import {
  getCommunityAuthBrandForAdmin,
  getCommunityAuthProposal,
  getCommunityBrand,
  saveCommunityBrand,
  CommunityBrandRequestError,
  type CommunityAuthProposal,
  type CommunityBrandPayload,
  type CommunityBrandUpdatePayload,
  type DefaultAccessState
} from "./services/communityAuth";
import {
  cleanDomainSearchBase,
  domainSearchCandidates,
  frontDoorCandidates,
  type DomainSearchResult,
  type DomainVerdict
} from "../shared/domain-search";
import type { AppState, FriskyBridge, FriskyCommissionLink, FriskyDomain, FriskyLiveRoom, FriskyTelegramInvite, LiveRoomProvider, Plan } from "./services/types";
import { AuthProviderButton } from "./components/AuthProviderButton";
import { AuthSurface } from "./components/AuthSurface";
import { communityBridgeDashboardUrl } from "./services/communityBridge";
import { CommunityBridgeHandoffPanel } from "./routes/communityGate";
import { knowledgeBaseLabel, knowledgeBaseUrl } from "./services/knowledgeBase";
import { CinematicLanding } from "./components/CinematicLanding";
import { GlowCard } from "./components/GlowCard";
import { TelegramLoginWidget } from "./components/TelegramLoginWidget";
import { brandThemes, themeClassName, themeCssVars } from "./theme/brandThemes";
import { NotFoundRoute } from "./routes/NotFoundRoute";

const defaultServiceOrg = (import.meta.env.VITE_DEFAULT_SERVICE_ORG ?? "Frisky Dev Workspace").trim();
const defaultServiceSubdomain = (import.meta.env.VITE_DEFAULT_SERVICE_SUBDOMAIN ?? "vip.myfenrir.com").trim();
const managedDashboardPath = "/main";
const telegramLoginBotUsername = (
  import.meta.env.VITE_FENRIR_TELEGRAM_BOT_USERNAME ??
  import.meta.env.VITE_MYFENRIR_TELEGRAM_BOT_USERNAME ??
  ""
).replace(/^@/, "").trim();
const vercelPreviewWithoutApi = import.meta.env.VITE_VERCEL_API_MODE === "disabled";

const uiCopy: Record<Locale, {
  friskyAccount: string;
  secondaryGate: string;
  routePrivateViaFenrir: string;
  proCustomization: string;
  proCustomizationBodyTitle: string;
  proCustomizationBody: string;
  telegramStatusCheck: string;
  linked: string;
  loginRequired: string;
  telegramConnected: (username: string, id: string, isSignedIn: boolean) => string;
  telegramSessionFoundNoLink: string;
  telegramSignInFirst: string;
  linkTelegramId: string;
  telegramVerifyWhenNeeded: string;
  telegramReaddButton: string;
  telegramReaddNeedChat: string;
  telegramReaddReady: string;
  telegramReaddUnavailable: string;
  devRequestViaSignal: string;
  devRequestViaSignalShort: string;
  setupRoute: string;
  openingLaunchRoute: string;
  setupPathReady: string;
  openNow: string;
  openFallback: string;
  linkPathNotReady: string;
  commandRouteNotMapped: string;
  openFallbackPartnerRoute: string;
  publicLockUnavailable: string;
  noVaultLinks: string;
  linkVaultLabel: string;
  selectedLinksDescription: string;
  selectedLinksSubtext: string;
  selectedLinksPrompt: string;
  myFenrirLinkVault: string;
  selectedShareHeading: string;
  selectedShareCopy: string;
  shareableVault: string;
  forSharingSelectedLinks: string;
  publicVaultIncludes: string;
  myFenrirLabel: string;
  share: string;
  hidden: string;
  personalLinkHelp: string;
  personalLinkTitleLabel: string;
  personalLinkTitlePlaceholder: string;
  personalLinkUrlLabel: string;
  personalLinkUrlPlaceholder: string;
  personalLinkKindLabel: string;
  clientExplanation: string;
  setupGoalHelp: string;
  onePathAtATime: string;
  assistantPrompt: string;
  ready: string;
  readiness: string;
  routeLaunch: string;
  linkConversion: string;
  turnPrivateInvite: string;
  pastePrivateLink: string;
  fenrirSubdomain: string;
  customerDomain: string;
  privateTarget: string;
  publicShareLink: string;
  privateTargetHidden: string;
  publicShareLinkReady: string;
  rawLinkHidden: string;
  cloudflareSsl: string;
  publicUrlReady: string;
  routeToPrivateDestination: string;
  protectedLink: string;
  stableUrl: string;
  privateDestination: string;
  resolvingLockState: string;
  checkingRoute: string;
  resolvingBridgeState: string;
  roomWaitingBody: string;
  roomBrandIntro: string;
  roomSecondaryLabel: string;
  roomChallengeDescription: string;
  fenrirRoomGate: string;
  protectedRedirectPending: string;
  challengeLayer: string;
  riskBasedPromptReady: string;
  challengeDescription: string;
  captchaLayer: string;
  idleNormalPattern: string;
  roomStableUrlLabel: string;
  roomPrivateDestinationLabel: string;
  walkthroughNodeMapLabel: string;
  walkthroughModeLabel: string;
  walkthroughPillsText: string;
  walkthroughLabel: string;
  walkthroughClientLabel: string;
  walkthroughAdminLabel: string;
  walkthroughLaunchLabel: string;
  walkthroughClientTitle: string;
  walkthroughClientBody: string;
  walkthroughClientQuote: string;
  walkthroughAdminTitle: string;
  walkthroughAdminBody: string;
  walkthroughAdminQuote: string;
  walkthroughLaunchTitle: string;
  walkthroughLaunchBody: string;
  walkthroughLaunchQuote: string;
  walkthroughStepsClient: [string, string, string, string];
  walkthroughStepsAdmin: [string, string, string, string];
  walkthroughStepsLaunch: [string, string, string, string];
  communityEmailPlaceholder: string;
  neonMagicBusy: string;
  neonMagicButton: string;
  neonMagicSuccessMessage: string;
  neonMagicDevLinkLabel: string;
  fallbackPartnerLabel: string;
  vaultLinkOpenLabelPrefix: string;
  liveRoomSecondaryLabel: string;
  liveRoomChallengeReady: string;
  createPaidRoomTitle: string;
  createPaidRoomBody: string;
    createPaidRoomNeed: string;
    roomCoverImageInvalid: string;
  setupInputTelegramSlug: string;
  setupInputTelegramId: string;
  setupInputGroupName: string;
  setupInputGroupPhoto: string;
  setupInputDomain: string;
  setupInputRoomSlug: string;
  setupInputRoomTitle: string;
  setupInputRoomTarget: string;
  setupInputRoomCover: string;
  setupInputGroupEmail: string;
  setupInputCommunityEmail: string;
  setupInputCustomDomain: string;
  setupInputLiveRoom: string;
  liveRoomUrlHint: string;
}> = {
  en: {
    friskyAccount: "Frisky Account",
    secondaryGate: "Secondary gate",
    routePrivateViaFenrir: "Route Zoom, Meet, Webex, or any room through Fenrir first.",
    proCustomization: "Pro customization",
    proCustomizationBodyTitle: "Starting at Pro, customers can add their logo and branded room visuals.",
    proCustomizationBody: "Starter includes the clean Fenrir room gate. Pro and Operator unlock customer logo, custom room name styling, and a branded hero image on the secondary link.",
    telegramStatusCheck: "Telegram status check",
    linked: "linked",
    loginRequired: "login required",
    telegramConnected: (username, id) => `${username ? `@${username}` : id} is connected to this Frisky ID.`,
    telegramSessionFoundNoLink: "Frisky session found. Telegram ID is not linked yet, so Fenrir cannot verify Telegram Stars or access status for this account.",
    telegramSignInFirst: "Sign in with the unified Frisky login first so Fenrir can check whether this Telegram ID has active access.",
    linkTelegramId: "Link Telegram ID",
    telegramVerifyWhenNeeded: "Telegram is only verified when a Telegram action needs it.",
    telegramReaddButton: "Re-add me",
    telegramReaddNeedChat: "Enter the Telegram group ID first.",
    telegramReaddReady: "Recovery invite ready. Fenrir opened a one-use Telegram link.",
    telegramReaddUnavailable: "Recovery invite could not be created. Check bot admin invite permissions.",
    devRequestViaSignal: "Dev request via Frisky Signal",
    devRequestViaSignalShort: "Frisky Signal",
    setupRoute: "Setup route",
    openingLaunchRoute: "Opening launch route",
    setupPathReady: "This setup path is ready. Fenrir opened it automatically; use the button if blocked.",
    openNow: "Open now",
    openFallback: "Open fallback",
    linkPathNotReady: "Link path not ready",
    commandRouteNotMapped: "This command route is not mapped to a destination yet.",
    openFallbackPartnerRoute: "Open fallback partner route",
    publicLockUnavailable: "Public lock unavailable",
    noVaultLinks: "No vault links found.",
    linkVaultLabel: "Shareable vault",
    selectedLinksDescription: "For sharing your selected links with someone.",
    selectedLinksSubtext: "Choose what to share or hide. The public vault includes only selected stable URLs, never raw invites or private room targets.",
    selectedLinksPrompt: "Ask the admin to create a fresh share link from",
    myFenrirLinkVault: "Frisky Dev Link Vault",
    selectedShareHeading: "Selected links, one share page.",
    selectedShareCopy: "This page is for sharing only the links the admin selected. Open the official public URLs for Telegram locks, room gates, payments, docs, booking, and support. Private targets stay behind Fenrir.",
    shareableVault: "Shareable vault",
    forSharingSelectedLinks: "For sharing your selected links with someone.",
    publicVaultIncludes: "Choose what to share or hide. The public vault includes only selected stable URLs, never raw invites or private room targets.",
    myFenrirLabel: "Fenrir Bridge",
    share: "Share",
    hidden: "Hidden",
    personalLinkHelp: "Add a stable public URL to this vault. Fenrir stores the label, URL, and category so the box is readable before sharing.",
    personalLinkTitleLabel: "Link label",
    personalLinkTitlePlaceholder: "Mercado Pago checkout",
    personalLinkUrlLabel: "Stable URL",
    personalLinkUrlPlaceholder: "https://pay.example.com/fenrir",
    personalLinkKindLabel: "Link type",
    clientExplanation: "Client explanation",
    setupGoalHelp: "Tell Fenrir your launch goal. It opens the right setup in sequence.",
    onePathAtATime: "Walk one path at a time: lock, route, share, then launch.",
    assistantPrompt: "I can open the right panel for you. Pick a launch outcome.",
    ready: "Ready",
    readiness: "Ready",
    routeLaunch: "Turn a private invite into a branded public link.",
    linkConversion: "Link conversion",
    turnPrivateInvite: "Turn private invite",
    pastePrivateLink: "Paste a Telegram, Zoom, Webex, Whereby, or Meet link. Fenrir keeps the target private and gives the admin a stable domain URL.",
    fenrirSubdomain: "Fenrir subdomain",
    customerDomain: "Customer domain",
    privateTarget: "Private target",
    publicShareLink: "Public share link",
    privateTargetHidden: "Private target hidden",
    publicShareLinkReady: "Ready after creation",
    rawLinkHidden: "Raw link hidden",
    cloudflareSsl: "Cloudflare SSL",
    publicUrlReady: "Public URL ready",
    routeToPrivateDestination: "Fenrir route from public link to private destination",
    protectedLink: "Secondary protected link",
    stableUrl: "Stable Fenrir URL",
    privateDestination: "Private destination",
    resolvingLockState: "Resolving Fenrir Lock",
    checkingRoute: "Checking route",
    resolvingBridgeState: "Fenrir is checking the live D1 bridge state.",
    roomWaitingBody: "This call room is missing or paused. Ask the admin for a fresh room link.",
    roomBrandIntro: "Fenrir hosts the branded front door first. If traffic looks unusual, this page can require a quick challenge before opening the private room.",
    roomSecondaryLabel: "Secondary protected link",
    roomChallengeDescription: "Unusual bursts can route through Turnstile or a similar check before redirect.",
    fenrirRoomGate: "Fenrir room gate",
    protectedRedirectPending: "Protected redirect coming online",
    roomStableUrlLabel: "Stable Fenrir URL",
    roomPrivateDestinationLabel: "Private destination",
    walkthroughNodeMapLabel: "animated route",
    walkthroughModeLabel: "Walkthrough modes",
    walkthroughPillsText: "Fenrir route from public link to private destination",
    walkthroughLabel: "Client-facing Fenrir walkthrough",
    walkthroughClientLabel: "Client view",
    walkthroughAdminLabel: "Admin view",
    walkthroughLaunchLabel: "Launch walkthrough",
    walkthroughClientTitle: "One clean link replaces messy private invites.",
    walkthroughClientBody: "Your customer sees a branded Fenrir page, not a raw Telegram, Zoom, or payment URL. The private destination stays hidden until access is allowed.",
    walkthroughClientQuote: "Send this link. Fenrir handles the gate.",
    walkthroughAdminTitle: "The owner keeps control after the link is already public.",
    walkthroughAdminBody: "If an invite leaks or a room changes, the admin rotates the hidden target. The flyer, bio link, QR code, and customer message keep the same public URL.",
    walkthroughAdminQuote: "Change the back room. Keep the front door.",
    walkthroughLaunchTitle: "The customer journey stays simple from click to entry.",
    walkthroughLaunchBody: "Fenrir explains what is happening in plain language, confirms the right gate, and sends the approved visitor to the correct private room or group.",
    walkthroughLaunchQuote: "Click, verify, enter. No exposed link trail.",
    walkthroughStepsClient: ["Public link", "Branded gate", "Access check", "Private destination"],
    walkthroughStepsAdmin: ["Stable URL", "Rotate target", "Revoke leak", "Audit action"],
    walkthroughStepsLaunch: ["Customer clicks", "Fenrir explains", "Access unlocks", "Entry opens"],
    communityEmailPlaceholder: "you@community.com",
    neonMagicBusy: "Creating Neon link...",
    neonMagicButton: "Send Neon magic link",
    neonMagicSuccessMessage: "Neon auth link sent. Check your inbox and follow the latest approval step.",
    neonMagicDevLinkLabel: "Open dev auth link",
    fallbackPartnerLabel: "Fallback links",
    challengeLayer: "Challenge layer",
    riskBasedPromptReady: "Risk-based prompt ready",
    challengeDescription: "Unusual bursts can route through Turnstile or a similar check before redirect.",
    captchaLayer: "Captcha layer",
    idleNormalPattern: "Idle: normal pattern",
    vaultLinkOpenLabelPrefix: "Open",
    liveRoomSecondaryLabel: "Secondary link",
    liveRoomChallengeReady: "Challenge-ready",
    createPaidRoomTitle: "Protect a Telegram group",
    createPaidRoomBody: "Paste group ID and image, then publish a stable locked link.",
    createPaidRoomNeed: "Need: group access",
    roomCoverImageInvalid: "Room logo or image URL is invalid.",
    setupInputTelegramSlug: "main",
    setupInputTelegramId: "Telegram group ID",
    setupInputGroupName: "Group name",
    setupInputGroupPhoto: "Auto from Telegram group photo",
    setupInputDomain: "vip.myfenrir.com",
    setupInputRoomSlug: "access-room",
    setupInputRoomTitle: "Zoom room name / client title",
    setupInputRoomTarget: "Private call URL",
    setupInputRoomCover: "Pro logo / branded image URL",
    setupInputGroupEmail: "you@community.com",
    setupInputCommunityEmail: "you@community.com",
    setupInputCustomDomain: "customer.myfenrir.com",
    setupInputLiveRoom: "Room title",
    liveRoomUrlHint: "Private call URL"
  },
  es: {
    friskyAccount: "Cuenta Frisky",
    secondaryGate: "Segunda puerta",
    routePrivateViaFenrir: "Ruta el Zoom, Meet, Webex o cualquier sala por Fenrir primero.",
    proCustomization: "Personalizacion Pro",
    proCustomizationBodyTitle: "Desde Pro, los clientes pueden agregar logo y portada de sala personalizada.",
    proCustomizationBody: "Starter incluye la puerta limpia de sala. Pro y Operator habilitan logo del cliente, estilo de nombre y hero branding en el enlace secundario.",
    telegramStatusCheck: "Estado de Telegram",
    linked: "vinculado",
    loginRequired: "requiere inicio de sesion",
    telegramConnected: (username, id) => `${username ? `@${username}` : id} esta conectado a esta ID de Frisky.`,
    telegramSessionFoundNoLink: "Sesion Frisky encontrada. El ID de Telegram aun no esta vinculado, asi que Fenrir no puede verificar Telegram Stars ni estado de acceso.",
    telegramSignInFirst: "Inicia sesion con el login unificado de Frisky para que Fenrir pueda verificar si este Telegram ID tiene acceso activo.",
    linkTelegramId: "Vincular Telegram ID",
    telegramVerifyWhenNeeded: "Telegram solo se verifica cuando una accion de Telegram lo necesita.",
    telegramReaddButton: "Reingresar",
    telegramReaddNeedChat: "Ingresa primero el ID del grupo de Telegram.",
    telegramReaddReady: "Invite de recuperacion listo. Fenrir abrio un link de Telegram de un solo uso.",
    telegramReaddUnavailable: "No se pudo crear el invite de recuperacion. Revisa permisos admin del bot.",
    devRequestViaSignal: "Pedido de soporte via Frisky Signal",
    devRequestViaSignalShort: "Frisky Signal",
    setupRoute: "Ruta de preparacion",
    openingLaunchRoute: "Abriendo ruta de lanzamiento",
    setupPathReady: "Esta ruta ya esta lista. Fenrir la abrio automaticamente; usa el boton si esta bloqueada.",
    openNow: "Abrir ahora",
    openFallback: "Abrir respaldo",
    linkPathNotReady: "Ruta de link no esta lista",
    commandRouteNotMapped: "Esta ruta de comando aun no esta asignada a un destino.",
    openFallbackPartnerRoute: "Abrir ruta de respaldo",
    publicLockUnavailable: "Candado publico no disponible",
    noVaultLinks: "No se encontraron links de vault.",
    linkVaultLabel: "Vault compartible",
    selectedLinksDescription: "Para compartir los links que seleccionaste.",
    selectedLinksSubtext: "Elige que compartir o ocultar. El vault publico incluye solo URLs estables seleccionadas, nunca invitados o targets privados.",
    selectedLinksPrompt: "Pide al admin que cree un nuevo link compartible desde",
    myFenrirLinkVault: "Boveda de links de Frisky Dev",
    selectedShareHeading: "Links seleccionados, una sola pagina.",
    selectedShareCopy: "Esta pagina es solo para compartir links que el admin selecciono. Abre los enlaces publicos oficiales de Telegram locks, salas, pagos, docs, reservas y soporte. Los objetivos privados quedan protegidos por Fenrir.",
    shareableVault: "Vault compartible",
    forSharingSelectedLinks: "Para compartir tus links seleccionados con alguien.",
    publicVaultIncludes: "Elige que compartir u ocultar. El vault publico incluye solo enlaces estables seleccionados, nunca invites sin filtrar o targets privados.",
    myFenrirLabel: "Fenrir Bridge",
    share: "Compartir",
    hidden: "Oculto",
    personalLinkHelp: "Agrega una URL publica estable a este vault. Fenrir guarda etiqueta, URL y categoria para que la caja sea legible antes de compartir.",
    personalLinkTitleLabel: "Etiqueta del link",
    personalLinkTitlePlaceholder: "Checkout Mercado Pago",
    personalLinkUrlLabel: "URL estable",
    personalLinkUrlPlaceholder: "https://pay.example.com/fenrir",
    personalLinkKindLabel: "Tipo de link",
    clientExplanation: "Explicacion cliente",
    setupGoalHelp: "Dile a Fenrir tu objetivo de lanzamiento. Abre el panel correcto en orden.",
    onePathAtATime: "Avanza paso a paso: lock, ruta, comparti, y lanzar.",
    assistantPrompt: "Puedo abrir el panel correcto por ti. Elige un objetivo de lanzamiento.",
    ready: "Listo",
    readiness: "Listo",
    routeLaunch: "Convierte un link privado en un link publico con branding.",
    linkConversion: "Conversion de links",
    turnPrivateInvite: "Convertir invite privado",
    pastePrivateLink: "Pega un link Telegram, Zoom, Webex, Whereby o Meet. Fenrir mantiene el target privado y da una URL de dominio estable.",
    fenrirSubdomain: "Subdominio Fenrir",
    customerDomain: "Dominio del cliente",
    privateTarget: "Target privado",
    publicShareLink: "Link publico para compartir",
    privateTargetHidden: "Target privado oculto",
    publicShareLinkReady: "Listo despues de crear",
    rawLinkHidden: "Link sin revelar",
    cloudflareSsl: "SSL Cloudflare",
    publicUrlReady: "URL publica lista",
    routeToPrivateDestination: "Ruta de Fenrir de link publico a destino privado",
    protectedLink: "Enlace protegido",
    stableUrl: "URL estable de Fenrir",
    privateDestination: "Destino privado",
    challengeLayer: "Capa de desafio",
    riskBasedPromptReady: "Prompt por riesgo listo",
    challengeDescription: "Picos inusuales pueden pasar por Turnstile o chequeo similar antes del redirect.",
    captchaLayer: "Capa captcha",
    idleNormalPattern: "Idle: patron normal",
    vaultLinkOpenLabelPrefix: "Abrir",
    liveRoomSecondaryLabel: "Enlace secundario",
    liveRoomChallengeReady: "Desafio listo",
    createPaidRoomTitle: "Proteger un grupo Telegram",
    createPaidRoomBody: "Pega ID de grupo e imagen, luego publica un link estable con candado.",
    createPaidRoomNeed: "Necesario: acceso al grupo",
    roomCoverImageInvalid: "La imagen/logo de la sala no tiene una URL válida.",
    setupInputTelegramSlug: "principal",
    setupInputTelegramId: "ID del grupo Telegram",
    setupInputGroupName: "Nombre del grupo",
    setupInputGroupPhoto: "Foto del grupo de Telegram",
    setupInputDomain: "vip.myfenrir.com",
    setupInputRoomSlug: "sala-acceso",
    setupInputRoomTitle: "Nombre de sala / cliente",
    setupInputRoomTarget: "URL de llamada privada",
    setupInputRoomCover: "Logo Pro / URL de portada",
    setupInputGroupEmail: "tu@comunidad.com",
    setupInputCommunityEmail: "tu@comunidad.com",
    setupInputCustomDomain: "cliente.myfenrir.com",
    setupInputLiveRoom: "Titulo de sala",
    liveRoomUrlHint: "URL privada de llamada",
    resolvingLockState: "Resolviendo la llave de Fenrir",
    checkingRoute: "Verificando ruta",
    resolvingBridgeState: "Fenrir está comprobando el estado en vivo del puente D1.",
    roomWaitingBody: "Esta sala de llamada no existe o está pausada. Pide al administrador un enlace de sala actualizado.",
    roomBrandIntro: "Fenrir muestra primero la puerta con marca. Si hay tráfico inusual, esta página puede pedir un desafío rápido antes de abrir la sala privada.",
    roomSecondaryLabel: "Enlace protegido secundario",
    roomChallengeDescription: "Picos inusuales pueden pasar por Turnstile o una verificación similar antes de redirigir.",
    fenrirRoomGate: "Puerta de sala Fenrir",
    protectedRedirectPending: "La redirección protegida está entrando en línea",
    roomStableUrlLabel: "URL estable de Fenrir",
    roomPrivateDestinationLabel: "Destino privado",
    walkthroughNodeMapLabel: "ruta animada",
    walkthroughModeLabel: "Modos de presentación",
    walkthroughPillsText: "Ruta de Fenrir desde el enlace público al destino privado",
    walkthroughLabel: "Guía de Fenrir orientada al cliente",
    walkthroughClientLabel: "Vista de cliente",
    walkthroughAdminLabel: "Vista de admin",
    walkthroughLaunchLabel: "Guía de lanzamiento",
    walkthroughClientTitle: "Un enlace limpio reemplaza invitaciones privadas desordenadas.",
    walkthroughClientBody: "Tu cliente ve una página Fenrir con branding, no una URL privada de Telegram, Zoom o pago en crudo. El destino privado se mantiene oculto hasta que se autoriza el acceso.",
    walkthroughClientQuote: "Comparte este enlace. Fenrir controla la puerta.",
    walkthroughAdminTitle: "El propietario mantiene el control aunque el enlace ya sea público.",
    walkthroughAdminBody: "Si una invitación se filtra o cambia una sala, el admin rota el destino oculto. El flyer, bio link, QR y mensaje al cliente conservan la misma URL pública.",
    walkthroughAdminQuote: "Cambia la sala trasera. Mantén la puerta frontal.",
    walkthroughLaunchTitle: "El viaje del cliente sigue siendo simple de clic a acceso.",
    walkthroughLaunchBody: "Fenrir explica con lenguaje claro lo que pasa, valida la puerta correcta y envía al visitante aprobado al room o grupo privado correcto.",
    walkthroughLaunchQuote: "Toca, verifica, entra. Sin trazas de enlace expuestas.",
    walkthroughStepsClient: ["Enlace público", "Puerta con marca", "Chequeo de acceso", "Destino privado"],
    walkthroughStepsAdmin: ["URL estable", "Rotar destino", "Revocar fuga", "Acción de auditoría"],
    walkthroughStepsLaunch: ["Cliente hace clic", "Fenrir explica", "Acceso desbloqueado", "Entrada abierta"],
    communityEmailPlaceholder: "tu@comunidad.com",
    neonMagicBusy: "Creando enlace Neon...",
    neonMagicButton: "Enviar enlace mágico Neon",
    neonMagicSuccessMessage: "Enlace de autenticación Neon enviado. Revisa el correo y sigue el último paso de aprobación.",
    neonMagicDevLinkLabel: "Abrir enlace de prueba Neon",
    fallbackPartnerLabel: "Enlaces de respaldo"
  },
  fr: {
    friskyAccount: "Compte Frisky",
    secondaryGate: "Passerelle secondaire",
    routePrivateViaFenrir: "Acheminer Zoom, Meet, Webex ou toute salle via Fenrir en premier.",
    proCustomization: "Personnalisation Pro",
    proCustomizationBodyTitle: "À partir de Pro, les clients peuvent ajouter logo et visuels personnalisés.",
    proCustomizationBody: "Starter garde la passerelle Fenrir standard. Pro et Operator débloquent logo client, style de nom personnalisé et hero image sur le lien secondaire.",
    telegramStatusCheck: "Etat Telegram",
    linked: "lié",
    loginRequired: "connexion requise",
    telegramConnected: (username, id) => `${username ? `@${username}` : id} est connecté à cet ID Frisky.`,
    telegramSessionFoundNoLink: "Session Frisky trouvee. L'ID Telegram n'est pas encore lie, donc Fenrir ne peut pas verifier Telegram Stars ni l'etat d'acces.",
    telegramSignInFirst: "Connectez-vous avec le login Frisky unifie pour que Fenrir verifie l'acces actif de cet ID Telegram.",
    linkTelegramId: "Lier Telegram ID",
    telegramVerifyWhenNeeded: "Telegram est verifie seulement quand une action Telegram en a besoin.",
    telegramReaddButton: "Me reinviter",
    telegramReaddNeedChat: "Entrez d'abord l'ID du groupe Telegram.",
    telegramReaddReady: "Invitation de recuperation prete. Fenrir a ouvert un lien Telegram a usage unique.",
    telegramReaddUnavailable: "Impossible de creer l'invitation de recuperation. Verifiez les droits admin du bot.",
    devRequestViaSignal: "Demande support via Frisky Signal",
    devRequestViaSignalShort: "Frisky Signal",
    setupRoute: "Route de setup",
    openingLaunchRoute: "Ouverture de la route de lancement",
    setupPathReady: "Cette route est prête. Fenrir l'a ouverte automatiquement; utilisez le bouton si bloquée.",
    openNow: "Ouvrir",
    openFallback: "Ouverture secours",
    linkPathNotReady: "Chemin de link non prêt",
    commandRouteNotMapped: "Cette route de commande n'est pas encore reliée à une destination.",
    openFallbackPartnerRoute: "Ouvrir route secours",
    publicLockUnavailable: "Verrou public indisponible",
    noVaultLinks: "Aucun lien de vault.",
    linkVaultLabel: "Vault partageable",
    selectedLinksDescription: "Pour partager les liens sélectionnés avec quelqu'un.",
    selectedLinksSubtext: "Choisissez quoi partager ou masquer. Le vault public n'inclut que des URL stables sélectionnées, jamais d'invites brutes.",
    selectedLinksPrompt: "Demandez à l'admin de créer un nouveau lien partagé depuis",
    myFenrirLinkVault: "Tiroir de liens Frisky Dev",
    selectedShareHeading: "Liens sélectionnés, une seule page.",
    selectedShareCopy: "Cette page sert à partager seulement les liens choisis par l'admin. Ouvrez les URLs publiques pour Telegram, portes de salle, paiements, docs, réservations et support. Les cibles privées restent derrière Fenrir.",
    shareableVault: "Vault partageable",
    forSharingSelectedLinks: "Pour partager vos liens sélectionnés.",
    publicVaultIncludes: "Choisissez de partager ou masquer. Le vault public inclut uniquement des URLs stables sélectionnées, jamais d'invitations brutes ou cibles de salle privées.",
    myFenrirLabel: "Fenrir Bridge",
    share: "Partager",
    hidden: "Masqué",
    personalLinkHelp: "Ajoutez une URL publique stable à ce vault. Fenrir garde le libellé, l'URL et la catégorie pour que la boîte reste lisible avant partage.",
    personalLinkTitleLabel: "Libellé du lien",
    personalLinkTitlePlaceholder: "Checkout Mercado Pago",
    personalLinkUrlLabel: "URL stable",
    personalLinkUrlPlaceholder: "https://pay.example.com/fenrir",
    personalLinkKindLabel: "Type de lien",
    clientExplanation: "Explication client",
    setupGoalHelp: "Dites à Fenrir votre objectif de lancement. Il ouvre le bon setup en sequence.",
    onePathAtATime: "Un seul chemin à la fois: lock, route, partage, puis lancement.",
    assistantPrompt: "Je peux ouvrir le bon panneau pour vous. Choisissez un resultat de lancement.",
    ready: "Pret",
    readiness: "Pret",
    routeLaunch: "Transformer une invitation privée en lien public brandé.",
    linkConversion: "Conversion de liens",
    turnPrivateInvite: "Transformer invitation privee",
    pastePrivateLink: "Collez un lien Telegram, Zoom, Webex, Whereby ou Meet. Fenrir garde la cible privée et donne une URL de domaine stable.",
    fenrirSubdomain: "Sous-domaine Fenrir",
    customerDomain: "Domaine client",
    privateTarget: "Cible privée",
    publicShareLink: "Lien public de partage",
    privateTargetHidden: "Cible privée cachée",
    publicShareLinkReady: "Disponible après création",
    rawLinkHidden: "Lien brut caché",
    cloudflareSsl: "SSL Cloudflare",
    publicUrlReady: "URL publique prête",
    routeToPrivateDestination: "Fenrir route du lien public vers destination privée",
    protectedLink: "Lien protégé",
    stableUrl: "URL stable Fenrir",
    privateDestination: "Destination privée",
    challengeLayer: "Couche de challenge",
    riskBasedPromptReady: "Déclencheur par risque prêt",
    challengeDescription: "Des pics inhabituels peuvent passer par Turnstile ou un contrôle similaire avant la redirection.",
    captchaLayer: "Couche captcha",
    idleNormalPattern: "Idle: pattern normal",
    vaultLinkOpenLabelPrefix: "Ouvrir",
    liveRoomSecondaryLabel: "Lien secondaire",
    liveRoomChallengeReady: "Challenge prêt",
    createPaidRoomTitle: "Protéger un groupe Telegram",
    createPaidRoomBody: "Ajoutez l'ID groupe et l'image, puis publiez un lien bloqué stable.",
    createPaidRoomNeed: "Nécessaire: accès groupe",
    roomCoverImageInvalid: "L'URL du logo ou de l'image de salle est invalide.",
    setupInputTelegramSlug: "principal",
    setupInputTelegramId: "ID du groupe Telegram",
    setupInputGroupName: "Nom du groupe",
    setupInputGroupPhoto: "Image du groupe Telegram",
    setupInputDomain: "vip.myfenrir.com",
    setupInputRoomSlug: "acces-salle",
    setupInputRoomTitle: "Nom de salle / client",
    setupInputRoomTarget: "URL d'appel privée",
    setupInputRoomCover: "Logo Pro / URL image de marque",
    setupInputGroupEmail: "vous@communaute.com",
    setupInputCommunityEmail: "vous@communaute.com",
    setupInputCustomDomain: "client.myfenrir.com",
    setupInputLiveRoom: "Titre de salle",
    liveRoomUrlHint: "URL d'appel privée",
    resolvingLockState: "Résolution du verrou Fenrir",
    checkingRoute: "Vérification de la route",
    resolvingBridgeState: "Fenrir vérifie l'état live du pont D1.",
    roomWaitingBody: "Cette salle de réunion est manquante ou en pause. Demandez un nouveau lien de salle à l'admin.",
    roomBrandIntro: "Fenrir affiche d'abord la porte de marque. Si le trafic est inhabituel, cette page peut demander un challenge rapide avant d'ouvrir la salle privée.",
    roomSecondaryLabel: "Lien protégé secondaire",
    roomChallengeDescription: "Des pics inhabituels peuvent passer par Turnstile ou un contrôle similaire avant la redirection.",
    fenrirRoomGate: "Passerelle de salle Fenrir",
    protectedRedirectPending: "Redirection protégée en ligne",
    roomStableUrlLabel: "URL stable Fenrir",
    roomPrivateDestinationLabel: "Destination privée",
    walkthroughNodeMapLabel: "route animée",
    walkthroughModeLabel: "Modes de démonstration",
    walkthroughPillsText: "Route Fenrir du lien public vers la destination privée",
    walkthroughLabel: "Parcours Fenrir client",
    walkthroughClientLabel: "Vue client",
    walkthroughAdminLabel: "Vue admin",
    walkthroughLaunchLabel: "Parcours de lancement",
    walkthroughClientTitle: "Un lien propre remplace des invitations privées brouillonnes.",
    walkthroughClientBody: "Le client voit une page Fenrir brandée, pas une URL Telegram, Zoom ou paiement brute. La destination privée reste cachée jusqu'à l'autorisation d'accès.",
    walkthroughClientQuote: "Envoie ce lien. Fenrir gère la porte.",
    walkthroughAdminTitle: "Le propriétaire garde le contrôle même quand le lien est déjà public.",
    walkthroughAdminBody: "Si une invitation fuit ou qu'une salle change, l'admin fait tourner la cible cachée. Flyer, bio link, QR et message client conservent la même URL publique.",
    walkthroughAdminQuote: "Change la salle arrière. Garde la porte avant.",
    walkthroughLaunchTitle: "Le parcours client reste simple du clic à l'entrée.",
    walkthroughLaunchBody: "Fenrir explique ce qui se passe, confirme la bonne porte et envoie le visiteur approuvé vers la bonne salle ou le bon groupe privé.",
    walkthroughLaunchQuote: "Clique, vérifie, entre. Sans piste de lien exposée.",
    walkthroughStepsClient: ["Lien public", "Porte brandée", "Contrôle d'accès", "Destination privée"],
    walkthroughStepsAdmin: ["URL stable", "Tourner la cible", "Révoquer la fuite", "Action d'audit"],
    walkthroughStepsLaunch: ["Client clique", "Fenrir explique", "Déblocage d'accès", "Entrée ouverte"],
    communityEmailPlaceholder: "vous@communaute.com",
    neonMagicBusy: "Création du lien Neon...",
    neonMagicButton: "Envoyer le lien magique Neon",
    neonMagicSuccessMessage: "Lien d'authentification Neon envoyé. Vérifiez votre e-mail et suivez l'étape d'approbation.",
    neonMagicDevLinkLabel: "Ouvrir le lien développeur Neon",
    fallbackPartnerLabel: "Liens de secours"
  },
  de: {
    friskyAccount: "Frisky Konto",
    secondaryGate: "Sekundaere Tor",
    routePrivateViaFenrir: "Routen Sie Zoom, Meet, Webex oder jede Room erst über Fenrir.",
    proCustomization: "Pro Anpassung",
    proCustomizationBodyTitle: "Ab Pro koennen Kunden eigenes Logo und gebrandete Raumvisuals nutzen.",
    proCustomizationBody: "Starter enthaelt den clean Fenrir Raum-Gate. Pro und Operator aktivieren Kundenlogo, benutzerdefinierten Raumnamenstil und Hero-Bild auf dem Sekundaerlink.",
    telegramStatusCheck: "Telegram-Status",
    linked: "verknuepft",
    loginRequired: "anmeldung erforderlich",
    telegramConnected: (username, id) => `${username ? `@${username}` : id} ist mit dieser Frisky ID verknuepft.`,
    telegramSessionFoundNoLink: "Frisky-Session gefunden. Telegram ID ist noch nicht verknuepft, daher kann Fenrir Telegram Stars oder Zugangsstatus fuer diesen Account nicht pruefen.",
    telegramSignInFirst: "Bitte zuerst mit dem einheitlichen Frisky Login anmelden, damit Fenrir pruefen kann, ob diese Telegram ID aktiven Zugriff hat.",
    linkTelegramId: "Telegram ID verknuepfen",
    telegramVerifyWhenNeeded: "Telegram wird nur geprueft, wenn eine Telegram-Aktion es braucht.",
    telegramReaddButton: "Neu einladen",
    telegramReaddNeedChat: "Gib zuerst die Telegram Gruppen-ID ein.",
    telegramReaddReady: "Recovery-Einladung bereit. Fenrir hat einen einmaligen Telegram-Link geoeffnet.",
    telegramReaddUnavailable: "Recovery-Einladung konnte nicht erstellt werden. Bot-Adminrechte pruefen.",
    devRequestViaSignal: "Support-Anfrage via Frisky Signal",
    devRequestViaSignalShort: "Frisky Signal",
    setupRoute: "Setup-Route",
    openingLaunchRoute: "Launch-Route wird geoeffnet",
    setupPathReady: "Dieser Setup-Pfad ist bereit. Fenrir öffnet ihn automatisch; falls blockiert, nutze den Knopf.",
    openNow: "Jetzt öffnen",
    openFallback: "Fallback öffnen",
    linkPathNotReady: "Link-Pfad nicht bereit",
    commandRouteNotMapped: "Dieser Kommandopfad ist noch keiner Destination zugeordnet.",
    openFallbackPartnerRoute: "Fallback Partner-Route öffnen",
    publicLockUnavailable: "Oeffentlicher Lock nicht verfügbar",
    noVaultLinks: "Keine Vault Links gefunden.",
    linkVaultLabel: "Teilbares Vault",
    selectedLinksDescription: "Zum Teilen der ausgewählten Links.",
    selectedLinksSubtext: "Wählen Sie aus, was freigegeben oder verborgen bleibt. Der öffentliche Vault enthält nur stabile URLs, nie Roh-Einladungen.",
    selectedLinksPrompt: "Bitte den Admin, einen neuen Freigabe-Link von",
    myFenrirLinkVault: "Frisky Dev Link Vault",
    selectedShareHeading: "Ausgewaehlte Links, eine Seite.",
    selectedShareCopy: "Diese Seite dient nur dem Teilen der vom Admin ausgewählten Links. Öffnen Sie offizielle öffentliche URLs für Telegram-Locks, Rooms, Zahlungen, Docs, Buchungen und Support. Private Ziele bleiben hinter Fenrir.",
    shareableVault: "Teilbarer Vault",
    forSharingSelectedLinks: "Zum Teilen der ausgewählten Links.",
    publicVaultIncludes: "Wähle was geteilt oder verborgen wird. Der öffentliche Vault enthält nur ausgewählte stabile URLs, nie rohe Einladungen oder private Raumziele.",
    myFenrirLabel: "Fenrir Bridge",
    share: "Teilen",
    hidden: "Ausgeblendet",
    personalLinkHelp: "Fuege eine stabile oeffentliche URL zu diesem Vault hinzu. Fenrir speichert Label, URL und Kategorie, damit die Box vor dem Teilen lesbar bleibt.",
    personalLinkTitleLabel: "Link-Label",
    personalLinkTitlePlaceholder: "Mercado Pago Checkout",
    personalLinkUrlLabel: "Stabile URL",
    personalLinkUrlPlaceholder: "https://pay.example.com/fenrir",
    personalLinkKindLabel: "Link-Typ",
    clientExplanation: "Kunden-Erklaerung",
    setupGoalHelp: "Teilen Sie Fenrir Ihr Launch-Ziel mit. Es öffnet den richtigen Setup-Pfad in Reihenfolge.",
    onePathAtATime: "Schritt für Schritt vorgehen: lock, route, share, dann launch.",
    assistantPrompt: "Ich kann das richtige Panel fuer dich oeffnen. Wähle ein Launch-Ergebnis.",
    ready: "Bereit",
    readiness: "Bereit",
    routeLaunch: "Mache einen privaten Invite zu einem gebrandeten öffentlichen Link.",
    linkConversion: "Link-Konvertierung",
    turnPrivateInvite: "Privaten Invite umwandeln",
    pastePrivateLink: "Füge einen Telegram, Zoom, Webex, Whereby oder Meet Link ein. Fenrir hält das Ziel privat und gibt eine stabile Domain-URL.",
    fenrirSubdomain: "Fenrir Subdomain",
    customerDomain: "Kunden-Domain",
    privateTarget: "Privates Ziel",
    publicShareLink: "Öffentlicher Share Link",
    privateTargetHidden: "Privates Ziel verborgen",
    publicShareLinkReady: "Nach Erstellung bereit",
    rawLinkHidden: "Roher Link verborgen",
    cloudflareSsl: "Cloudflare SSL",
    publicUrlReady: "Öffentliche URL bereit",
    routeToPrivateDestination: "Fenrir Route vom öffentlichen Link zum privaten Ziel",
    protectedLink: "Sekundaerer geschützter Link",
    stableUrl: "Stabile Fenrir URL",
    privateDestination: "Privates Ziel",
    challengeLayer: "Challenge Layer",
    riskBasedPromptReady: "Risiko-basierter Prompt bereit",
    challengeDescription: "Ungewoehnliche Lasten koennen vor dem Redirect ueber Turnstile oder aehnlichen Check laufen.",
    captchaLayer: "Captcha Layer",
    idleNormalPattern: "Idle: normales Muster",
    vaultLinkOpenLabelPrefix: "Öffnen",
    liveRoomSecondaryLabel: "Sekundaerer Link",
    liveRoomChallengeReady: "Challenge-ready",
    createPaidRoomTitle: "Telegram Gruppe schützen",
    createPaidRoomBody: "Füge Gruppen-ID und Bild hinzu, danach publiziere einen stabilen, gesperrten Link.",
    createPaidRoomNeed: "Erforderlich: Gruppen-Zugriff",
    roomCoverImageInvalid: "Raumbild-/Logo-URL ist ungültig.",
    setupInputTelegramSlug: "haupt",
    setupInputTelegramId: "Telegram Gruppen-ID",
    setupInputGroupName: "Gruppenname",
    setupInputGroupPhoto: "Foto aus Telegram Gruppe",
    setupInputDomain: "vip.myfenrir.com",
    setupInputRoomSlug: "raum-zugang",
    setupInputRoomTitle: "Raumname / Kunde",
    setupInputRoomTarget: "Private Call URL",
    setupInputRoomCover: "Pro Logo / Marken-Bild URL",
    setupInputGroupEmail: "du@gemeinschaft.com",
    setupInputCommunityEmail: "du@gemeinschaft.com",
    setupInputCustomDomain: "kunde.myfenrir.com",
    setupInputLiveRoom: "Raumtitel",
    liveRoomUrlHint: "Private Call URL",
    resolvingLockState: "Fenrir-Schloss wird aufgelöst",
    checkingRoute: "Route wird geprüft",
    resolvingBridgeState: "Fenrir prüft den D1-Bridge-Status in Echtzeit.",
    roomWaitingBody: "Dieser Sprachraum fehlt oder ist pausiert. Bitte den Admin um einen neuen Raumlink.",
    roomBrandIntro: "Fenrir zeigt zuerst die gebrandete Tür. Bei ungewöhnlichem Traffic kann diese Seite vor dem Öffnen des privaten Raums eine kurze Challenge auslösen.",
    roomSecondaryLabel: "Sekundaerer geschützter Link",
    roomChallengeDescription: "Ungewoehnliche Lasten können vor der Weiterleitung über Turnstile oder einen ähnlichen Check laufen.",
    fenrirRoomGate: "Fenrir-Raumtor",
    protectedRedirectPending: "Geschuetzte Weiterleitung wird aktiviert",
    roomStableUrlLabel: "Stabile Fenrir URL",
    roomPrivateDestinationLabel: "Privates Ziel",
    walkthroughNodeMapLabel: "animierte Route",
    walkthroughModeLabel: "Walkthrough-Modi",
    walkthroughPillsText: "Fenrir-Route vom öffentlichen Link zum privaten Ziel",
    walkthroughLabel: "Kundenorientierter Fenrir Walkthrough",
    walkthroughClientLabel: "Kundenansicht",
    walkthroughAdminLabel: "Admin-Ansicht",
    walkthroughLaunchLabel: "Launch-Walkthrough",
    walkthroughClientTitle: "Ein sauberer Link ersetzt chaotische private Einladungen.",
    walkthroughClientBody: "Der Kunde sieht eine gebrandete Fenrir-Seite, keine rohe Telegram-, Zoom- oder Zahlungs-URL. Das private Ziel bleibt verborgen, bis der Zugriff freigeschaltet ist.",
    walkthroughClientQuote: "Teile diesen Link. Fenrir regelt die Tür.",
    walkthroughAdminTitle: "Der Owner behält die Kontrolle, auch wenn der Link bereits öffentlich ist.",
    walkthroughAdminBody: "Wenn eine Einladung leakt oder eine Raum-Änderung passiert, rotiert der Admin das versteckte Ziel. Flyer, Bio-Link, QR und Kundennachricht behalten die gleiche öffentliche URL.",
    walkthroughAdminQuote: "Hinteren Raum wechseln. Vordere Tür offenhalten.",
    walkthroughLaunchTitle: "Die Customer Journey bleibt vom Klick bis zum Einstieg einfach.",
    walkthroughLaunchBody: "Fenrir erklärt verständlich, welche Schritte passieren, bestätigt die richtige Gate-Ebene und sendet den freigegebenen Besucher in den richtigen privaten Raum oder die Gruppe.",
    walkthroughLaunchQuote: "Klick, prüfen, eintreten. Keine sichtbaren Linkspuren.",
    walkthroughStepsClient: ["Öffentlicher Link", "Gebānderte Tür", "Zugriffsprüfung", "Privates Ziel"],
    walkthroughStepsAdmin: ["Stabile URL", "Ziel rotieren", "Leckung widerrufen", "Audit-Aktion"],
    walkthroughStepsLaunch: ["Kunde klickt", "Fenrir erklärt", "Zugriff entsperrt", "Einstieg öffnet"],
    communityEmailPlaceholder: "du@gemeinschaft.com",
    neonMagicBusy: "Neon-Link wird erstellt...",
    neonMagicButton: "Neon-Magic-Link senden",
    neonMagicSuccessMessage: "Neon-Auth-Link gesendet. E-Mail prüfen und dem letzten Freigabeschritt folgen.",
    neonMagicDevLinkLabel: "Neon-Entwicklerlink öffnen",
    fallbackPartnerLabel: "Fallback-Links"
  }
};

const confettiPieces = Array.from({ length: 28 }, (_, index) => index);
const pageKeys = ["command", "links", "domains", "dns", "locks", "rooms", "telegram", "revocations", "audit", "faq", "billing", "brands"] as const;
const legalRoutes = new Set(["/legal", "/terms", "/privacy", "/acceptable-use"]);
const friskySignalDevRequestUrl = "https://t.me/friskysignal";
const liveRoomProviders: Array<{ id: LiveRoomProvider; name: string; icon: string; brand: string; hint: string; placeholder: string }> = [
  {
    id: "zoom",
    name: "Zoom",
    icon: "Z",
    brand: "Zoom",
    hint: "Zoom Rooms, webinars, client calls",
    placeholder: "https://zoom.us/j/..."
  },
  {
    id: "google_meet",
    name: "Google Meet",
    icon: "M",
    brand: "Google",
    hint: "Google Workspace calls and classes",
    placeholder: "https://meet.google.com/..."
  },
  {
    id: "whereby",
    name: "Whereby",
    icon: "W",
    brand: "Whereby",
    hint: "Simple browser rooms for customers",
    placeholder: "https://whereby.com/..."
  },
  {
    id: "webex",
    name: "Microsoft Teams",
    icon: "T",
    brand: "Teams",
    hint: "Teams calls, cohorts, and community events",
    placeholder: "https://teams.microsoft.com/l/meetup-join/..."
  },
  {
    id: "other",
    name: "Other room",
    icon: "+",
    brand: "Custom",
    hint: "Teams, Calendly, custom portals, etc.",
    placeholder: "https://your-room-link.example/..."
  }
];

const domainTagPresets = ["launch", "client", "vip", "community", "paid", "internal"] as const;

const providerLogoPresets: Record<LiveRoomProvider, string> = {
  zoom: "/provider-logos/zoom.svg",
  google_meet: "/provider-logos/google_meet.svg",
  whereby: "/provider-logos/whereby.svg",
  webex: "/provider-logos/webex.svg",
  other: "/fenrir-splash-icon.svg"
};

const twoFactorHelpLinks = {
  google: "https://myaccount.google.com/signinoptions/two-step-verification",
  microsoft: "https://account.microsoft.com/security",
  apple: "https://support.apple.com/102661"
} as const;

function safeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function openSafeUrl(value: string) {
  return openAnyUrl(value);
}

function openAnyUrl(value: string) {
  const target = absoluteUrl(value);
  if (!target) return false;
  window.open(target, "_blank", "noopener,noreferrer");
  return true;
}

function absoluteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    return new URL(trimmed, window.location.origin).toString();
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return safeHttpUrl(trimmed);
  }
  if (/^\S+\.\S+/.test(trimmed)) {
    return safeHttpUrl(`https://${trimmed}`);
  }
  try {
    const url = new URL(trimmed, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function commissionUrlSlug(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const path = new URL(trimmed, window.location.origin).pathname;
    return path.replace(/^\/+|\/+$/g, "").split("/").pop() ?? "";
  } catch {
    return "";
  }
}

function findCommissionLink(links: FriskyCommissionLink[] = [], slug: string) {
  const target = slug.trim().toLowerCase();
  return links.find((link) => {
    if (link.id.toLowerCase() === target) return true;
    if (commissionUrlSlug(link.url).toLowerCase() === target) return true;
    return false;
  }) ?? null;
}

function commissionFallbackBySlug(slug: string) {
  const target = slug.trim().toLowerCase();
  if (!target) return "";
  const map: Record<string, string> = {
    dynadot: "https://www.dynadot.com/",
    "dynadot-auctions": "https://www.dynadot.com/domains/auctions/",
    "cj-dynadot": "https://www.dynadot.com/register/domains/search",
    cloudflare: "https://www.cloudflare.com/",
    porkbun: "https://porkbun.com/",
    namecheap: "https://www.namecheap.com/"
  };
  return map[target] ?? "";
}

function resolveCommissionDestination(link: FriskyCommissionLink | null, slug: string) {
  if (link) {
    const direct = absoluteUrl(link.url);
    if (direct) return direct;
    const linkSlug = commissionUrlSlug(link.url);
    const fallbackFromLink = commissionFallbackBySlug(linkSlug);
    if (fallbackFromLink) return fallbackFromLink;
  }
  return commissionFallbackBySlug(slug);
}

function trustedFenrirImageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("/api/media/proxy?")) return trimmed;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/media/proxy")) {
      return `${url.pathname}${url.search}`;
    }
    if (url.protocol === "https:") return url.toString();
  } catch {
    return "";
  }
  return "";
}

function parseDomainTags(value: string) {
  const tags = value
    .split(/[,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 8);
  return tags.length ? tags : ["launch"];
}

function addDomainTag(value: string, tag: string) {
  return parseDomainTags(`${value}, ${tag}`).join(", ");
}

function defaultDomainTags(domain: FriskyDomain) {
  const tags: string[] = [domain.status, domain.dnsProvider];
  if (domain.certificateStatus === "active") tags.push("ssl");
  if (domain.domain.includes("myfenrir")) tags.push("primary");
  return tags;
}

const domainVerdictLabels: Record<DomainVerdict, string> = {
  available_clean: "Free & clean",
  available_dirty: "Free, has residue",
  registered_dropping: "Dropping soon",
  registered_parked: "Registered (parked)",
  registered_live: "Taken",
  likely_available: "Likely free",
  likely_registered: "Likely taken",
  unknown: "Inconclusive",
  invalid: "Invalid"
};

const domainVerdictTones: Record<DomainVerdict, string> = {
  available_clean: "good",
  available_dirty: "amber",
  registered_dropping: "amber",
  registered_parked: "amber",
  registered_live: "danger",
  likely_available: "good",
  likely_registered: "danger",
  unknown: "amber",
  invalid: "danger"
};

const domainFlagLabels: Record<string, string> = {
  "mail-history": "had email (MX)",
  "verification-txt-leftovers": "old verification TXT",
  "resolves-to-host": "resolves to a host",
  "rdap-dns-conflict": "registry and DNS disagree",
  "registration-dropping": "in redemption/pending delete",
  "no-rdap-service": "no RDAP for this TLD",
  "rdap-unreachable": "registry did not answer",
  "dns-unreachable": "resolvers did not answer"
};

/** One-line evidence trail so a verdict is never just a coloured badge. */
function domainEvidence(result: DomainSearchResult) {
  const parts: string[] = [];
  if (result.dns.nxdomain) parts.push("NXDOMAIN on both resolvers");
  if (result.dns.ns.length) parts.push(`NS ${result.dns.ns.slice(0, 2).join(", ")}`);
  if (result.dns.a.length || result.dns.aaaa.length) {
    parts.push(`A/AAAA ${result.dns.a.concat(result.dns.aaaa).slice(0, 2).join(", ")}`);
  }
  if (result.dns.mx.length) parts.push(`${result.dns.mx.length} MX`);
  if (result.registration.registrar) parts.push(`registrar ${result.registration.registrar}`);
  if (result.registration.expiresAt) parts.push(`expires ${result.registration.expiresAt.slice(0, 10)}`);
  return parts.join(" · ");
}

type Celebration = {
  id: number;
  title: string;
  detail: string;
  tone: "dns" | "commerce";
};

type PageKey = (typeof pageKeys)[number];
type PersonalLink = {
  id: string;
  title: string;
  url: string;
  kind: "payment" | "docs" | "booking" | "support" | "other";
  status: "active" | "draft";
};
type VaultLink = {
  id: string;
  title: string;
  url: string;
  kind: string;
  status: string;
};
type FenrirRole = "owner" | "admin" | "user";

const dashboardPageAliases: Record<string, PageKey> = {
  main: "command",
  command: "command",
  links: "links",
  "all-links": "links",
  vaults: "links",
  domains: "domains",
  dns: "dns",
  "dns-wizard": "dns",
  locks: "locks",
  "telegram-locks": "locks",
  rooms: "rooms",
  "live-rooms": "rooms",
  telegram: "telegram",
  revocations: "revocations",
  audit: "audit",
  faq: "faq",
  faqs: "faq",
  billing: "billing",
  brands: "brands",
  "community-brands": "brands",
  "neon-nexus": "brands"
};

function isAuthCallbackPath(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalizedPath === "/auth/callback" || 
         normalizedPath === "/auth/v1/callback" || 
         normalizedPath === "/login" ||
         normalizedPath === (import.meta.env.VITE_AUTH_REDIRECT_PATH || "/auth/callback");
}

function activePageFromLocation(path: string, hash: string): PageKey {
  const routeKey = path.replace(/^\/+|\/+$/g, "");
  const hashKey = hash.replace(/^#\/?/, "").replace(/^\/+|\/+$/g, "");
  const key = routeKey || hashKey;
  if (path.startsWith("/admin")) return "locks";
  if (path.startsWith("/portal")) return "links";
  if (isAuthCallbackPath(path)) return "command";
  return dashboardPageAliases[key] ?? "command";
}

function dashboardPathFor(page: PageKey) {
  return page === "command" ? managedDashboardPath : `/${page}`;
}

function isKnownDashboardPath(path: string) {
  const routeKey = path.replace(/^\/+|\/+$/g, "");
  return Boolean(
    dashboardPageAliases[routeKey] ||
    path.startsWith("/admin") ||
    path.startsWith("/portal") ||
    isAuthCallbackPath(path)
  );
}

function paidPlanFromProductLabel(label: string): PaidPlan | null {
  const p = label.trim().toLowerCase();
  if (p === "starter") return "starter";
  if (p === "pro") return "pro";
  if (p === "operator") return "operator";
  return null;
}

export function App() {
  const path = window.location.pathname;
  const host = window.location.hostname.toLowerCase();
  const joinMatch = path.match(/^\/join\/([^/]+)/);
  const roomMatch = path.match(/^\/room\/([^/]+)/);
  const vaultMatch = path.match(/^\/vault\/?$/);
  const communityGateMatch = path.match(/^\/(?:community|gate)(?:\/group)?\/([^/]+)/);
  const legalMatch = legalRoutes.has(path);
  const [state, setState] = useState<AppState | null>(null);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [active, setActive] = useState<PageKey>(() => activePageFromLocation(path, window.location.hash));
  const [domainInput, setDomainInput] = useState("");
  const [domainTagsInput, setDomainTagsInput] = useState("launch, paid");
  const [domainTagsById, setDomainTagsById] = useState<Record<string, string[]>>({});
  const [domainSearchInput, setDomainSearchInput] = useState("fenrir");
  const [domainSearchResults, setDomainSearchResults] = useState<DomainSearchResult[]>([]);
  const [domainSearchBusy, setDomainSearchBusy] = useState(false);
  const [domainSearchMode, setDomainSearchMode] = useState<"front-door" | "exact">("front-door");
  const [domainSearchMeta, setDomainSearchMeta] = useState<{ checkedAt: string; viaFallback: boolean } | null>(null);
  const [wizardQueue, setWizardQueue] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupImageInput, setGroupImageInput] = useState("");
  const [roomTitleInput, setRoomTitleInput] = useState("");
  const [roomSlugInput, setRoomSlugInput] = useState("");
  const [roomProviderInput, setRoomProviderInput] = useState<LiveRoomProvider>("zoom");
  const [roomTargetInput, setRoomTargetInput] = useState("");
  const [roomCoverInput, setRoomCoverInput] = useState("");
  const [serviceEmail, setServiceEmail] = useState("");
  const [serviceOrg, setServiceOrg] = useState(defaultServiceOrg);
  const [serviceTelegram, setServiceTelegram] = useState("");
  const [serviceSubdomain, setServiceSubdomain] = useState(defaultServiceSubdomain);
  const [serviceMode, setServiceMode] = useState<"create" | "link" | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan>("starter");
  const [courtesyCode, setCourtesyCode] = useState("");
  const [personalLinks, setPersonalLinks] = useState<PersonalLink[]>([]);
  const [personalTitle, setPersonalTitle] = useState("");
  const [personalUrl, setPersonalUrl] = useState("");
  const [personalKind, setPersonalKind] = useState<PersonalLink["kind"]>("payment");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const c = copy[locale];
  const ui = uiCopy[locale];
  const [notice, setNotice] = useState<string>(c.initialNotice);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatusPayload | null>(null);
  const [telegramIdentity, setTelegramIdentity] = useState<TelegramIdentityLinkPayload | null>(null);
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [readinessError, setReadinessError] = useState(false);
  const [activationVisible, setActivationVisible] = useState(true);
  const [fenrirRole, setFenrirRole] = useState<FenrirRole | null>(null);

  function triggerCelebration(title: string, detail: string, tone: Celebration["tone"]) {
    const id = Date.now();
    setCelebration({ id, title, detail, tone });
    window.setTimeout(() => {
      setCelebration((current) => current?.id === id ? null : current);
    }, 2800);
  }

  async function refreshBilling() {
    try {
      const status = await billingService.getStatus();
      setBillingStatus(status);
    } catch {
      setBillingStatus(null);
    }
  }

  async function refreshTelegramIdentity() {
    try {
      const status = await telegramIdentityService.status();
      setTelegramIdentity(status);
    } catch {
      setTelegramIdentity(null);
    }
  }

  async function refresh() {
    try {
      const result = await appService.load();
      setState(result.data);
      setSelectedDomain((current) => current || result.data.domains[0]?.id || "");
      if (auth?.authenticated) {
        await refreshBilling();
        await refreshTelegramIdentity();
      }
    } catch {
      setState(null);
    }
  }

  async function refreshAuth() {
    const result = await authService.me();
    setAuth(result.data);
    if (result.data.authenticated && (isAuthCallbackPath(window.location.pathname) || window.location.hash.includes("access_token="))) {
      window.history.replaceState({}, "", managedDashboardPath);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refreshAuth();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const staleAuthError = params.get("auth_error");
    if (!staleAuthError) return;
    if (staleAuthError.startsWith("missing_env:") || staleAuthError === "direct_oauth_disabled") {
      params.delete("auth_error");
      const nextSearch = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    if (auth?.authenticated) void refresh();
  }, [auth?.authenticated]);

  useEffect(() => {
    const onPopState = () => setActive(activePageFromLocation(window.location.pathname, window.location.hash));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!auth?.authenticated || !auth.user || !auth.org) return;
    setState((current) => current ? overlayAuthState(current, auth) : current);
  }, [auth]);

  useEffect(() => {
    if (!auth?.authenticated) {
      setBillingStatus(null);
      setTelegramIdentity(null);
      return;
    }
    void refreshBilling();
    void refreshTelegramIdentity();
  }, [auth?.authenticated]);

  useEffect(() => {
    if (!auth?.authenticated) {
      setReadiness(null);
      setReadinessError(false);
      return;
    }
    let cancelled = false;
    setReadinessError(false);
    void (async () => {
      const data = await readinessService.get();
      if (cancelled) return;
      if (data) {
        setReadiness(data);
        setReadinessError(false);
      } else {
        setReadiness(null);
        setReadinessError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth?.authenticated]);

  useEffect(() => {
    if (!auth?.authenticated) return;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (!billing) return;
    if (billing === "success") setNotice(copy[locale].billingReturnSuccess);
    if (billing === "cancel") setNotice(copy[locale].billingReturnCancel);
    if (billing === "portal_return") setNotice(copy[locale].billingReturnPortal);
    void refresh();
    window.history.replaceState({}, "", window.location.pathname);
  }, [auth?.authenticated, locale]);

  useEffect(() => {
    if (!state || !activationVisible) return undefined;
    const timer = window.setTimeout(() => setActivationVisible(false), 2100);
    return () => window.clearTimeout(timer);
  }, [state, activationVisible]);

  const selectedDomainRecord = useMemo(() => {
    if (!state) return null;
    return state.domains.find((domain) => domain.id === selectedDomain) ?? state.domains[0];
  }, [state, selectedDomain]);
  const selectedDomainTags = selectedDomainRecord ? domainTagsById[selectedDomainRecord.id] ?? defaultDomainTags(selectedDomainRecord) : [];

  if (legalMatch) {
    return <LegalPage c={c} locale={locale} onLocale={(next) => setLocale(next)} />;
  }

  if (vaultMatch) {
    return <PublicVaultPage links={decodeVaultLinks()} c={c} ui={ui} />;
  }

  if (communityGateMatch) {
    const slug = decodeURIComponent(communityGateMatch[1]);
    return <CommunityNeonGateRoute slug={slug} locale={locale} onLocale={(next) => setLocale(next)} c={c} ui={ui} />;
  }

  const goMatch = window.location.pathname.match(/^\/go\/([^/]+)/);
  if (goMatch) {
    const slug = decodeURIComponent(goMatch[1]);
    const link = state ? findCommissionLink(state.commissionLinks, slug) : null;
    return <GoRoutePage c={c} ui={ui} slug={slug} link={link} onTrack={() => {
      if (state) {
        const clicked = commerceService.click(link?.id ?? slug);
        if (clicked) {
          setNotice(`Tracked setup click: ${clicked.label}.`);
          triggerCelebration("Tracked click", `Link path ready for ${clicked.label}.`, "commerce");
          void refresh();
        }
      }
    }} />;
  }

  if (joinMatch) {
    const slug = decodeURIComponent(joinMatch[1]);
    return <PublicBridgeRoute slug={slug} c={c} ui={ui} />;
  }

  if (roomMatch) {
    const slug = decodeURIComponent(roomMatch[1]);
    return <PublicRoomRoute slug={slug} c={c} ui={ui} />;
  }

  if (path === "/") {
    return <CinematicLanding />;
  }

  if (!isKnownDashboardPath(path)) {
    return <NotFoundRoute />;
  }

  if (!auth) {
    return <div className="boot">{c.boot}</div>;
  }

  if (!auth.authenticated) {
    return <AuthGate c={c} locale={locale} onLocale={(next) => {
      setLocale(next);
      setNotice(copy[next].initialNotice);
    }} />;
  }

  if (!state) {
    return <div className="boot">{c.boot}</div>;
  }

  async function addNewDomain() {
    if (!domainInput.trim()) return;
    const tags = parseDomainTags(domainTagsInput);
    const result = await domainService.create(domainInput.trim());
    if (result.ok) {
      setDomainTagsById((current) => ({ ...current, [result.data.id]: tags }));
      setNotice(`Telegram Lock domain ${result.data.domain} added with tags: ${tags.join(", ")}.`);
      setDomainInput("");
      await refresh();
    }
  }

  async function runDomainSearch(seed = domainSearchInput, mode = domainSearchMode) {
    if (!cleanDomainSearchBase(seed)) {
      setNotice("Enter a domain or brand name before searching.");
      return;
    }
    setDomainSearchBusy(true);
    setDomainSearchResults([]);
    setDomainSearchMeta(null);
    const response = await domainService.search({ seed, mode, limit: mode === "front-door" ? 18 : 12 });
    setDomainSearchBusy(false);

    if (!response.ok) {
      setNotice(response.error?.message ?? "Live domain search failed.");
      return;
    }

    setDomainSearchResults(response.results);
    setDomainSearchMeta({ checkedAt: response.checkedAt, viaFallback: Boolean(response.viaBrowserFallback) });
    const clean = response.promising.length;
    setNotice(
      `Checked ${response.checked} name${response.checked === 1 ? "" : "s"} against public DNS and RDAP — ` +
        `${clean} clean front door${clean === 1 ? "" : "s"} found.`
    );
  }

  /** Step 2 of the flow: hand a name to the domain wizard so it can be registered and wired. */
  function sendToWizard(domain: string) {
    setDomainInput(domain);
    setDomainTagsInput(addDomainTag(domainTagsInput, "launch"));
    setWizardQueue((current) => (current.includes(domain) ? current : [...current, domain]));
    setNotice(`${domain} moved into the Fenrir domain wizard.`);
  }

  function sendPromisingToWizard() {
    const clean = domainSearchResults.filter((result) => result.promising).map((result) => result.domain);
    if (!clean.length) {
      setNotice("No clean candidates in the current results.");
      return;
    }
    setWizardQueue((current) => Array.from(new Set([...current, ...clean])));
    setDomainInput(clean[0]);
    setDomainTagsInput(addDomainTag(domainTagsInput, "launch"));
    setNotice(`${clean.length} clean name${clean.length === 1 ? "" : "s"} queued in the domain wizard. ${clean[0]} is loaded first.`);
  }

  async function checkDns(domain: FriskyDomain) {
    setNotice("Checking live DNS propagation...");
    const result = await domainService.checkDns(domain.id);
    setNotice(result.ok ? `${domain.domain} verified.` : result.error?.message ?? "DNS check failed.");
    if (result.ok) {
      triggerCelebration("DNS verified", `${domain.domain} is ready for Telegram Lock traffic.`, "dns");
    }
    await refresh();
  }

  async function createBridge() {
    const domainId = selectedDomainRecord?.id;
    if (!domainId) return;
    const result = await bridgeService.create({
      domainId,
      slug: slugInput.trim() || ui.setupInputTelegramSlug,
      telegramChatId: chatInput.trim(),
      telegramGroupName: groupNameInput.trim(),
      telegramGroupImageUrl: groupImageInput.trim()
    });
    setNotice(`Telegram Lock ${result.data.publicUrl} ${ui.ready.toLowerCase()} to share.`);
    await refresh();
  }

  async function rotateBridge(bridge: FriskyBridge) {
    await bridgeService.rotate(bridge.id);
    setNotice(`${bridge.publicUrl} kept stable. Telegram invite behind this lock was rotated.`);
    await refresh();
  }

  async function revokeBridge(bridge: FriskyBridge) {
    await bridgeService.revoke(bridge.id);
    setNotice(`${bridge.publicUrl} is now locked down and will show unavailable.`);
    await refresh();
  }

  async function createLiveRoom() {
    const domainId = selectedDomainRecord?.id;
    if (!domainId) {
      setNotice(`${c.chooseDomain}. ${c.easyCloudflareBody ?? ""}`.trim());
      navigateActive("dns");
      return;
    }
    if (!roomTargetInput.trim()) {
      setNotice(`${ui.liveRoomUrlHint}.`);
      return;
    }
    const targetUrl = safeHttpUrl(roomTargetInput);
    if (!targetUrl) {
      setNotice(ui.liveRoomUrlHint + ".");
      return;
    }
    const coverImageUrl = safeHttpUrl(roomCoverInput);
    if (roomCoverInput.trim() && !coverImageUrl) {
      setNotice(ui.roomCoverImageInvalid);
      return;
    }
    const result = await liveRoomService.create({
      domainId,
      slug: roomSlugInput.trim() || "call",
      title: roomTitleInput.trim(),
      provider: roomProviderInput,
      targetUrl,
      coverImageUrl: coverImageUrl || providerLogoPresets[roomProviderInput]
    });
    setNotice(`Live Room ${result.data.publicUrl} ${ui.routePrivateViaFenrir}`);
    triggerCelebration("Live Room ready", `${result.data.title} is now behind your domain.`, "dns");
    await refresh();
  }

  async function pauseRoom(room: FriskyLiveRoom) {
    await liveRoomService.pause(room.id);
    setNotice(`${room.publicUrl} is paused. The meeting target stays private.`);
    await refresh();
  }

  async function checkTelegram() {
    const result = await telegramService.checkPermissions(chatInput.trim());
    setNotice(result.data.status === "ready" ? `${ui.readiness} ${ui.telegramStatusCheck.toLowerCase()}.` : "Missing Telegram permissions.");
    await refresh();
  }

  function startWizard(kind: "telegram" | "room" | "vault" | "domain" | "concierge") {
    if (kind === "telegram") {
      navigateActive("locks");
      setSlugInput((current) => current || ui.setupInputTelegramSlug);
      setGroupNameInput((current) => current || ui.setupInputGroupName);
      setNotice(c.inboxStepTelegramNeed);
    }
    if (kind === "room") {
      navigateActive("rooms");
      setRoomSlugInput((current) => current || ui.setupInputRoomSlug);
      setRoomTitleInput((current) => current || ui.setupInputLiveRoom);
      setNotice(c.inboxStepRoomNeed);
    }
    if (kind === "vault") {
      navigateActive("links");
      setNotice(c.inboxStepVaultNeed);
    }
    if (kind === "domain") {
      navigateActive("dns");
      setDomainInput((current) => current || ui.setupInputCustomDomain);
      setNotice(c.inboxStepDomainNeed);
    }
    if (kind === "concierge") {
      navigateActive("billing");
      setCheckoutPlan("pro");
      setNotice(c.inboxStepConciergeNeed);
    }
  }

  function runAiOps(kind: "jules" | "gemini" | "cursor") {
    if (kind === "jules") {
      aiOpsService.julesTicket();
      setNotice("Support task prepared for backend hardening.");
    }
    if (kind === "gemini") {
      aiOpsService.geminiDnsExplanation();
      setNotice("Gemini DNS assistant generated setup guidance.");
    }
    if (kind === "cursor") {
      aiOpsService.cursorHandoff();
      setNotice("Implementation note exported as an audit event.");
    }
    refresh();
  }

  function startService(mode: "create" | "link") {
    setServiceMode(mode);
    setNotice(mode === "create" ? c.accountCreated : c.accountLinked);
    triggerCelebration(
      mode === "create" ? c.serviceCelebrationCreateTitle : c.serviceCelebrationLinkTitle,
      c.serviceCelebrationDetail.replace("{subdomain}", serviceSubdomain).replace("{email}", serviceEmail),
      "commerce"
    );
  }

  async function startStripeCheckout(plan: PaidPlan) {
    setCheckoutPlan(plan);
    navigateActive("billing");
    try {
      const { url } = await billingService.checkout(plan, courtesyCode);
      window.location.assign(url);
    } catch {
      setNotice(copy[locale].checkoutErrorGeneric);
    }
  }

  async function startTelegramStars() {
    navigateActive("billing");
    try {
      const { url } = await billingService.telegramStars();
      window.location.assign(url);
    } catch {
      setNotice(copy[locale].starsCheckoutError);
    }
  }

  async function linkTelegramIdentity() {
    try {
      const result = await telegramIdentityService.start();
      setNotice(ui.linkTelegramId);
      window.open(result.url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => void refreshTelegramIdentity(), 4000);
    } catch {
      setNotice(ui.telegramSignInFirst);
    }
  }

  async function requestTelegramReadd() {
    if (!telegramIdentity?.linked) {
      await linkTelegramIdentity();
      return;
    }

    const requestedChatId = chatInput.trim();
    const bridge = state?.bridges.find((item) => item.status === "active" && (!requestedChatId || item.telegramChatId === requestedChatId));
    if (!bridge) {
      setNotice(ui.telegramReaddNeedChat);
      return;
    }

    try {
      const result = await telegramIdentityService.readd({ bridgeId: bridge.id });
      setNotice(ui.telegramReaddReady);
      openSafeUrl(result.inviteUrl);
    } catch {
      setNotice(ui.telegramReaddUnavailable);
    }
  }

  function onPaidPlanPickedFromPricing(planLabel: string) {
    const key = paidPlanFromProductLabel(planLabel);
    if (!key) {
      setNotice(planLabel.trim().toLowerCase() === "free" ? copy[locale].billingFreeTier : copy[locale].billingPaidPlanOnly);
      return;
    }
    setCheckoutPlan(key);
    navigateActive("billing");
    void startStripeCheckout(key);
  }

  function navigateActive(page: PageKey) {
    setActive(page);
    const nextPath = dashboardPathFor(page);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
  }

  async function openBillingPortal() {
    try {
      const { url } = await billingService.portal();
      window.location.assign(url);
    } catch {
      setNotice(copy[locale].billingPortalNeedsCustomer);
    }
  }

  async function registerPasskey() {
    try {
      setNotice(c.passkeyBusy);
      const { optionsJSON } = await webauthnService.registerOptions();
      // Carga diferida: @simplewebauthn/browser sale del chunk inicial y sólo
      // se descarga al registrar un passkey.
      const { startRegistration } = await import("@simplewebauthn/browser");
      const registration = await startRegistration({ optionsJSON });
      await webauthnService.registerVerify(registration);
      setNotice(c.passkeySuccess);
      await refreshAuth();
    } catch {
      setNotice(c.passkeyError);
    }
  }

  async function signOut() {
    await authService.logout();
    setAuth({ authenticated: false });
    setFenrirRole(null);
    window.history.replaceState({}, "", "/");
    setNotice(c.signedOut);
  }

  function addPersonalLink() {
    const url = safeHttpUrl(personalUrl);
    if (!url) {
      setNotice("Use a valid http or https URL before adding a link.");
      return;
    }
    const item: PersonalLink = {
      id: `personal_${Date.now()}`,
      title: personalTitle.trim() || "Fenrir link",
      url,
      kind: personalKind,
      status: "active"
    };
    setPersonalLinks((current) => [item, ...current]);
    setNotice(`Non-Telegram link added: ${item.title}.`);
      triggerCelebration("Link vault updated", `${item.url} is now tracked in Fenrir Bridge.`, "commerce");
  }

  async function shareLinkVault(links?: VaultLink[]) {
    if (!state) return;
    const shareLinks = links ?? buildVaultLinks(state.bridges, state.liveRooms, personalLinks);
    if (!shareLinks.length) {
      setNotice("Select at least one public link before sharing the vault.");
      return;
    }
    const shareUrl = createVaultShareUrl(shareLinks);
    await navigator.clipboard?.writeText(shareUrl);
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Fenrir Link Vault",
          text: "Stable public links routed through Fenrir.",
          url: shareUrl
        });
      } catch {
        // Clipboard copy above is the fallback when native share is dismissed.
      }
    }
    setNotice("Shareable Link Vault copied. It only includes public stable URLs.");
      triggerCelebration("Vault share link ready", "Your public Fenrir vault is ready to send.", "commerce");
  }

  const show = (...pages: PageKey[]) => pages.includes(active);

  return (
    <div className="app">
      {activationVisible && <ProtocolActivated />}
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-wordmark" src="/fenrir-cut-wordmark.svg" alt="Fenrir" />
          <div className="brand-lockup">
            <b>Telegram Lock</b>
            <small>{c.brandSmall}</small>
          </div>
        </div>
        <nav>
          {c.nav.map((item, index) => (
            <button className={active === pageKeys[index] ? "active" : ""} onClick={() => navigateActive(pageKeys[index])} key={item}>
              {item}
            </button>
          ))}
        </nav>
        <div className="operator-card">
          <span>Frisky Account</span>
          <b>{state.user.email}</b>
          <small>{state.org.id}</small>
          <div className="legal-mini-links">
            <a href={knowledgeBaseUrl} target="_blank" rel="noreferrer">{knowledgeBaseLabel}</a>
            <a href="/legal">{c.legal}</a>
            <a href="/terms">{c.terms}</a>
          </div>
        </div>
      </aside>

      <main>
        <div className="fenrir-wallpaper" aria-hidden="true">
          <span className="wallpaper-orbit orbit-one" />
          <span className="wallpaper-orbit orbit-two" />
          <FenrirSilhouette className="wallpaper-silhouette" />
          <span className="wallpaper-paw">F</span>
          <span className="wallpaper-bot">◈</span>
        </div>
        <header className="topbar">
          <div>
            <p className="label">{c.heroLabel}</p>
            <h1>{c.heroTitle}</h1>
            <p className="hero-owner">{c.heroOwner}</p>
            <div className="guardian-pills">
              {c.guardianPills.map((pill) => (
                <span key={pill}>{pill}</span>
              ))}
            </div>
            <BrandSignature c={c} />
          </div>
          <FenrirSilhouette className="hero-wolf-silhouette" />
          <div className="top-actions">
            <select
              className="language-select"
              value={locale}
              onChange={(event) => {
                const next = event.target.value as Locale;
                setLocale(next);
                setNotice(copy[next].initialNotice);
              }}
              aria-label="Language"
            >
              {locales.map((item) => (
                <option value={item} key={item}>{languageNames[item]}</option>
              ))}
            </select>
          <span className="status good">{state.user.authProvider} OAuth</span>
          <span className="status amber">{state.org.plan}</span>
            <button className="ghost compact-button" onClick={signOut}>{c.signOut}</button>
          </div>
        </header>

        <section className="notice">{notice}</section>
        <SessionLabels
          state={state}
          role={fenrirRole}
          billingStatus={billingStatus}
          telegramIdentity={telegramIdentity}
          onLinkTelegram={() => void linkTelegramIdentity()}
          c={c}
          ui={ui}
        />
        <BetaPreviewControls
          role={fenrirRole}
          plan={checkoutPlan}
          onRole={setFenrirRole}
          onPlan={setCheckoutPlan}
        />

        <ProtocolLivingSystem state={state} c={c} />

        {show("command") && (
          <LaunchWowConsole
            state={state}
            locale={locale}
            selectedDomain={selectedDomainRecord}
            selectedDomainTags={selectedDomainTags}
            roomProvider={roomProviderInput}
            onDomain={() => navigateActive("domains")}
            onRoom={() => navigateActive("rooms")}
            onCommunity={() => window.location.assign(communityBridgeDashboardUrl)}
          />
        )}

      {show("command", "faq") && <ClientWalkthroughPanel c={c} ui={ui} />}

        {show("command") && <SetupInboxWizard onStart={startWizard} c={c} ui={ui} />}

        {show("command") && (
          <ExampleDiagramCard c={c} ui={ui} />
        )}

        {show("command", "links") && <LinkVaultPanel
          c={c}
          ui={ui}
          bridges={state.bridges}
          rooms={state.liveRooms}
          personalLinks={personalLinks}
          commissionLinks={state.commissionLinks}
          title={personalTitle}
          url={personalUrl}
          kind={personalKind}
          onTitle={setPersonalTitle}
          onUrl={setPersonalUrl}
          onKind={setPersonalKind}
          onAdd={addPersonalLink}
          onShare={shareLinkVault}
          onOpen={(link) => {
            if (!openAnyUrl(link.url)) {
              setNotice(`Link "${link.title}" is not openable from here.`);
              return;
            }
            const commission = state.commissionLinks.find((item) => item.id === link.id || commissionUrlSlug(item.url) === commissionUrlSlug(link.url));
            const clicked = commission ? commerceService.click(commission.id) : null;
            if (clicked) {
              setNotice(`Tracked setup click: ${clicked.label}.`);
              triggerCelebration("Setup path unlocked", `${clicked.label} is now open in your browser.`, "commerce");
              void refresh();
            }
          }}
        />}

        {show("command", "billing") && <CashoutPipeline c={c} onStars={() => void startTelegramStars()} />}

      <section className="hero-grid">
          <Metric label={c.activeLocks} value={String(state.bridges.filter((bridge) => bridge.status === "active").length)} tone="good" />
          <Metric label={c.liveRooms} value={String(state.liveRooms.filter((room) => room.status === "active").length)} tone="blue" />
          <Metric label={c.sslActive} value={String(state.domains.filter((domain) => domain.certificateStatus === "active").length)} tone="blue" />
          <Metric label={c.revokedInvites} value={String(state.invites.filter((invite) => invite.status === "revoked").length)} tone="danger" />
        </section>

        {show("billing") && <ProductionReadinessPanel c={c} readiness={readiness} loadFailed={readinessError} />}
        {show("command", "brands") && <CommunityBridgeHandoffPanel />}

        <div className="content-grid">
          {show("command", "locks", "telegram") && <section className="panel wide">
            <PanelTitle title={c.activeTelegramLocks} subtitle={c.activeTelegramLocksSub} />
            <div className="form-row lock-form">
              <select value={selectedDomain} onChange={(event) => setSelectedDomain(event.target.value)}>
                <option value="" disabled>{c.chooseDomain}</option>
                {state.domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.domain}
                  </option>
                ))}
              </select>
              <input value={slugInput} onChange={(event) => setSlugInput(event.target.value)} aria-label="Telegram lock slug" placeholder={ui.setupInputTelegramSlug} />
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} aria-label="Telegram chat id" placeholder={ui.setupInputTelegramId} />
              <input value={groupNameInput} onChange={(event) => setGroupNameInput(event.target.value)} aria-label="Telegram group name" placeholder={ui.setupInputGroupName} />
              <input value={groupImageInput} onChange={(event) => setGroupImageInput(event.target.value)} aria-label="Telegram group image url" placeholder={ui.setupInputGroupPhoto} />
              <button onClick={createBridge}>{c.createLock}</button>
            </div>
            <BridgeGallery bridges={state.bridges} invites={state.invites} onRotate={rotateBridge} onRevoke={revokeBridge} c={c} />
          </section>}

          {show("command", "billing") && <section className="panel">
            <PanelTitle title={c.friskyAccount} subtitle={c.accountSub} />
            <KeyValue label={c.userId} value={friendlyAccountLabel(state.user.id, "User")} title={state.user.id} />
            <KeyValue label={c.orgId} value={friendlyAccountLabel(state.org.id, "Workspace")} title={state.org.id} />
            <KeyValue label={c.provider} value={state.user.authProvider} />
            <KeyValue label={c.billing} value={billingStatus?.stripeCustomerId ? "Stripe" : c.stripePlaceholder} />
            <KeyValue label={c.billingStatusLabel} value={billingStatus?.subscriptionStatus ?? c.billingStatusPlaceholder} />
            {billingStatus && (
              <p className="muted">
                Limits: {billingStatus.limits.maxTelegramLocks ?? "∞"} locks · custom domain {billingStatus.limits.customDomainSupported ? "yes" : "no"}
                {" · "}live rooms {billingStatus.limits.liveRoomsSupported ? "yes" : "no"}
              </p>
            )}
            <div className="row-actions">
              <button type="button" className="ghost compact-button" onClick={() => void openBillingPortal()}>
                {c.billingPortalButton}
              </button>
              <button type="button" className="ghost compact-button" onClick={() => void registerPasskey()}>
                {c.passkeyRegister}
              </button>
            </div>
            <p className="muted">{c.passkeyRegisterHint}</p>
          </section>}

          {show("command", "billing") && <AccountServicePanel
            c={c}
            email={serviceEmail}
            org={serviceOrg}
            telegram={serviceTelegram}
            subdomain={serviceSubdomain}
            mode={serviceMode}
            checkoutPlan={checkoutPlan}
            courtesyCode={courtesyCode}
            onCourtesyCode={setCourtesyCode}
            onEmail={setServiceEmail}
            onOrg={setServiceOrg}
            onTelegram={setServiceTelegram}
            onSubdomain={setServiceSubdomain}
            onStart={startService}
            onStars={() => void startTelegramStars()}
          />}

          {show("command", "domains", "dns") && <section className="panel wide">
            <PanelTitle title={c.dnsWizard} subtitle={c.dnsWizardSub} />
            <LiveDomainSearchPanel
              value={domainSearchInput}
              results={domainSearchResults}
              busy={domainSearchBusy}
              mode={domainSearchMode}
              meta={domainSearchMeta}
              queue={wizardQueue}
              onValue={setDomainSearchInput}
              onMode={setDomainSearchMode}
              onSearch={() => void runDomainSearch()}
              onPick={sendToWizard}
              onSendPromising={sendPromisingToWizard}
              onClearQueue={() => setWizardQueue([])}
              onOpenRegistrar={(domain) => {
                const query = encodeURIComponent(domain);
                openSafeUrl(`https://www.dynadot.com/domain/search?domain=${query}`);
              }}
            />
            <div className="domain-builder-layout">
              <div className="domain-builder-form">
                <input value={domainInput} onChange={(event) => setDomainInput(event.target.value)} aria-label="Domain input" placeholder={ui.setupInputDomain} />
                <input value={domainTagsInput} onChange={(event) => setDomainTagsInput(event.target.value)} aria-label="Domain tags" placeholder="launch, client, paid" />
                <div className="domain-tag-presets" aria-label="Domain tag presets">
                  {domainTagPresets.map((tag) => (
                    <button type="button" className="compact-button ghost" key={tag} onClick={() => setDomainTagsInput(addDomainTag(domainTagsInput, tag))}>
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="domain-builder-actions">
              <button onClick={addNewDomain}>{c.addDomain}</button>
              {selectedDomainRecord && <button className="secondary" onClick={() => checkDns(selectedDomainRecord)}>{c.checkDns}</button>}
              </div>
            </div>
            {selectedDomainRecord && (
              <div className="domain-tag-strip" aria-label="Selected domain tags">
                <b>{selectedDomainRecord.domain}</b>
                {selectedDomainTags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            )}
            <div className="domain-wow-steps" aria-label="Domain launch steps">
              <span className="active"><b>1</b> Name</span>
              <span className={domainInput.trim() || selectedDomainRecord ? "active" : ""}><b>2</b> Tags</span>
              <span className={selectedDomainRecord ? "active" : ""}><b>3</b> DNS</span>
              <span className={selectedDomainRecord?.certificateStatus === "active" ? "active" : ""}><b>4</b> Live</span>
            </div>
            <DomainChoice c={c} />
            <DnsWizard domains={state.domains} selected={selectedDomainRecord} onSelect={setSelectedDomain} c={c} />
            <RecommendedTools state={state} c={c} onOpen={(slug) => {
              const link = commerceService.click(slug);
              const label = link?.label ?? slug;
              setNotice(`Tracked setup click: ${label}. Purchase/setup path opened.`);
              triggerCelebration("Setup path unlocked", `${label} is tracked for the Telegram Lock setup flow.`, "commerce");
              refresh();
            }} />
          </section>}

        {show("command", "rooms", "billing") && <section className="panel wide live-room-panel">
            <PanelTitle title={c.liveRoomsTitle} subtitle={c.liveRoomsSub} />
            <div className="paid-feature-strip">
              <span className="status amber">{c.paidFeature}</span>
              <b>{c.notFree}</b>
              <small>{c.paidFeatureBody}</small>
            </div>
            <div className="room-offer-strip">
              <span className="status good">{ui.secondaryGate}</span>
              <b>{ui.routePrivateViaFenrir}</b>
              <small>{c.liveRoomsSub}</small>
            </div>
            <div className="room-customization-strip">
              <span className="status amber">{ui.proCustomization}</span>
              <b>{ui.proCustomizationBodyTitle}</b>
              <small>{ui.proCustomizationBody}</small>
            </div>
            <div className="provider-component-grid" aria-label="Common room providers">
              {liveRoomProviders.map((provider) => (
                <button
                  className={roomProviderInput === provider.id ? "provider-component active" : "provider-component"}
                  key={provider.id}
                  onClick={() => setRoomProviderInput(provider.id)}
                  type="button"
                >
                  <span className={`provider-brand provider-brand-${provider.id}`} aria-hidden="true">
                    <span className="provider-logo-mark">{provider.icon}</span>
                    <span className="provider-logo-word">{provider.brand}</span>
                  </span>
                  <b>{provider.name}</b>
                  <small>{provider.hint}</small>
                </button>
              ))}
            </div>
            <div className="form-row room-form">
              <select value={selectedDomain} onChange={(event) => setSelectedDomain(event.target.value)}>
                <option value="" disabled>{c.chooseDomain}</option>
                {state.domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.domain}
                  </option>
                ))}
              </select>
              <select value={roomProviderInput} onChange={(event) => setRoomProviderInput(event.target.value as LiveRoomProvider)}>
                {liveRoomProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              <input value={roomSlugInput} onChange={(event) => setRoomSlugInput(event.target.value)} aria-label="Live room slug" placeholder={ui.setupInputRoomSlug} />
              <input value={roomTitleInput} onChange={(event) => setRoomTitleInput(event.target.value)} aria-label="Live room title" placeholder={ui.setupInputRoomTitle} />
              <input value={roomTargetInput} onChange={(event) => setRoomTargetInput(event.target.value)} aria-label="Call target URL" placeholder={roomProviderPlaceholder(roomProviderInput)} />
              <input value={roomCoverInput} onChange={(event) => setRoomCoverInput(event.target.value)} aria-label="Pro logo or room image URL" placeholder={ui.setupInputRoomCover} />
              <button onClick={createLiveRoom}>{c.createPaidRoom}</button>
            </div>
            <div className="room-logo-actions" aria-label="Live room logo presets">
              <span>Room logo presets</span>
              {liveRoomProviders.map((provider) => (
                <button type="button" className="compact-button ghost" key={provider.id} onClick={() => {
                  setRoomProviderInput(provider.id);
                  setRoomCoverInput(providerLogoPresets[provider.id]);
                  setNotice(`${provider.name} logo preset applied.`);
                }}>
                  <ProviderBadge provider={provider.id} c={c} compact />
                </button>
              ))}
            </div>
            <div className="room-wow-preview" aria-label="Live room preview">
              <img
                className="room-logo-preview"
                src={safeHttpUrl(roomCoverInput) || providerLogoPresets[roomProviderInput]}
                alt="Room logo preview"
                style={{ height: 40, width: "auto", maxWidth: 160, objectFit: "contain", borderRadius: 8 }}
                onError={(event) => { (event.currentTarget as HTMLImageElement).src = providerLogoPresets[roomProviderInput]; }}
              />
              <div className="room-wow-link">
                <ProviderBadge provider={roomProviderInput} c={c} />
                <span>{selectedDomainRecord?.domain ?? "vip.myfenrir.com"}/{roomSlugInput.trim() || "studio"}</span>
              </div>
              <div>
                <b>{roomTitleInput.trim() || "Private live room"}</b>
                <small>{roomTargetInput.trim() || roomProviderPlaceholder(roomProviderInput)}</small>
              </div>
              <button type="button" className="secondary compact-button" onClick={() => setRoomCoverInput(providerLogoPresets[roomProviderInput])}>
                Use selected logo
              </button>
            </div>
            <div className="cloudflare-easy">
              <b>{c.easyCloudflare}</b>
              <span>{c.easyCloudflareBody}</span>
            </div>
            <LiveRoomGallery rooms={state.liveRooms} onPause={pauseRoom} c={c} ui={ui} />
          </section>}

          {show("locks", "telegram") && <section className="panel">
            <PanelTitle title={c.telegramGroups} subtitle={c.telegramGroupsSub} />
            <div className="check telegram-status-check">
              <b>{ui.telegramStatusCheck}</b>
              <span className={telegramIdentity?.linked ? "status good" : "status amber"}>
                {telegramIdentity?.linked ? ui.linked : ui.loginRequired}
            </span>
            <small>
              {telegramIdentity?.linked
                ? ui.telegramConnected(telegramIdentity.telegramUsername ?? "", telegramIdentity.telegramUserId ?? "Telegram", auth?.authenticated ?? false)
                : telegramIdentity
                  ? `${ui.telegramSessionFoundNoLink}`
                  : `${ui.telegramSignInFirst}`}
            </small>
            <small>{ui.telegramVerifyWhenNeeded}</small>
              <div className="row-actions">
                {!telegramIdentity?.linked ? <button type="button" onClick={() => void linkTelegramIdentity()}>{ui.linkTelegramId}</button> : null}
                {telegramIdentity?.linked ? <button type="button" onClick={() => void requestTelegramReadd()}>{ui.telegramReaddButton}</button> : null}
                <a className="button-link ghost" href={friskySignalDevRequestUrl} target="_blank" rel="noreferrer">{ui.devRequestViaSignal}</a>
              </div>
            </div>
            <div className="form-column">
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} aria-label="Telegram permission chat id" />
              <button onClick={checkTelegram}>{c.checkBotPermissions}</button>
            </div>
            <div className="checks">
              {state.telegramChecks.map((check) => (
                <div className="check" key={check.chatId}>
                  <b>{check.chatId}</b>
                  <span className={check.status === "ready" ? "status good" : "status danger"}>{check.status}</span>
                  <small>admin: {check.botIsAdmin ? "yes" : "no"} · invite: {check.canInviteUsers ? "yes" : "no"}</small>
                </div>
              ))}
            </div>
          </section>}

          {show("command") && <section className="panel">
            <PanelTitle title={c.opsStack} subtitle={c.opsStackSub} />
            <div className="ai-stack">
              <button onClick={() => runAiOps("jules")}>{c.julesTicket}</button>
              <button className="secondary" onClick={() => runAiOps("gemini")}>{c.geminiDnsGuide}</button>
              <button className="ghost" onClick={() => runAiOps("cursor")}>{c.cursorHandoff}</button>
            <a className="button-link ghost" href={friskySignalDevRequestUrl} target="_blank" rel="noreferrer">
              {ui.devRequestViaSignal}
            </a>
            </div>
            <p className="muted">{c.opsStackBody}</p>
          </section>}

          {show("locks", "revocations") && <section className="panel">
            <PanelTitle title={c.revocations} subtitle={c.revocationsSub} />
            <div className="timeline">
              {state.invites.filter((invite) => invite.status === "revoked").map((invite) => (
                <div className="timeline-item" key={invite.id}>
                  <b>{invite.id}</b>
                  <small>revoked at {invite.revokedAt}</small>
                </div>
              ))}
            </div>
          </section>}

          {show("billing") && <section className="panel">
            <PanelTitle title={c.billing} subtitle={c.pricingSub} />
            <div className="pricing">
              {c.plans.map(([plan, price, body]) => (
                <div className="price" key={plan}>
                  <b>{plan}</b>
                  <strong>{price}</strong>
                  <small>{body}</small>
                  {plan !== "Free" ? <button onClick={() => void startTelegramStars()}>{c.starsCheckout}</button> : null}
                  <button className="ghost" onClick={() => onPaidPlanPickedFromPricing(plan)}>{c.upgrade}</button>
                </div>
              ))}
            </div>
          </section>}

          {show("audit", "revocations") && <section className="panel wide">
            <PanelTitle title={c.auditLog} subtitle={c.auditLogSub} />
            <AuditLog state={state} />
          </section>}

          {show("command", "faq") && <FaqPanel c={c} />}
        </div>
        <BrandSignature c={c} compact />
      </main>
      {celebration && (
        <CelebrationBurst
          celebration={celebration}
          commerceLabel={c.celebrationLabelCommerce}
          dnsLabel={c.celebrationLabelDns}
        />
      )}
    </div>
  );
}

function GoRoutePage({
  c,
  ui,
  slug,
  link,
  onTrack
}: {
  c: Copy;
  ui: typeof uiCopy[Locale];
  slug: string;
  link: FriskyCommissionLink | null;
  onTrack: () => void;
}) {
  const destination = resolveCommissionDestination(link, slug);
  const resolved = absoluteUrl(destination);
  const label = link?.label ?? slug;
  const fallback = commissionFallbackBySlug(slug);
  const attemptedAutoOpen = useRef(false);

  useEffect(() => {
    if (!resolved || attemptedAutoOpen.current) return;
    attemptedAutoOpen.current = true;
    onTrack();
    const timer = window.setTimeout(() => {
      openAnyUrl(resolved);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [resolved, onTrack]);

  return (
    <main className="join-page">
      <section className="join-card">
        <span className="status good">{ui.setupRoute}</span>
        {resolved ? (
          <>
            <span className="mark">{label}</span>
            <h1>{ui.openingLaunchRoute}</h1>
            <p>{ui.setupPathReady}</p>
            <code>{resolved}</code>
            <div className="row-actions">
              <button className="join-button" type="button" onClick={() => openAnyUrl(resolved)}>
                {ui.openNow}
              </button>
              {fallback ? (
                <button className="ghost compact-button" type="button" onClick={() => openAnyUrl(fallback)}>
                  {ui.openFallback}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="label">{c.publicLockUnavailable}</p>
            <h1>{ui.linkPathNotReady}</h1>
            <p>{ui.commandRouteNotMapped}</p>
            {fallback ? (
              <button className="join-button" type="button" onClick={() => openAnyUrl(fallback)}>
                {ui.openFallbackPartnerRoute}
              </button>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function overlayAuthState(state: AppState, auth: AuthSession): AppState {
  if (!auth.authenticated || !auth.user || !auth.org) return state;
  return {
    ...state,
    user: {
      ...state.user,
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      authProvider: auth.user.authProvider
    },
    org: {
      ...state.org,
      id: auth.org.id,
      ownerUserId: auth.user.id,
      plan: auth.org.plan
    }
  };
}

function planLabel(plan: Plan) {
  const labels: Record<Plan, string> = {
    free: "Free",
    starter: "Starter",
    pro: "Pro",
    operator: "Operator"
  };
  return labels[plan];
}

function authProviderLabel(provider: string) {
  const value = provider.toLowerCase();
  if (value.includes("apple")) return "Apple";
  if (value.includes("google")) return "Google";
  if (value.includes("microsoft") || value.includes("azure")) return "Microsoft";
  if (value.includes("telegram")) return "Telegram";
  if (value.includes("passkey")) return "Passkey";
  return provider || "OAuth";
}

function planLockLimit(plan: Plan) {
  const limits: Record<Plan, string> = {
    free: "1",
    starter: "3",
    pro: "10",
    operator: "unlimited"
  };
  return limits[plan];
}

function SessionLabels({
  state,
  role,
  billingStatus,
  telegramIdentity,
  onLinkTelegram,
  c,
  ui
}: {
  state: AppState;
  role: FenrirRole | null;
  billingStatus: BillingStatusPayload | null;
  telegramIdentity: TelegramIdentityLinkPayload | null;
  onLinkTelegram: () => void;
  c: Copy;
  ui: typeof uiCopy[Locale];
}) {
  const activeLocks = state.bridges.filter((bridge) => bridge.status === "active").length;
  const backendLimit = billingStatus?.limits.maxTelegramLocks;
  const lockLimit = backendLimit === null ? "unlimited" : backendLimit ?? planLockLimit(state.org.plan);
  const labels = [
    [c.sessionRole, role === "owner" ? c.sessionOwner : role === "admin" ? c.sessionAdmin : "User"],
    [c.sessionPlan, planLabel(state.org.plan)],
    [c.sessionSubscription, billingStatus?.subscriptionStatus ?? c.sessionPendingMode],
    [c.sessionProvider, authProviderLabel(state.user.authProvider)],
      [c.sessionLocks, `${activeLocks}/${lockLimit}`],
      [
        ui.telegramStatusCheck,
        telegramIdentity?.linked
          ? `@${telegramIdentity.telegramUsername ?? telegramIdentity.telegramUserId}`
          : ui.loginRequired
      ]
  ];

  return (
    <section className="session-labels" aria-label="Fenrir session labels">
      {labels.map(([label, value]) => (
        <div className="session-label" key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
      <button className="session-label telegram-link-button" type="button" onClick={onLinkTelegram}>
        <span>{ui.telegramStatusCheck}</span>
        <b>{telegramIdentity?.linked ? ui.linked : ui.linkTelegramId}</b>
        <small>{telegramIdentity?.linked ? "Telegram identity ready" : "Opens the Fenrir bot handoff"}</small>
      </button>
    </section>
  );
}

function BetaPreviewControls({
  role,
  plan,
  onRole,
  onPlan
}: {
  role: FenrirRole | null;
  plan: PaidPlan;
  onRole: (role: FenrirRole | null) => void;
  onPlan: (plan: PaidPlan) => void;
}) {
  return (
    <section className="beta-preview-controls" aria-label="Beta preview controls">
      <span>Beta preview</span>
      <select value={role ?? "user"} onChange={(event) => onRole(event.target.value === "user" ? null : event.target.value as FenrirRole)}>
        <option value="user">User view</option>
        <option value="admin">Admin view</option>
        <option value="owner">Owner view</option>
      </select>
      <select value={plan} onChange={(event) => onPlan(event.target.value as PaidPlan)}>
        <option value="starter">Starter preview</option>
        <option value="pro">Pro preview</option>
        <option value="operator">Operator preview</option>
      </select>
      <small>Preview only. Billing entitlement still comes from the backend.</small>
    </section>
  );
}

function PublicBridgeRoute({ slug, c, ui }: { slug: string; c: Copy; ui: typeof uiCopy[Locale] }) {
  const [resolved, setResolved] = useState<{ bridge: FriskyBridge; invite: FriskyTelegramInvite | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void bridgeService.publicRedirect(slug)
      .then((result) => {
        if (!cancelled) setResolved({ bridge: result.bridge, invite: result.invite });
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <main className="join-page">
      {resolved ? (
        <section className="join-card">
          <GroupAvatar bridge={resolved.bridge} />
          <p className="label">{c.publicLockActive}</p>
          <h1>{resolved.bridge.telegramGroupName}</h1>
          <p>{c.publicLockBody}</p>
          {resolved.invite?.inviteLink ? (
            <a className="join-button" href={resolved.invite.inviteLink}>{c.continueTelegram}</a>
          ) : (
            <button className="join-button" type="button" disabled>{ui.loginRequired}</button>
          )}
          <code>{resolved.bridge.publicUrl}</code>
        </section>
      ) : (
        <section className="join-card unavailable">
          <span className="mark">F</span>
          <p className="label">{loaded ? c.publicLockUnavailable : ui.resolvingLockState}</p>
          <h1>{loaded ? c.invitePaused : ui.checkingRoute}</h1>
          <p>{loaded ? c.invitePausedBody : ui.resolvingBridgeState}</p>
        </section>
      )}
    </main>
  );
}

function PublicRoomRoute({ slug, c, ui }: { slug: string; c: Copy; ui: typeof uiCopy[Locale] }) {
  const [room, setRoom] = useState<FriskyLiveRoom | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void liveRoomService.publicRedirect(slug)
      .then((result) => {
        if (!cancelled) setRoom(result.room);
      })
      .catch(() => {
        if (!cancelled) setRoom(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const roomCoverUrl = room ? trustedFenrirImageUrl(room.coverImageUrl) : "";
  return (
    <main className="join-page">
      {room ? (
        <section className="join-card live-room-public gated-room">
          <div className="room-gate-brand">
            <span>{roomCoverUrl ? <img src={roomCoverUrl} alt="" /> : null} {ui.fenrirRoomGate}</span>
            <b>{providerLabel(room.provider, c)} access</b>
          </div>
          <div className="public-room-cover" style={roomCoverUrl ? { backgroundImage: `url("${roomCoverUrl}")` } : undefined}>
            <span>{ui.roomSecondaryLabel}</span>
          </div>
          <p className="label">{c.publicRoomActive}</p>
          <h1 className="room-gate-title">{room.title}</h1>
            <p>{ui.roomBrandIntro}</p>
          <div className="room-gate-grid" aria-label="Fenrir room routing status">
            <span>{ui.roomStableUrlLabel}</span>
            <code>{room.publicUrl}</code>
            <span>{ui.roomPrivateDestinationLabel}</span>
            <b>{providerLabel(room.provider, c)} hidden until continue</b>
            <span>{ui.challengeLayer}</span>
            <b>{ui.riskBasedPromptReady}</b>
          </div>
          <div className="room-gate-challenge" role="status">
            <span>{ui.captchaLayer}</span>
            <b>{ui.idleNormalPattern}</b>
            <small>{ui.roomChallengeDescription}</small>
          </div>
          <button className="join-button protected-room-button" type="button" disabled>
            {ui.protectedRedirectPending}
          </button>
        </section>
      ) : (
        <section className="join-card unavailable">
          <span className="mark">F</span>
          <p className="label">{loaded ? c.publicRoomUnavailable : ui.resolvingLockState}</p>
          <h1>{loaded ? c.roomPaused : ui.checkingRoute}</h1>
          <p>{loaded ? c.roomPausedBody : ui.roomWaitingBody}</p>
        </section>
      )}
    </main>
  );
}

function ProtocolActivated() {
  return (
    <div className="protocol-activated" aria-live="polite">
      <div className="lightning-mark" aria-hidden="true">
        <svg viewBox="0 0 180 280">
          <path d="M112 6 22 146h67l-24 128 94-163H94L112 6Z" />
        </svg>
      </div>
      <div>
        <span>FENRIR</span>
        <b>FENRIR PROTOCOL ACTIVATED</b>
      </div>
    </div>
  );
}

function mergeNeonBrandTheme(base: typeof brandThemes.neonNexus, brand: CommunityBrandPayload | null) {
  if (!brand) return base;
  return {
    ...base,
    productName: brand.name || base.productName,
    headline: brand.headline || base.headline,
    subheadline: brand.subheadline || base.subheadline,
    primary: brand.primary_color || base.primary,
    secondary: brand.secondary_color || base.secondary,
    accent: brand.accent_color || base.accent
  };
}

const brandWizardSteps = ["Address", "Name", "Images", "Colors", "Words", "Access"] as const;
type BrandWizardStep = (typeof brandWizardSteps)[number];

const brandWizardStepDetails: Record<BrandWizardStep, { title: string; body: string; outcome: string }> = {
  Address: {
    title: "Choose the public address",
    body: "This becomes the short URL people visit before they ask to join.",
    outcome: "Visitors will land on this route."
  },
  Name: {
    title: "Name the community",
    body: "Use the name members already recognize. This is the main label on the gate.",
    outcome: "The preview headline and dashboard listing use this name."
  },
  Images: {
    title: "Add logo and atmosphere",
    body: "Start with a preset, then replace assets later when the final brand files are ready.",
    outcome: "Logo, mascot, and background affect the public gate."
  },
  Colors: {
    title: "Pick the visual mood",
    body: "Choose three colors: primary for action, secondary for support, accent for highlights.",
    outcome: "Buttons, badges, and glow states follow these colors."
  },
  Words: {
    title: "Write the welcome message",
    body: "Say who the gate is for and what happens after people enter.",
    outcome: "These lines are what visitors read before signing in."
  },
  Access: {
    title: "Set the entry rules",
    body: "Decide whether people enter immediately, need an invite, or wait for review.",
    outcome: "Neon stores the membership state and audit trail."
  }
};

const accessStateHelp: Record<DefaultAccessState, string> = {
  provisional: "New members wait for review before full access.",
  open: "Approved identity can enter immediately.",
  invite_only: "Only people with a valid invite code can proceed.",
  disabled: "The gate stays closed while you finish setup."
};

function communityAuthProviderLabel(provider: string) {
  if (provider === "magic_link") return "Magic link";
  if (provider === "microsoft") return "Microsoft";
  return provider[0]?.toUpperCase() + provider.slice(1);
}

/** Providers the Community Gate OAuth bridge can complete end-to-end. */
const communityOAuthProviders = ["google", "microsoft", "apple"] as const;

function communityOAuthStartUrl(provider: string, slug: string) {
  const params = new URLSearchParams({ slug, return_to: `/community/${slug}` });
  return `/api/community-auth/oauth/${provider}?${params.toString()}`;
}

/** Human-readable copy for the ?auth_error= the bridge callback redirects back with. */
function communityOAuthErrorMessage(search: string) {
  const raw = new URLSearchParams(search).get("auth_error");
  if (!raw) return null;
  const code = raw.split(":", 1)[0];
  if (code === "provider_not_configured") return "That provider is not connected yet. Use the magic link, or ask the community owner to finish the provider setup.";
  if (code === "provider_not_enabled") return "That provider is switched off for this community. Use another sign-in option.";
  if (code === "email_unverified") return "The provider did not confirm that email address. Verify it with the provider, then try again.";
  if (code === "access_denied") return "You cancelled at the provider consent screen. Try again to continue.";
  if (code === "community_org_required") return "This community is not fully provisioned yet. Ask the owner to finish setup.";
  if (code === "oauth_state_missing" || code === "oauth_state_invalid" || code === "oauth_provider_mismatch") {
    return "That sign-in attempt expired. Start again from this page.";
  }
  if (code === "missing_code") return "The provider returned without an authorization code. Try again.";
  return `Sign-in did not complete (${raw}). Try again or use the magic link.`;
}

const legacyNeonPromoAsset = "/mj-neon-hero.gif";

function cleanCommunityAssetUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.includes(legacyNeonPromoAsset) ? null : trimmed;
}

const brandImageFields = [
  {
    key: "logo_url",
    icon: "◇",
    title: "Logo mark",
    placeholder: "/fenrir-cut-wordmark.svg",
    help: "Use an SVG/PNG in /public, Cloudflare R2, or another public HTTPS URL. This appears in the gate header."
  },
  {
    key: "mascot_url",
    icon: "✦",
    title: "Mascot or product visual",
    placeholder: "https://cdn.example.com/community-mascot.png",
    help: "Optional. Add a character, product shot, or community symbol. Leave blank for a cleaner gate."
  },
  {
    key: "background_url",
    icon: "▣",
    title: "Background image",
    placeholder: "https://cdn.example.com/community-background.jpg",
    help: "Use a wide high-contrast image. The gate adds a dark overlay automatically."
  }
] as const;

const brandStylePresets = [
  { name: "Neon Nexus", primary: "#22c7a8", secondary: "#8cb9ff", accent: "#9b8cff", note: "Electric teal, blue, violet." },
  { name: "Fenrir Core", primary: "#ff334e", secondary: "#22c7a8", accent: "#f1b75c", note: "Red action, teal signal, amber highlight." },
  { name: "Midnight Ops", primary: "#111111", secondary: "#666666", accent: "#c9d1d9", note: "Quiet operator mode." },
  { name: "Solar Gate", primary: "#f59e0b", secondary: "#fb7185", accent: "#22d3ee", note: "Warm launch page with cyan edge." },
  { name: "Arcade Pulse", primary: "#a855f7", secondary: "#06b6d4", accent: "#f472b6", note: "More playful, obvious community flavor." }
] as const;

// One-tap "looks" — each sets logo + mascot + background + colors together from
// assets ALREADY bundled in /public, so a new gate looks great with zero hosting
// and zero URLs. Power users can still paste their own art under "Advanced".
const brandVisualPresets = [
  {
    name: "LORE Neon",
    note: "Neon ghost · magenta → cyan",
    logo_url: "/fenrir-splash-icon.svg",
    mascot_url: "/lore-ghost-neon-signal.svg",
    background_url: null as string | null,
    primary_color: "#FF2E6E", secondary_color: "#9D00FF", accent_color: "#00E5FF"
  },
  {
    name: "Fenrir Dark",
    note: "Cyber guardian · steel + signal",
    logo_url: "/fenrir-cut-wordmark.svg",
    mascot_url: "/fenrir-cyber-guardian-hero.svg",
    background_url: null as string | null,
    primary_color: "#22c7a8", secondary_color: "#8cb9ff", accent_color: "#f1b75c"
  },
  {
    name: "Minimal",
    note: "Clean mark · no clutter",
    logo_url: "/fenrir-splash-icon.svg",
    mascot_url: null as string | null,
    background_url: null as string | null,
    primary_color: "#141414", secondary_color: "#666666", accent_color: "#c9d1d9"
  }
] as const;

const communityGateWalkthrough = [
  {
    label: "What it is",
    title: "A branded front door before Neon decides access.",
    body: "Visitors land on your public community gate, see your brand, prove identity, and then Neon checks whether they can enter."
  },
  {
    label: "How to set it",
    title: "Pick address, brand, words, login methods, and access mode.",
    body: "The builder walks through the slug, name, logo/background, colors, welcome copy, and rules like provisional, open, invite-only, or disabled."
  },
  {
    label: "How it works",
    title: "Fenrir handles the door. Neon keeps the member state.",
    body: "Fenrir renders the gate and routes the flow. Neon stores membership, invite state, review status, and audit history away from Fenrir Bridge customer data."
  },
  {
    label: "Why subscribe",
    title: "You get a real community access system, not another loose link.",
    body: "Subscription unlocks branded gates, safer onboarding, isolated community records, review workflows, and a cleaner upgrade path for paid/private communities."
  }
] as const;

function CommunityBrandWizardPanel({ locale, onNotice }: { locale: Locale; onNotice: (message: string) => void }) {
  const [step, setStep] = useState<BrandWizardStep>("Address");
  const [slug, setSlug] = useState("neon-nexus");
  const [draft, setDraft] = useState<CommunityBrandUpdatePayload>({});
  const [loadedBrand, setLoadedBrand] = useState<CommunityBrandPayload | null>(null);
  const [authorizationReason, setAuthorizationReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seededDefaultRef = useRef(false);

  // Ship a good default: the first time the builder reaches the look step with
  // nothing chosen (and nothing loaded from an existing gate), apply the default
  // preset so the gate looks great with zero input. One-shot; never overrides a
  // loaded brand or a choice the admin already made.
  useEffect(() => {
    if (step !== "Images" || seededDefaultRef.current) return;
    seededDefaultRef.current = true;
    const has = (k: keyof CommunityBrandPayload) => Boolean((draft as Record<string, unknown>)[k] ?? (loadedBrand as Record<string, unknown> | null)?.[k]);
    if (!has("logo_url") && !has("mascot_url") && !has("background_url")) {
      const p = brandVisualPresets[0];
      setDraft((c) => ({
        ...c,
        logo_url: p.logo_url, mascot_url: p.mascot_url, background_url: p.background_url,
        primary_color: c.primary_color ?? p.primary_color,
        secondary_color: c.secondary_color ?? p.secondary_color,
        accent_color: c.accent_color ?? p.accent_color
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const previewBrand = useMemo<CommunityBrandPayload>(() => ({
    slug,
    name: draft.name ?? loadedBrand?.name ?? "Neon Nexus",
    logo_url: cleanCommunityAssetUrl(draft.logo_url ?? loadedBrand?.logo_url),
    mascot_url: cleanCommunityAssetUrl(draft.mascot_url ?? loadedBrand?.mascot_url),
    background_url: cleanCommunityAssetUrl(draft.background_url ?? loadedBrand?.background_url),
    primary_color: draft.primary_color ?? loadedBrand?.primary_color ?? brandThemes.neonNexus.primary,
    secondary_color: draft.secondary_color ?? loadedBrand?.secondary_color ?? brandThemes.neonNexus.secondary,
    accent_color: draft.accent_color ?? loadedBrand?.accent_color ?? brandThemes.neonNexus.accent,
    headline: draft.headline ?? loadedBrand?.headline ?? brandThemes.neonNexus.headline,
    subheadline: draft.subheadline ?? loadedBrand?.subheadline ?? brandThemes.neonNexus.subheadline,
    invite_prefix: draft.invite_prefix ?? loadedBrand?.invite_prefix ?? slug,
    enabled_auth_providers: Array.isArray(draft.enabled_auth_providers)
      ? (draft.enabled_auth_providers as string[])
      : loadedBrand?.enabled_auth_providers ?? ["magic_link"],
    default_access_state: (draft.default_access_state ?? loadedBrand?.default_access_state ?? "provisional") as DefaultAccessState,
    communityOrgId: loadedBrand?.communityOrgId ?? null,
    communityId: loadedBrand?.communityId ?? "",
    fallbackUsed: loadedBrand?.fallbackUsed ?? false
  }), [draft, loadedBrand, slug]);

  const previewTheme = useMemo(() => mergeNeonBrandTheme(brandThemes.neonNexus, previewBrand), [previewBrand]);

  useEffect(() => {
    let cancelled = false;
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return undefined;
    setBusy(true);
    setLoadError(null);
    void getCommunityAuthBrandForAdmin(normalized).then((result) => {
      if (cancelled) return;
      setLoadedBrand(result.brand);
      setAuthorizationReason(result.authorization.reason);
      setDraft({
        name: result.brand.name,
        logo_url: cleanCommunityAssetUrl(result.brand.logo_url),
        mascot_url: cleanCommunityAssetUrl(result.brand.mascot_url),
        background_url: cleanCommunityAssetUrl(result.brand.background_url),
        primary_color: result.brand.primary_color,
        secondary_color: result.brand.secondary_color,
        accent_color: result.brand.accent_color,
        headline: result.brand.headline,
        subheadline: result.brand.subheadline,
        invite_prefix: result.brand.invite_prefix,
        enabled_auth_providers: result.brand.enabled_auth_providers,
        default_access_state: result.brand.default_access_state
      });
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(communityBrandAdminErrorMessage(error));
      setLoadedBrand(null);
      setAuthorizationReason(null);
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function saveBrand() {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
      onNotice("Enter a valid community slug before saving.");
      return;
    }
    setBusy(true);
    const saved = await saveCommunityBrand(normalized, draft);
    setBusy(false);
    if (!saved) {
      onNotice("Brand save failed. Phase 0 requires an internal admin override.");
      return;
    }
    setLoadedBrand(saved.brand);
    setAuthorizationReason(saved.authorization.reason);
    onNotice(`Brand saved for /${normalized} (${saved.authorization.reason}).`);
  }

  const stepIndex = brandWizardSteps.indexOf(step);
  const stepDetail = brandWizardStepDetails[step];
  const selectedProviders = previewBrand.enabled_auth_providers.map(communityAuthProviderLabel).join(", ");
  const publicGatePath = `/community/${slug.trim().toLowerCase() || "your-community"}`;

  return (
    <section className="panel wide community-brand-wizard">
      <PanelTitle title="Community Gate Builder" subtitle="Customize the public gate people use before Neon decides access." />
      <details className="community-gate-guide">
        <summary>
          <span>How Community Gate works</span>
          <small>Fenrir handles the branded door. Neon owns member truth.</small>
        </summary>
        <div className="community-gate-guide-body">
          <div className="community-gate-walkthrough-grid">
            {communityGateWalkthrough.map((item, index) => (
              <article key={item.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{item.label}</b>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <div className="community-gate-flow" aria-label="Community Gate access flow">
            {[
              "Branded gate",
              "Identity proof",
              "Neon member check",
              "Approve or block",
              "Separate audit trail"
            ].map((item, index) => (
              <span key={item}>{index + 1}. {item}</span>
            ))}
          </div>
        </div>
      </details>
      <div className="brand-wizard-layout">
        <div className="brand-wizard-main">
          <div className="brand-wizard-overview" aria-label="Current Community Gate setup">
            <div>
              <span>Public gate</span>
              <b>{publicGatePath}</b>
            </div>
            <div>
              <span>Entry mode</span>
              <b>{previewBrand.default_access_state.replace("_", " ")}</b>
            </div>
            <div>
              <span>Login methods</span>
              <b>{selectedProviders || "Magic link"}</b>
            </div>
          </div>

          <ol className="brand-wizard-stepper" aria-label="Brand wizard steps">
            {brandWizardSteps.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={step === label ? "active" : index < stepIndex ? "done" : ""}
                  onClick={() => setStep(label)}
                >
                  <span>{index + 1}</span>
                  <b>{label}</b>
                </button>
              </li>
            ))}
          </ol>

          {loadError ? <p className="muted brand-wizard-error">{loadError}</p> : null}
          {authorizationReason ? <p className="muted">Authorization: {authorizationReason}</p> : null}

          <div className="brand-wizard-step-header">
            <span>Step {stepIndex + 1} of {brandWizardSteps.length}</span>
            <h3>{stepDetail.title}</h3>
            <p>{stepDetail.body}</p>
            <small>{stepDetail.outcome}</small>
          </div>

          {step === "Address" && (
            <label className="brand-wizard-field">
              <span>Short URL name</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="neon-nexus" />
              <small>Use lowercase letters, numbers, and dashes. This creates {publicGatePath}.</small>
            </label>
          )}

          {step === "Name" && (
            <label className="brand-wizard-field">
              <span>Community name</span>
              <input value={draft.name ?? ""} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Neon Nexus" />
              <small>This is the name visitors see on the gate and admins see in the brand workspace.</small>
            </label>
          )}

          {step === "Images" && (
            <div className="brand-wizard-image-builder">
              <div className="brand-visual-preset-head">
                <b>Pick a look</b>
                <small>One tap sets the logo, mascot, and atmosphere — it works instantly. You can swap in your own brand files anytime.</small>
              </div>
              <div className="brand-visual-preset-grid">
                {brandVisualPresets.map((preset) => {
                  const active = (draft.logo_url ?? null) === preset.logo_url
                    && (draft.mascot_url ?? null) === preset.mascot_url
                    && (draft.background_url ?? null) === preset.background_url;
                  return (
                    <button
                      type="button"
                      key={preset.name}
                      className={active ? "brand-visual-preset active" : "brand-visual-preset"}
                      aria-pressed={active}
                      onClick={() => setDraft((c) => ({
                        ...c,
                        logo_url: preset.logo_url, mascot_url: preset.mascot_url, background_url: preset.background_url,
                        primary_color: preset.primary_color, secondary_color: preset.secondary_color, accent_color: preset.accent_color
                      }))}
                    >
                      <span className="brand-visual-thumb" style={{ background: `linear-gradient(135deg, ${preset.primary_color}, ${preset.secondary_color})` }}>
                        <img src={preset.mascot_url ?? preset.logo_url} alt="" loading="lazy" className={preset.mascot_url ? "" : "logo-only"} />
                      </span>
                      <b>{preset.name}</b>
                      <small>{preset.note}</small>
                    </button>
                  );
                })}
              </div>
              <p className="brand-visual-footnote">Bundled art — no hosting needed. Final brand files can replace these later, and never block launch.</p>

              <details className="brand-advanced">
                <summary>Advanced — use your own art</summary>
                <div className="brand-advanced-body">
                  <div className="brand-asset-help-card">
                    <span className="brand-asset-help-icon">＋</span>
                    <div>
                      <b>Add your own art</b>
                      <small>Upload the file to /public, Cloudflare R2, Supabase Storage, or any public HTTPS CDN. Then paste that final URL below. Local files cannot be served to visitors until they are hosted.</small>
                    </div>
                  </div>
                  <div className="brand-asset-grid">
                    {brandImageFields.map((field) => {
                      const value = String(draft[field.key] ?? "");
                      return (
                        <label className={value ? "brand-asset-card filled" : "brand-asset-card"} key={field.key}>
                          <span className="brand-asset-icon">{field.icon}</span>
                          <span className="brand-asset-copy">
                            <b>{field.title}</b>
                            <small>{field.help}</small>
                          </span>
                          <input
                            value={value}
                            onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value || null }))}
                            placeholder={field.placeholder}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <div className="brand-wizard-suggestions brand-asset-actions">
                    <span>Quick art actions</span>
                    <div>
                      <button type="button" className="compact-button ghost" onClick={() => setDraft(c => ({ ...c, logo_url: "/fenrir-cut-wordmark.svg", mascot_url: null, background_url: null }))}>Use clean Fenrir mark</button>
                      <button type="button" className="compact-button ghost" onClick={() => setDraft(c => ({ ...c, logo_url: "/fenrir-splash-icon.svg", mascot_url: null, background_url: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop" }))}>Abstract background</button>
                      <button type="button" className="compact-button ghost" onClick={() => setDraft(c => ({ ...c, logo_url: null, mascot_url: null, background_url: null }))}>Clear all images</button>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}

          {step === "Colors" && (
            <div className="brand-wizard-color-grid">
              <div className="brand-style-preset-grid">
                {brandStylePresets.map((preset) => (
                  <button
                    type="button"
                    className="brand-style-preset"
                    key={preset.name}
                    onClick={() => setDraft(c => ({ ...c, primary_color: preset.primary, secondary_color: preset.secondary, accent_color: preset.accent }))}
                  >
                    <span className="brand-style-swatches" aria-hidden="true">
                      <i style={{ background: preset.primary }} />
                      <i style={{ background: preset.secondary }} />
                      <i style={{ background: preset.accent }} />
                    </span>
                    <b>{preset.name}</b>
                    <small>{preset.note}</small>
                  </button>
                ))}
              </div>
              {(["primary_color", "secondary_color", "accent_color"] as const).map((key) => (
                <label className="brand-wizard-color" key={key}>
                  <span>{key.replace("_color", "")}</span>
                  <input
                    type="color"
                    value={String(draft[key] ?? previewBrand[key])}
                    onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                  />
                  <code>{String(draft[key] ?? previewBrand[key])}</code>
                </label>
              ))}
            </div>
          )}

          {step === "Words" && (
            <div className="brand-wizard-grid">
              <label className="brand-wizard-field">
                <span>Main welcome line</span>
                <input value={draft.headline ?? ""} onChange={(event) => setDraft((current) => ({ ...current, headline: event.target.value }))} placeholder="Enter Neon Nexus" />
                <small>Keep it short. This is the first thing visitors read.</small>
              </label>
              <label className="brand-wizard-field">
                <span>What happens here</span>
                <textarea value={draft.subheadline ?? ""} onChange={(event) => setDraft((current) => ({ ...current, subheadline: event.target.value }))} rows={3} placeholder="Verify your identity and request access to the community." />
                <small>Explain the next step without mentioning internal systems.</small>
              </label>
              <label className="brand-wizard-field">
                <span>Invite code prefix</span>
                <input value={draft.invite_prefix ?? ""} onChange={(event) => setDraft((current) => ({ ...current, invite_prefix: event.target.value }))} placeholder={slug} />
                <small>Useful when generating codes like {slug.toUpperCase()}-FOUNDERS-001.</small>
              </label>
              <div className="brand-wizard-note">
                <b>Optional promo layer</b>
                <span>Remotion can render a teaser later, but this gate should work without video.</span>
              </div>
            </div>
          )}

          {step === "Access" && (
            <div className="brand-wizard-grid">
              <label className="brand-wizard-field">
                <span>Default access state</span>
                <select
                  value={draft.default_access_state ?? previewBrand.default_access_state}
                  onChange={(event) => setDraft((current) => ({ ...current, default_access_state: event.target.value as DefaultAccessState }))}
                >
                  <option value="provisional">Provisional (Manual Review)</option>
                  <option value="open">Open (Instant Access)</option>
                  <option value="invite_only">Invite only (Private)</option>
                  <option value="disabled">Disabled (Gate Closed)</option>
                </select>
                <small>{accessStateHelp[(draft.default_access_state ?? previewBrand.default_access_state) as DefaultAccessState]}</small>
              </label>
              <div className="brand-wizard-field">
                <span>Login methods</span>
                <div className="brand-wizard-provider-grid">
                  {["magic_link", "google", "apple", "microsoft"].map((provider) => {
                    const providers = Array.isArray(draft.enabled_auth_providers) ? draft.enabled_auth_providers : (previewBrand.enabled_auth_providers || []);
                    const checked = providers.includes(provider);
                    // The bridge is wired for all four; a provider is only "live" once its
                    // credentials exist in the environment.
                    const live = (loadedBrand?.available_auth_providers ?? ["magic_link"]).includes(provider);
                    return (
                      <label className={live ? "live" : "planned"} key={provider}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...providers, provider]
                              : providers.filter((p: string) => p !== provider);
                            setDraft((current) => ({
                              ...current,
                              enabled_auth_providers: next.length > 0 ? next : ["magic_link"]
                            }));
                          }}
                        />
                        <span>{communityAuthProviderLabel(provider)}</span>
                        <small>{live ? "Live now" : "Awaiting provider credentials"}</small>
                      </label>
                    );
                  })}
                </div>
                <small>The Neon OAuth bridge is wired for Google, Microsoft and Apple. A provider only appears on the public gate once you enable it here AND its credentials are set in the environment.</small>
              </div>
            </div>
          )}

          <div className="brand-wizard-actions">
            <button type="button" className="secondary" disabled={stepIndex === 0} onClick={() => setStep(brandWizardSteps[Math.max(0, stepIndex - 1)]!)}>
              Back
            </button>
            {stepIndex < brandWizardSteps.length - 1 ? (
              <button type="button" onClick={() => setStep(brandWizardSteps[stepIndex + 1]!)}>
                Continue to {brandWizardSteps[stepIndex + 1]}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void saveBrand()}>
                {busy ? "Saving..." : "Save Community Gate"}
              </button>
            )}
          </div>
        </div>

        <aside className="brand-wizard-preview-column" aria-label="Public gate preview">
          <div className="brand-wizard-preview-toolbar">
            <span>Live preview</span>
            <a href={publicGatePath} target="_blank" rel="noreferrer">Open gate ↗</a>
          </div>
          <div className="brand-wizard-preview">
            <AuthSurface
              theme={previewTheme}
              locale={locale}
              onLocale={() => {}}
              railLabel="Preview"
              logoUrl={previewBrand.logo_url}
              backgroundUrl={previewBrand.background_url}
            >
              <GlowCard className="auth-card" aria-label="Community gate preview">
                <div className="auth-card-header">
                  <span className="status good">Preview</span>
                  <span className="auth-card-kicker">/{slug}</span>
                </div>
                <h2 className="auth-enter-title">
                  <span>{previewBrand.headline}</span>
                </h2>
                <p className="muted">{previewBrand.subheadline}</p>
                <div className="brand-wizard-preview-style" aria-label="Selected visual style">
                  <span style={{ background: previewBrand.primary_color }} />
                  <span style={{ background: previewBrand.secondary_color }} />
                  <span style={{ background: previewBrand.accent_color }} />
                </div>
                <div className="brand-wizard-preview-meta">
                  <span>{previewBrand.default_access_state.replace("_", " ")}</span>
                  <span>{selectedProviders || "Magic link"}</span>
                </div>
              </GlowCard>
            </AuthSurface>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CommunityNeonGateRoute({ slug, locale, onLocale, c, ui }: {
  slug: string;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  c: Copy;
  ui: typeof uiCopy[Locale];
}) {
  type GateMessageTone = "info" | "success" | "error";
  const [brand, setBrand] = useState<CommunityBrandPayload | null>(null);
  const theme = useMemo(() => mergeNeonBrandTheme(brandThemes.neonNexus, brand), [brand]);
  const [proposal, setProposal] = useState<CommunityAuthProposal | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<GateMessageTone>("info");
  const [devLink, setDevLink] = useState<string | null>(null);
  const trimmedEmail = email.trim();
  const communityName = brand?.name || theme.productName;
  const enabledProviders = brand?.enabled_auth_providers ?? ["magic_link"];
  // A provider needs BOTH the owner's switch and real credentials, otherwise the button
  // would just bounce back with ?auth_error=provider_not_configured.
  const availableProviders = brand?.available_auth_providers;
  const enabledOAuthProviders = communityOAuthProviders.filter(
    (provider) => enabledProviders.includes(provider) && (!availableProviders || availableProviders.includes(provider))
  );
  const oauthError = useMemo(() => communityOAuthErrorMessage(window.location.search), []);
  const gateText = {
    en: {
      kicker: "Private community access",
      body: "Enter with a scoped Neon session. Fenrir keeps the client portal, invite checks, and community membership state separated.",
      stepIdentity: "Identity",
      stepIdentityBody: "Email link confirms the person.",
      stepInvite: "Invite",
      stepInviteBody: "Community rules decide the next door.",
      stepSession: "Session",
      stepSessionBody: "Access stays isolated from Frisky admin auth.",
      emailHint: "Use the email tied to your invite or membership request.",
      trustA: "No shared client-portal cookie",
      trustB: "Invite code ready",
      trustC: "Audit trail on approval"
    },
    es: {
      kicker: "Acceso privado de comunidad",
      body: "Entra con una sesion Neon separada. Fenrir mantiene aislados el portal de clientes, los invites y el estado de membresia.",
      stepIdentity: "Identidad",
      stepIdentityBody: "El enlace por email confirma a la persona.",
      stepInvite: "Invite",
      stepInviteBody: "Las reglas de comunidad deciden la siguiente puerta.",
      stepSession: "Sesion",
      stepSessionBody: "El acceso queda aislado del auth admin Frisky.",
      emailHint: "Usa el correo ligado a tu invite o solicitud.",
      trustA: "Sin cookie compartida del portal",
      trustB: "Invite listo",
      trustC: "Auditoria en aprobacion"
    },
    fr: {
      kicker: "Acces communaute privee",
      body: "Entrez avec une session Neon separee. Fenrir isole le portail client, les invitations et l'etat membre.",
      stepIdentity: "Identite",
      stepIdentityBody: "Le lien email confirme la personne.",
      stepInvite: "Invitation",
      stepInviteBody: "Les regles communaute ouvrent la prochaine porte.",
      stepSession: "Session",
      stepSessionBody: "L'acces reste isole de l'auth admin Frisky.",
      emailHint: "Utilisez l'email lie a votre invitation ou demande.",
      trustA: "Pas de cookie portail partage",
      trustB: "Invitation prete",
      trustC: "Audit a l'approbation"
    },
    de: {
      kicker: "Privater Community-Zugang",
      body: "Betritt die Community mit einer getrennten Neon-Session. Fenrir trennt Client-Portal, Einladungen und Mitgliedsstatus.",
      stepIdentity: "Identitaet",
      stepIdentityBody: "Der E-Mail-Link bestaetigt die Person.",
      stepInvite: "Einladung",
      stepInviteBody: "Community-Regeln bestimmen die naechste Tuer.",
      stepSession: "Session",
      stepSessionBody: "Der Zugang bleibt vom Frisky-Admin-Auth isoliert.",
      emailHint: "Nutze die E-Mail deiner Einladung oder Anfrage.",
      trustA: "Kein geteilter Portal-Cookie",
      trustB: "Einladung bereit",
      trustC: "Audit bei Freigabe"
    }
  }[locale];

  useEffect(() => {
    let cancelled = false;
    void getCommunityAuthProposal().then((next) => {
      if (!cancelled) setProposal(next);
    });
    void getCommunityBrand(slug).then((next) => {
      if (!cancelled) setBrand(next);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setMessageTone("info");
    setDevLink(null);
    try {
      const response = await fetch("/api/community-auth/magic-link/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, slug })
      });
      const body = await response.json().catch(() => null) as { message?: string; devLink?: string; error?: string; detail?: string | { message?: string } } | null;
      if (!response.ok) throw new Error(readableCommunityError(body?.detail, body?.error));
      setMessage(body?.message || ui.neonMagicSuccessMessage);
      setMessageTone("success");
      setDevLink(body?.devLink || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.neonMagicBusy);
      setMessageTone("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthSurface
      theme={theme}
      locale={locale}
      onLocale={onLocale}
      railLabel="Community Gate scope"
      logoUrl={brand?.logo_url}
      backgroundUrl={cleanCommunityAssetUrl(brand?.background_url)}
    >
        <GlowCard className="auth-card" aria-label="Fenrir Community Gate auth">
          <div className="auth-card-header">
            <span className="status good">Community Gate</span>
            <span className="auth-card-kicker">/{slug}</span>
          </div>
          <div className="community-gate-intro">
            <p className="label">{gateText.kicker}</p>
            <h2 className="auth-enter-title" data-text={communityName}>
              <span>{communityName}</span>
            </h2>
            <p>{gateText.body}</p>
          </div>
          <CommunityAuthProposalPanel proposal={proposal} locale={locale} />
          {vercelPreviewWithoutApi ? (
            <div className="auth-disclosure community-preview-warning" role="status">
              <div>
                <b>Preview mode</b>
                <small>API actions are disabled on this Vercel preview so it cannot write to production Community Gate data.</small>
              </div>
              <span className="status amber">Safe preview</span>
            </div>
          ) : null}
          <div className="community-gate-steps" aria-label="Community access steps">
            <section>
              <b>01</b>
              <span>{gateText.stepIdentity}</span>
              <small>{gateText.stepIdentityBody}</small>
            </section>
            <section>
              <b>02</b>
              <span>{gateText.stepInvite}</span>
              <small>{gateText.stepInviteBody}</small>
            </section>
            <section>
              <b>03</b>
              <span>{gateText.stepSession}</span>
              <small>{gateText.stepSessionBody}</small>
            </section>
          </div>
          {oauthError ? <small className="community-auth-message error" role="alert">{oauthError}</small> : null}
          {enabledOAuthProviders.length > 0 ? (
            <div className="community-oauth-providers" aria-label="Social sign-in">
              {enabledOAuthProviders.map((provider) => (
                <a
                  key={provider}
                  className="button-link community-oauth-button"
                  data-provider={provider}
                  href={communityOAuthStartUrl(provider, slug)}
                  rel="nofollow"
                >
                  Continue with {communityAuthProviderLabel(provider)}
                </a>
              ))}
            </div>
          ) : null}
          {enabledOAuthProviders.length > 0 ? (
            <div className="community-oauth-divider" aria-hidden="true"><span>or</span></div>
          ) : null}
          {/* The magic link is unconditional: it needs no provider credentials and is the
              only method that cannot be locked out by a console misconfiguration. */}
          <form className="community-auth-form" onSubmit={requestLink}>
            <label>
              <span>{c.serviceEmail}</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder={ui.communityEmailPlaceholder} autoComplete="email" />
              <small>{gateText.emailHint}</small>
            </label>
            <button className="apple-auth-button community-submit-button" type="submit" disabled={busy || !trimmedEmail}>
              {busy ? ui.neonMagicBusy : ui.neonMagicButton}
            </button>
          </form>
          {message ? <small className={`community-auth-message ${messageTone}`} role="status">{message}</small> : null}
          {devLink ? <a className="button-link ghost community-dev-link" href={devLink}>{ui.neonMagicDevLinkLabel}</a> : null}
          <div className="community-trust-strip" aria-label="Community gate assurances">
            <span>{gateText.trustA}</span>
            <span>{gateText.trustB}</span>
            <span>{gateText.trustC}</span>
          </div>
        </GlowCard>
    </AuthSurface>
  );
}

function readableCommunityError(detail: unknown, fallback?: string) {
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") return detail.message;
  if (typeof detail === "string") return detail;
  return fallback || "Community Gate is not ready yet.";
}

function communityBrandAdminErrorMessage(error: unknown) {
  if (!(error instanceof CommunityBrandRequestError)) {
    return "Network/API failure. The brand workspace could not be loaded.";
  }
  if (error.status === 401 || error.error === "authentication_required") return "Not signed in. Sign in to the Fenrir admin before customizing this Community Gate.";
  if (error.status === 403 || error.error === "forbidden") return "Forbidden. Your account is not an owner or allowlisted admin for this Community Gate.";
  if (error.status === 503 || error.error === "community_auth_not_configured") return readableCommunityError(error.detail, "Missing Community Gate config. Firebase Auth handles sign-in; Neon is only the gate data plane.");
  if (error.error === "community_gate_schema_missing") return "Missing Neon schema. Apply the Community Gate schema before customizing this gate.";
  return `Community Gate load failed: ${error.error || `HTTP ${error.status}`}.`;
}

function AuthGate({ c, locale, onLocale }: { c: Copy; locale: Locale; onLocale: (locale: Locale) => void }) {
  const [authNote, setAuthNote] = useState<string | null>(() => authErrorMessage());
  const [pendingProvider, setPendingProvider] = useState<AuthProvider | null>(null);

  async function signInWithProvider(provider: AuthProvider) {
    setAuthNote(null);
    setPendingProvider(provider);
    try {
      await friskyClientAuthEngine.signInWithProvider(provider);
    } catch {
      setPendingProvider(null);
      setAuthNote(c.authProviderError);
    }
  }

  return (
    <main className="lovable-auth-page" data-login-source="lovable-bd06c2e4">
      <div className="lovable-auth-atmosphere" aria-hidden="true" />
      <div className="lovable-auth-column">
        <LovableAuthTerminal />

        <section className="lovable-auth-card-wrap" aria-label="Fenrir sign-in">
          <div className="lovable-auth-card-glow" aria-hidden="true" />
          <div className="lovable-auth-card-border" aria-hidden="true" />
          <div className="lovable-auth-card">
            <div className="lovable-auth-card-line" aria-hidden="true" />
            <div className="lovable-auth-brand">
              <div className="lovable-auth-mark-shell">
                <img src="/fenrir-splash-icon.svg" alt="MyFenrir logo" />
              </div>
              <img className="lovable-auth-wordmark" src="/fenrir-cut-wordmark.svg" alt="MyFenrir wordmark logo" />
              <h1>Welcome back</h1>
              <p>Sign in to continue to MyFenrir</p>
            </div>

            <div className="lovable-auth-actions">
              {(["apple", "google", "microsoft"] as AuthProvider[]).map((provider) => (
                <AuthProviderButton
                  key={provider}
                  provider={provider}
                  label={`Continue with ${provider === "apple" ? "Apple" : provider === "google" ? "Google" : "Microsoft"}`}
                  disabled={pendingProvider !== null}
                  onClick={() => void signInWithProvider(provider)}
                />
              ))}
            </div>

            {authNote ? <div className="lovable-auth-error" role="alert">{authNote}</div> : null}

            <div className="lovable-auth-divider" aria-hidden="true">
              <span />
              <b>Encrypted sign-in</b>
              <span />
            </div>
            <p className="lovable-auth-new-user">New here? Your account is created automatically on first sign-in.</p>
          </div>
        </section>

        <p className="lovable-auth-legal">
          By continuing you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
        </p>
        <div className="lovable-auth-secured">
          <p>Secured · End-to-end encrypted</p>
          <a href="https://myfenrir.com" aria-label="Powered by MyFenrir">
            <img src="/fenrir-splash-icon.svg" alt="" />
            <span>Powered by MyFenrir</span>
          </a>
        </div>
      </div>
    </main>
  );
}

function LovableAuthTerminal() {
  const lines = ["fenrir --login", "establishing secure channel...", "› providers: apple · google · microsoft", "awaiting identity_"];
  const [visibleLines, setVisibleLines] = useState(1);

  useEffect(() => {
    if (visibleLines >= lines.length) return undefined;
    const timer = window.setTimeout(() => setVisibleLines((current) => current + 1), 420);
    return () => window.clearTimeout(timer);
  }, [visibleLines, lines.length]);

  return (
    <div className="lovable-auth-terminal-wrap" aria-hidden="true">
      <div className="lovable-auth-terminal-glow" />
      <div className="lovable-auth-terminal">
        <div className="lovable-auth-terminal-bar">
          <i /><i /><i />
          <span>auth_session.sh</span>
        </div>
        <div className="lovable-auth-terminal-body">
          {lines.slice(0, visibleLines).map((line, index) => (
            <div key={line} className={`terminal-line terminal-line-${index}`}>
              {index === 0 ? <strong>➜</strong> : null}
              <span>{line}</span>
              {index === visibleLines - 1 && visibleLines < lines.length ? <em /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function authErrorMessage() {
  const error = new URLSearchParams(window.location.search).get("auth_error");
  if (!error) return null;
  const [errorCode, errorDetail] = error.split(":", 2);
  const detail = errorDetail ? decodeURIComponent(errorDetail) : "";

  if (error.startsWith("missing_env:")) {
    return "This provider is not live yet. Use an enabled sign-in option, or refresh to return to the clean Fenrir gate.";
  }
  if (error === "direct_oauth_disabled") {
    return "That old sign-in route was retired. Use the provider buttons on this Fenrir gate.";
  }
  if (errorCode === "oauth_access_denied") {
    return "The provider denied access. Try again and confirm consent to continue with this account.";
  }
  if (errorCode === "oauth_callback_error") {
    return `Provider error while returning from sign-in.${detail ? ` ${detail}` : ""}`;
  }
  if (errorCode === "code_exchange_failed") {
    return `Could not exchange the OAuth callback code. ${detail ? `(${detail})` : "Please try again."}`;
  }
  if (errorCode === "session_lookup_failed") {
    return `Could not read the Frisky login session after login. ${detail ? `(${detail})` : "Please retry from the sign-in screen."}`;
  }
  if (errorCode === "supabase_session_failed") {
    return `Could not open a Fenrir admin session.${detail ? ` (${detail})` : ""}`;
  }
  if (errorCode === "missing_code") {
    return "The provider did not return a sign-in code. Please try again.";
  }
  return "Sign-in could not finish. Try another provider or refresh the page.";
}

function CommunityAuthProposalPanel({ proposal, locale }: { proposal: CommunityAuthProposal | null; locale: Locale }) {
  const text = {
    en: {
      title: "Community Gate auth",
      body: "Fenrir Community Gate uses its own Neon database, tables, and session cookie. It does not share FriskyDev client-portal auth.",
      configured: "Neon ready",
      missing: "Neon env pending"
    },
    es: {
      title: "Auth de Community Gate",
      body: "Fenrir Community Gate usa su propia base Neon, tablas y cookie de sesion. No comparte el auth del portal FriskyDev.",
      configured: "Neon listo",
      missing: "Faltan env de Neon"
    },
    fr: {
      title: "Auth Community Gate",
      body: "Fenrir Community Gate utilise sa propre base Neon, ses tables et son cookie de session. Il ne partage pas l'auth du portail FriskyDev.",
      configured: "Neon pret",
      missing: "Env Neon en attente"
    },
    de: {
      title: "Community Gate Auth",
      body: "Fenrir Community Gate nutzt eine eigene Neon-Datenbank, eigene Tabellen und ein eigenes Session-Cookie. Es teilt nicht das FriskyDev Client-Portal-Auth.",
      configured: "Neon bereit",
      missing: "Neon env fehlt"
    }
  }[locale];

  return (
    <div className="auth-disclosure community-auth-proposal" aria-label={text.title}>
      <div>
        <b>{text.title}</b>
        <small>{text.body}</small>
      </div>
      <span className={`status ${proposal?.configured ? "good" : "amber"}`}>
        {proposal?.configured ? text.configured : text.missing}
      </span>
    </div>
  );
}

function BrandSignature({ c, compact = false }: { c: Copy; compact?: boolean }) {
  return (
    <div className={compact ? "brand-signature compact" : "brand-signature"}>
      <span>{c.friskyForged}</span>
      <span>
        {c.friskyMagicPrefix} <strong>Fenrir Protocol</strong> {c.friskyMagicSuffix}
      </span>
      <small>{c.friskyCompany}</small>
    </div>
  );
}

function LegalPage({ c, locale, onLocale }: { c: Copy; locale: Locale; onLocale: (locale: Locale) => void }) {
  const updated = "May 7, 2026";
  return (
    <main className="legal-page">
      <section className="legal-hero">
        <a className="legal-brand" href="/">
          <img src="/fenrir-cut-wordmark.svg" alt="Fenrir" />
        </a>
        <div>
          <span className="status good">{c.legalStatus}</span>
          <h1>{c.legalTitle}</h1>
          <p>{c.legalSub}</p>
          <BrandSignature c={c} compact />
          <small>{c.lastUpdated}: {updated}</small>
        </div>
        <select className="language-select" value={locale} onChange={(event) => onLocale(event.target.value as Locale)} aria-label="Language">
          {locales.map((item) => (
            <option value={item} key={item}>{languageNames[item]}</option>
          ))}
        </select>
      </section>

      <section className="legal-shell">
        <aside className="legal-index">
          <a href="#terms">{c.terms}</a>
          <a href="#privacy">{c.privacy}</a>
          <a href="#acceptable-use">{c.acceptableUse}</a>
          <a href="#payments">{c.paymentsRefunds}</a>
          <a href="#contact">{c.legalContact}</a>
        </aside>

        <div className="legal-doc">
          <article id="terms">
            <h2>{c.terms}</h2>
            {c.legalTermsBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="privacy">
            <h2>{c.privacy}</h2>
            {c.legalPrivacyBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="acceptable-use">
            <h2>{c.acceptableUse}</h2>
            {c.legalAcceptableUseBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="payments">
            <h2>{c.paymentsRefunds}</h2>
            {c.legalPaymentsBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="contact">
            <h2>{c.legalContact}</h2>
            {c.legalContactBody.map((text) => <p key={text}>{text}</p>)}
            <p className="legal-note">{c.legalNote}</p>
          </article>
        </div>
      </section>
    </main>
  );
}

function FenrirSilhouette({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 640 520" role="img" aria-label="Fenrir silhouette">
      <defs>
        <linearGradient id="fenrirFur" x1="120" y1="80" x2="520" y2="480" gradientUnits="userSpaceOnUse">
          <stop stopColor="#050607" />
          <stop offset="0.48" stopColor="#16080c" />
          <stop offset="1" stopColor="#331018" />
        </linearGradient>
        <linearGradient id="fenrirEdge" x1="118" y1="80" x2="530" y2="430" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff1744" stopOpacity="0.88" />
          <stop offset="0.48" stopColor="#f1b75c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#22c7a8" stopOpacity="0.42" />
        </linearGradient>
        <filter id="fenrirShadow" x="-20%" y="-20%" width="140%" height="150%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="34" stdDeviation="24" floodColor="#000000" floodOpacity="0.62" />
          <feDropShadow dx="0" dy="0" stdDeviation="12" floodColor="#ff1744" floodOpacity="0.26" />
        </filter>
      </defs>
      <path
        className="silhouette-edge"
        d="M88 390c58-28 92-58 122-112 19-34 27-67 43-108 7-19 20-52 38-98 14 35 24 61 30 78 38-45 83-78 136-102-9 52-14 91-13 118 44 13 76 33 97 62 19 26 25 57 17 94 28 18 45 39 52 64-39-11-77-13-114-6-45 9-83 28-116 58-53 48-116 65-188 50-49-10-84-42-104-98Z"
      />
      <path
        d="M106 382c51-29 82-58 111-110 18-33 26-68 42-110 7-17 16-41 29-72 13 40 23 70 31 90 32-46 72-79 119-99-9 44-12 77-8 99 42 12 73 31 92 57 18 24 23 53 15 87 24 14 39 30 47 48-29-9-64-10-105-2-44 8-83 28-118 59-50 45-107 59-172 43-42-11-70-41-83-90Z"
        fill="url(#fenrirFur)"
        filter="url(#fenrirShadow)"
      />
      <path
        d="M320 183c31-45 65-72 102-83-13 37-18 67-13 90 42 8 72 25 88 50-50-10-94 0-132 32-35 29-73 42-114 39 30-21 53-64 69-128Z"
        fill="#06070a"
        opacity="0.82"
      />
      <path
        d="M421 236c24-4 43 2 58 17-28-2-50 2-67 13-14 9-28 16-43 20 11-22 28-38 52-50Z"
        fill="#10070b"
      />
      <path d="M443 235l42 8-35 15-28-2 21-21Z" fill="#ff334e" opacity="0.94" />
      <path d="M483 250c10 9 18 22 22 38-20-14-41-19-64-15l42-23Z" fill="#050607" opacity="0.9" />
      <path d="M189 370c41 24 86 33 136 26 47-7 90-26 128-56" stroke="url(#fenrirEdge)" strokeWidth="8" strokeLinecap="round" opacity="0.48" />
      <path d="M268 91c15 43 27 77 35 103" stroke="url(#fenrirEdge)" strokeWidth="6" strokeLinecap="round" opacity="0.46" />
    </svg>
  );
}

function ProtocolLivingSystem({ state, c }: { state: AppState; c: Copy }) {
  const activeLocks = state.bridges.filter((bridge) => bridge.status === "active").length;
  const verifiedDomains = state.domains.filter((domain) => domain.status === "verified").length;
  const activeRooms = state.liveRooms.filter((room) => room.status === "active").length;
  const readyChecks = state.telegramChecks.filter((check) => check.status === "ready").length;
  const protocolScore = Math.min(100, 42 + activeLocks * 14 + verifiedDomains * 16 + activeRooms * 10 + readyChecks * 8);

  return (
    <section className="living-system" aria-label="Fenrir Protocol living system">
      <div className="system-stage">
        <div className="sigil-core" aria-hidden="true">
          <span className="sigil-ring ring-a" />
          <span className="sigil-ring ring-b" />
          <span className="sigil-letter">F</span>
        </div>
        <div className="node-row">
          {c.protocolNodes.map((node, index) => (
            <span className="protocol-node" style={{ animationDelay: `${index * 160}ms` }} key={node}>
              {node}
            </span>
          ))}
        </div>
        <div className="signal-lanes" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="system-copy">
        <p className="label">{c.protocolLabel}</p>
        <h2>{c.protocolTitle}</h2>
        <p>{c.protocolBody}</p>
        <div className="protocol-score">
          <div>
            <span>{c.protocolHeat}</span>
            <b>{protocolScore}%</b>
          </div>
          <meter min="0" max="100" value={protocolScore}>{protocolScore}%</meter>
        </div>
      </div>

      <div className="pulse-feed">
        {c.pulseEvents.map((event, index) => (
          <div className="pulse-item" style={{ animationDelay: `${index * 220}ms` }} key={event}>
            <span />
            <b>{event}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClientWalkthroughPanel({ c, ui }: { c: Copy; ui: typeof uiCopy[Locale] }) {
  const flows = [
    {
      id: "visitor",
      label: ui.walkthroughClientLabel,
      title: ui.walkthroughClientTitle,
      body: ui.walkthroughClientBody,
      quote: ui.walkthroughClientQuote,
      steps: ui.walkthroughStepsClient,
      active: 1
    },
    {
      id: "admin",
      label: ui.walkthroughAdminLabel,
      title: ui.walkthroughAdminTitle,
      body: ui.walkthroughAdminBody,
      quote: ui.walkthroughAdminQuote,
      steps: ui.walkthroughStepsAdmin,
      active: 2
    },
    {
      id: "launch",
      label: ui.walkthroughLaunchLabel,
      title: ui.walkthroughLaunchTitle,
      body: ui.walkthroughLaunchBody,
      quote: ui.walkthroughLaunchQuote,
      steps: ui.walkthroughStepsLaunch,
      active: 3
    }
  ] as const;
  const [activeFlow, setActiveFlow] = useState<(typeof flows)[number]["id"]>("visitor");
  const flow = flows.find((item) => item.id === activeFlow) ?? flows[0];

  return (
    <section className="client-walkthrough" aria-label={ui.walkthroughLabel}>
      <div className="walkthrough-tabs" role="tablist" aria-label={ui.walkthroughModeLabel}>
        {flows.map((item) => (
          <button
            aria-selected={item.id === flow.id}
            className={item.id === flow.id ? "active" : ""}
            key={item.id}
            onClick={() => setActiveFlow(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="walkthrough-frame">
        <div className="walkthrough-copy">
          <p className="label">{ui.walkthroughPillsText}</p>
          <h2>{flow.title}</h2>
          <p>{flow.body}</p>
          <blockquote>{flow.quote}</blockquote>
        </div>

          <div className={`walkthrough-map flow-${flow.id}`} aria-label={`${flow.label} ${ui.walkthroughNodeMapLabel}`}>
          <svg className="walkthrough-lines" viewBox="0 0 760 300" role="img" aria-label="Fenrir route from public link to private destination">
            <defs>
              <linearGradient id={`walkthroughGradient-${flow.id}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#ff334e" />
                <stop offset="52%" stopColor="#f1b75c" />
                <stop offset="100%" stopColor="#22c7a8" />
              </linearGradient>
            </defs>
            <path className="walkthrough-path shadow" d="M90 150 C190 76 260 222 374 150 S560 70 672 150" />
            <path className="walkthrough-path signal" d="M90 150 C190 76 260 222 374 150 S560 70 672 150" stroke={`url(#walkthroughGradient-${flow.id})`} />
            <circle className="walkthrough-packet packet-a" cx="90" cy="150" r="5" />
            <circle className="walkthrough-packet packet-b" cx="90" cy="150" r="4" />
          </svg>

          {flow.steps.map((step, index) => (
            <div className={`walkthrough-node walkthrough-node-${index} ${index === flow.active ? "current" : ""}`} key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{step}</b>
            </div>
          ))}

          <div className="walkthrough-center">
            <img src="/fenrir-splash-icon.svg" alt="" />
            <b>{ui.myFenrirLabel}</b>
            <small>{ui.routeToPrivateDestination}</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function SetupInboxWizard({
  onStart,
  c,
  ui
}: {
  onStart: (kind: "telegram" | "room" | "vault" | "domain" | "concierge") => void;
  c: Copy;
  ui: typeof uiCopy[Locale];
}) {
  const options: Array<{ id: "telegram" | "room" | "vault" | "domain" | "concierge"; title: string; body: string; step: string }> = [
    {
      id: "telegram",
      title: c.inboxStepTelegram,
      body: c.inboxStepTelegramBody,
      step: c.inboxStepTelegramNeed
    },
    {
      id: "room",
      title: c.inboxStepRoom,
      body: c.inboxStepRoomBody,
      step: c.inboxStepRoomNeed
    },
    {
      id: "vault",
      title: c.inboxStepVault,
      body: c.inboxStepVaultBody,
      step: c.inboxStepVaultNeed
    },
    {
      id: "domain",
      title: c.inboxStepDomain,
      body: c.inboxStepDomainBody,
      step: c.inboxStepDomainNeed
    },
    {
      id: "concierge",
      title: c.inboxStepConcierge,
      body: c.inboxStepConciergeBody,
      step: c.inboxStepConciergeNeed
    }
  ];
  const [active, setActive] = useState<string | null>(null);

  return (
      <section className="panel wide frictionless-wizard inbox-wizard">
        <div className="wizard-copy">
          <span className="status good">{ui.clientExplanation}</span>
        <h2>{c.inboxHeading}</h2>
        <p>{c.inboxBody}</p>
      </div>
      <div className="inbox-thread">
        <span className="inbox-bubble assistant">
          {ui.assistantPrompt}
        </span>
        {active ? (
          <span className="inbox-bubble user">Start: {options.find((option) => option.id === active)?.title}</span>
        ) : null}
      </div>
      <div className="wizard-options">
        {options.map((option) => (
          <button key={option.id} type="button" onClick={() => {
            setActive(option.id);
            onStart(option.id);
          }}>
            <span>{option.step}</span>
            <b>{option.title}</b>
            <small>{option.body}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ExampleDiagramCard({ c, ui }: { c: Copy; ui: typeof uiCopy[Locale] }) {
  const nodes = [
    ["Private target", "Telegram invite / room link stays hidden"],
    ["Fenrir Bridge", "Checks identity, payment state, and revocation rules"],
    ["Public front door", "your-domain.com/client-launch"],
    ["Client path", "Allowed users continue, blocked users stop"]
  ];

  return (
    <section className="example-diagram-card" aria-label="Example diagram">
      <div className="diagram-copy">
        <p className="label">Example only</p>
        <h2>{ui.linkConversion}</h2>
        <p>This diagram shows the client story without creating or exposing a real link.</p>
      </div>

      <div className="diagram-flow">
        {nodes.map(([label, detail], index) => (
          <div className="diagram-node" key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <b>{label}</b>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      <div className="diagram-steps">
        {[ui.rawLinkHidden, c.chooseDomain, ui.cloudflareSsl, ui.publicUrlReady].map((step, index) => (
          <div className="complete" key={step}>
            <span>{index + 1}</span>
            <b>{step}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function CashoutPipeline({ c, onStars }: { c: Copy; onStars: () => void }) {
  return (
    <section className="cashout-panel" aria-label="Cashout pipeline">
        <div className="cashout-copy">
          <span className="status good">{c.cashoutLabel}</span>
          <h2>{c.cashoutTitle}</h2>
          <p>{c.cashoutSub}</p>
          <div className="cashout-actions">
            <button onClick={onStars}>{c.starsCheckout}</button>
          </div>
        </div>
      <div className="cashout-flow">
        {c.cashoutSteps.map((step, index) => (
          <div className="cashout-step" key={step[0]}>
            <span>{index + 1}</span>
            <b>{step[0]}</b>
            <small>{step[1]}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountServicePanel({
  c,
  email,
  org,
  telegram,
  subdomain,
  mode,
  checkoutPlan,
  courtesyCode,
  onCourtesyCode,
  onEmail,
  onOrg,
  onTelegram,
  onSubdomain,
  onStart,
  onStars
}: {
  c: Copy;
  email: string;
  org: string;
  telegram: string;
  subdomain: string;
  mode: "create" | "link" | null;
  checkoutPlan: PaidPlan;
  courtesyCode: string;
  onCourtesyCode: (value: string) => void;
  onEmail: (value: string) => void;
  onOrg: (value: string) => void;
  onTelegram: (value: string) => void;
  onSubdomain: (value: string) => void;
  onStart: (mode: "create" | "link") => void;
  onStars: () => void;
}) {
  return (
    <section className="panel wide service-panel">
      <PanelTitle title={c.serviceTitle} subtitle={c.serviceSub} />
      <div className="service-grid">
        <div className="service-form">
          <label>
            <span>{c.serviceEmail}</span>
            <input value={email} onChange={(event) => onEmail(event.target.value)} />
          </label>
          <label>
            <span>{c.serviceOrg}</span>
            <input value={org} onChange={(event) => onOrg(event.target.value)} />
          </label>
          <label>
            <span>{c.serviceTelegram}</span>
            <input value={telegram} onChange={(event) => onTelegram(event.target.value)} />
          </label>
          <label>
            <span>{c.serviceDomain}</span>
            <input value={subdomain} onChange={(event) => onSubdomain(event.target.value)} />
          </label>
          <label>
            <span>Admin courtesy code (optional)</span>
            <input value={courtesyCode} onChange={(event) => onCourtesyCode(event.target.value)} placeholder="One-use code" autoComplete="off" />
          </label>
        </div>

        <div className="stripe-mvp-card">
          <span className="status amber">{c.stripeMode}</span>
          <h3>{checkoutPlan.charAt(0).toUpperCase() + checkoutPlan.slice(1)}</h3>
          <p>{c.checkoutReady}</p>
          <div className="stars-bridge">
            <span className="status good">{c.starsMode}</span>
            <p>{c.starsCheckoutBody}</p>
          </div>
          <div className="service-actions">
            <button onClick={() => onStart("create")}>{c.createAccount}</button>
            <button className="secondary" onClick={() => onStart("link")}>{c.linkAccount}</button>
            <button onClick={onStars}>{c.starsCheckout}</button>
          </div>
          <small>{mode ? `${mode === "create" ? c.createAccount : c.linkAccount}: ${email}` : c.serviceWaitingAction}</small>
        </div>
      </div>

      <div className="service-steps">
        {c.serviceSteps.map((step, index) => (
          <div className={mode || index === 0 ? "complete" : ""} key={step}>
            <span>{index + 1}</span>
            <b>{step}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function absoluteVaultUrl(value: string) {
  return absoluteUrl(value);
}

function buildVaultLinks(
  bridges: FriskyBridge[],
  rooms: FriskyLiveRoom[],
  personalLinks: PersonalLink[],
  commissionLinks: FriskyCommissionLink[] = []
): VaultLink[] {
  return [
    ...bridges.map((bridge) => ({
      id: bridge.id,
      title: bridge.telegramGroupName,
      url: bridge.publicUrl,
      kind: "telegram",
      status: bridge.status
    })),
    ...rooms.map((room) => ({
      id: room.id,
      title: room.title,
      url: room.publicUrl,
      kind: room.provider,
      status: room.status
    })),
    ...commissionLinks
      .filter((link) => link.status === "active" || link.partnerStatus === "recommended" || link.partnerStatus === "approved")
      .map((link) => ({
        id: link.id,
        title: link.label,
        url: absoluteVaultUrl(link.url),
        kind: link.category,
        status: link.partnerStatus
      })),
    ...personalLinks
  ].filter((link) => Boolean(absoluteVaultUrl(link.url)));
}

function createVaultShareUrl(links: VaultLink[]) {
  const payload = encodeVaultLinks(links);
  return `${window.location.origin}/vault?v=${payload}`;
}

function encodeVaultLinks(links: VaultLink[]) {
  const payload = JSON.stringify({
    v: 1,
    links: links.slice(0, 40).map((link) => ({
      id: link.id,
      title: link.title,
      url: absoluteUrl(link.url),
      kind: link.kind,
      status: link.status
    }))
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeVaultLinks() {
  const payload = new URLSearchParams(window.location.search).get("v");
  if (!payload) return [];
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { links?: VaultLink[] };
      return (parsed.links ?? [])
      .slice(0, 40)
      .map((link) => ({
        id: String(link.id || `vault_${link.url}`),
        title: String(link.title || "Fenrir link").slice(0, 90),
        url: absoluteUrl(String(link.url || "")),
        kind: String(link.kind || "link").slice(0, 32),
        status: String(link.status || "active").slice(0, 32)
      }))
      .filter((link) => link.url);
  } catch {
    return [];
  }
}

function PublicVaultPage({ links, c, ui }: { links: VaultLink[]; c: Copy; ui: typeof uiCopy[Locale] }) {
  return (
    <main className="join-page vault-public-page">
      <section className="join-card vault-public-card">
        <span className="mark">
          <img src="/fenrir-splash-icon.svg" alt="" />
        </span>
        <p className="label">{c.linkVaultTitle}</p>
        <h1>{ui.selectedShareHeading}</h1>
        <p>{ui.selectedShareCopy}</p>
        {links.length ? (
          <div className="vault-public-grid">
            {links.map((link) => (
              <a className={`vault-public-link ${link.kind}`} href={link.url} key={`${link.id}-${link.url}`}>
                <span>{link.kind}</span>
                <b>{link.title}</b>
                <code>{link.url}</code>
                <small>{link.status}</small>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <b>{ui.noVaultLinks}</b>
            <small>{`${ui.selectedLinksPrompt} ${c.linkVaultTitle}.`}</small>
          </div>
        )}
      </section>
    </main>
  );
}

function LinkVaultPanel({
  c,
  ui,
  bridges,
  rooms,
  personalLinks,
  commissionLinks,
  title,
  url,
  kind,
  onTitle,
  onUrl,
  onKind,
  onAdd,
  onShare,
  onOpen
}: {
  c: Copy;
  ui: typeof uiCopy[Locale];
  bridges: FriskyBridge[];
  rooms: FriskyLiveRoom[];
  personalLinks: PersonalLink[];
  commissionLinks: FriskyCommissionLink[];
  title: string;
  url: string;
  kind: PersonalLink["kind"];
  onTitle: (value: string) => void;
  onUrl: (value: string) => void;
  onKind: (value: PersonalLink["kind"]) => void;
  onAdd: () => void;
  onShare: (links: VaultLink[]) => void;
  onOpen: (link: VaultLink) => void;
}) {
  const allLinks = buildVaultLinks(bridges, rooms, personalLinks, commissionLinks);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedLinks = allLinks.filter((link) => selectedIds.includes(link.id));
  const shareableLinks = selectedIds.length ? selectedLinks : allLinks;
  const openVaultLink = (link: VaultLink) => {
    onOpen(link);
  };
  const onOpenKey = (event: KeyboardEvent<HTMLElement>, link: VaultLink) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(link);
    }
  };

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(allLinks.map((link) => link.id));
      const next = current.filter((id) => availableIds.has(id));
      return next.length ? next : allLinks.map((link) => link.id);
    });
  }, [allLinks.map((link) => link.id).join("|")]);

  function toggleVaultLink(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <section className="panel wide link-vault-panel">
      <PanelTitle title={c.linkVaultTitle} subtitle={c.linkVaultSub} />
      <div className="vault-share-strip">
        <div>
          <span className="status good">{ui.linkVaultLabel}</span>
          <b>{ui.forSharingSelectedLinks}</b>
          <small>{ui.publicVaultIncludes}</small>
        </div>
        <button onClick={() => onShare(shareableLinks)}>{c.shareVault}</button>
      </div>
      <div className="link-vault-layout">
        <div className="link-map" aria-label="All links visualization">
          <div className="link-hub">
            <img src="/fenrir-splash-icon.svg" alt="" />
            <b>{ui.myFenrirLabel}</b>
          </div>
            {allLinks.slice(0, 8).map((link, index) => (
                <div
                  role="button"
                tabIndex={0}
                className={`link-node node-${index} click-target`}
                onClick={() => openVaultLink(link)}
                onKeyDown={(event) => onOpenKey(event, link)}
                aria-label={`${c.openCall} ${link.title}`}
                key={link.id}
              >
                <span>{link.kind}</span>
                <b>{link.title}</b>
              </div>
            ))}
          </div>

        <div className="personal-link-form">
          <h3>{c.addAnyLink}</h3>
          <p className="link-form-help">{ui.personalLinkHelp}</p>
          <label className="field-stack">
            <span>{ui.personalLinkTitleLabel}</span>
            <input
              value={title}
              onChange={(event) => onTitle(event.target.value)}
              aria-label={ui.personalLinkTitleLabel}
              placeholder={ui.personalLinkTitlePlaceholder}
            />
          </label>
          <label className="field-stack">
            <span>{ui.personalLinkUrlLabel}</span>
            <input
              value={url}
              onChange={(event) => onUrl(event.target.value)}
              aria-label={ui.personalLinkUrlLabel}
              placeholder={ui.personalLinkUrlPlaceholder}
            />
          </label>
          <label className="field-stack">
            <span>{ui.personalLinkKindLabel}</span>
            <select value={kind} onChange={(event) => onKind(event.target.value as PersonalLink["kind"])} aria-label={ui.personalLinkKindLabel}>
              <option value="payment">{c.linkKinds.payment}</option>
              <option value="docs">{c.linkKinds.docs}</option>
              <option value="booking">{c.linkKinds.booking}</option>
              <option value="support">{c.linkKinds.support}</option>
              <option value="other">{c.linkKinds.other}</option>
            </select>
          </label>
          <button onClick={onAdd}>{c.addLink}</button>
        </div>
      </div>

      <div className="all-links-grid">
        {allLinks.map((link) => (
          <article
            className={`unified-link-card ${link.kind} click-target`}
            key={link.id}
            role="button"
            tabIndex={0}
            onClick={() => openVaultLink(link)}
            onKeyDown={(event) => onOpenKey(event, link)}
                aria-label={`${c.openCall} ${link.title}`}
          >
            <label className="vault-share-toggle">
              <input
                checked={selectedIds.includes(link.id)}
                onChange={() => toggleVaultLink(link.id)}
                type="checkbox"
              />
              <span>{selectedIds.includes(link.id) ? ui.share : ui.hidden}</span>
            </label>
            <span>{link.kind}</span>
            <b>{link.title}</b>
            <code>{link.url}</code>
            <small>{link.status}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function FaqPanel({ c }: { c: Copy }) {
  return (
    <section className="panel wide faq-panel">
      <PanelTitle title={c.faqTitle} subtitle={c.faqSub} />
      <div className="faq-grid">
        {c.faqs.map((item, index) => (
          <details className="faq-item" key={item[0]} open={index < 2}>
            <summary>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{item[0]}</b>
            </summary>
            <p>{item[1]}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function operatorReadinessBanner(
  c: Copy,
  r: ReadinessPayload
): { text: string; tone: "good" | "danger" } {
  if (r.app.readyForPaidUsers) {
    return { text: c.operatorReadyForPaidUsers, tone: "good" };
  }
  const { auth, billing } = r;
  if (!auth.googleConfigured || !auth.microsoftConfigured || !auth.appleConfigured) {
    return { text: c.operatorOAuthMissing, tone: "danger" };
  }
  if (!billing.d1Configured) {
    return { text: c.operatorMissingSecrets, tone: "danger" };
  }
  if (!billing.neonConfigured) {
    return { text: c.operatorMissingSecrets, tone: "danger" };
  }
  const telegramRailReady = billing.telegramStarsConfigured && billing.telegramWebhookSecretConfigured;
  if (!telegramRailReady) {
    return { text: c.operatorMissingSecrets, tone: "danger" };
  }
  return { text: c.operatorMissingSecrets, tone: "danger" };
}

function ProductionReadinessPanel({
  c,
  readiness,
  loadFailed
}: {
  c: Copy;
  readiness: ReadinessPayload | null;
  loadFailed: boolean;
}) {
  if (loadFailed && !readiness) {
    return (
      <section className="panel wide readiness-panel">
        <PanelTitle title={c.adminSetupTitle} subtitle={c.adminSetupSub} />
        <p className="muted">{c.readinessLoadError}</p>
      </section>
    );
  }
  if (!readiness) return null;
  const banner = operatorReadinessBanner(c, readiness);
  const rows: { ok: boolean; label: string }[] = [
    { ok: readiness.auth.googleConfigured, label: c.checklistGoogleOAuth },
    { ok: readiness.auth.microsoftConfigured, label: c.checklistMicrosoftOAuth },
    { ok: readiness.auth.appleConfigured, label: c.checklistAppleOAuth },
    { ok: readiness.billing.telegramStarsConfigured, label: c.checklistTelegramStars },
    { ok: readiness.billing.telegramWebhookSecretConfigured, label: c.checklistTelegramWebhook },
    { ok: readiness.billing.d1Configured, label: c.checklistD1 },
    { ok: readiness.billing.neonConfigured, label: c.checklistNeon }
  ];
  return (
    <section className="panel wide readiness-panel" aria-label={c.adminSetupTitle}>
      <PanelTitle title={c.adminSetupTitle} subtitle={c.adminSetupSub} />
      <div className={`readiness-banner ${banner.tone}`} role="status">
        {banner.text}
      </div>
      <ul className="readiness-checklist">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span className={`status ${row.ok ? "good" : "danger"}`}>{row.ok ? c.readinessRowOk : c.readinessRowMissing}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <section className={`metric ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </section>
  );
}

function LaunchWowConsole({
  state,
  locale,
  selectedDomain,
  selectedDomainTags,
  roomProvider,
  onDomain,
  onRoom,
  onCommunity
}: {
  state: AppState;
  locale: Locale;
  selectedDomain?: FriskyDomain | null;
  selectedDomainTags: string[];
  roomProvider: LiveRoomProvider;
  onDomain: () => void;
  onRoom: () => void;
  onCommunity: () => void;
}) {
  const verifiedDomains = state.domains.filter((domain) => domain.status === "verified").length;
  const activeRooms = state.liveRooms.filter((room) => room.status === "active").length;
  const activeLocks = state.bridges.filter((bridge) => bridge.status === "active").length;
  const provider = liveRoomProviders.find((item) => item.id === roomProvider) ?? liveRoomProviders[0];
  const copyByLocale = {
    en: {
      title: "Launch Command Center",
      body: "Three fast actions turn Fenrir from setup screen into a branded access product.",
      domain: "Publish a smart domain",
      domainBody: "Add tags, verification records, and a clear DNS path in one pass.",
      room: "Brand a live room",
      roomBody: "Pick a meeting provider, logo preset, and stable Fenrir room link.",
      community: "Shape community login",
      communityBody: "Edit the public gate while the preview shows exactly what visitors see.",
      actionDomain: "Open Domain Wizard",
      actionRoom: "Open Live Rooms",
      actionCommunity: "Open Community Bridge",
      verified: "verified",
      locks: "locks",
      rooms: "rooms"
    },
    es: {
      title: "Launch Command Center",
      body: "Tres acciones convierten Fenrir de setup tecnico a producto de acceso con marca.",
      domain: "Publica un dominio inteligente",
      domainBody: "Agrega tags, records de verificacion y una ruta DNS clara en un solo paso.",
      room: "Dale marca a una live room",
      roomBody: "Elige provider, logo preset y link estable de Fenrir para la sala.",
      community: "Disena el login comunitario",
      communityBody: "Edita la puerta publica mientras el preview muestra lo que ve la gente.",
      actionDomain: "Abrir Domain Wizard",
      actionRoom: "Abrir Live Rooms",
      actionCommunity: "Abrir Community Bridge",
      verified: "verificados",
      locks: "locks",
      rooms: "salas"
    },
    fr: {
      title: "Launch Command Center",
      body: "Trois actions transforment Fenrir en produit d'acces marque.",
      domain: "Publier un domaine intelligent",
      domainBody: "Ajoutez tags, verification DNS et chemin clair en une seule passe.",
      room: "Marquer une live room",
      roomBody: "Choisissez provider, logo et lien Fenrir stable.",
      community: "Personnaliser le login communaute",
      communityBody: "Editez la porte publique avec un apercu visiteur.",
      actionDomain: "Ouvrir Domain Wizard",
      actionRoom: "Ouvrir Live Rooms",
      actionCommunity: "Ouvrir Community Bridge",
      verified: "verifies",
      locks: "locks",
      rooms: "rooms"
    },
    de: {
      title: "Launch Command Center",
      body: "Drei Aktionen machen Fenrir vom Setup zum gebrandeten Access-Produkt.",
      domain: "Smart Domain veroeffentlichen",
      domainBody: "Tags, DNS-Verifikation und klarer Setup-Pfad in einem Schritt.",
      room: "Live Room branden",
      roomBody: "Provider, Logo-Preset und stabilen Fenrir-Room-Link waehlen.",
      community: "Community Login gestalten",
      communityBody: "Public Gate bearbeiten und Besucher-Preview sehen.",
      actionDomain: "Domain Wizard oeffnen",
      actionRoom: "Live Rooms oeffnen",
      actionCommunity: "Community Bridge oeffnen",
      verified: "verifiziert",
      locks: "locks",
      rooms: "rooms"
    }
  }[locale];

  return (
    <section className="launch-wow-console" aria-label="Launch Command Center">
      <div className="launch-wow-copy">
        <span className="launch-wow-status">Ready for go-live</span>
        <h2>{copyByLocale.title}</h2>
        <p>{copyByLocale.body}</p>
        <div className="launch-wow-kpis" aria-label="Launch metrics">
          <span><b>{verifiedDomains}</b>{copyByLocale.verified}</span>
          <span><b>{activeLocks}</b>{copyByLocale.locks}</span>
          <span><b>{activeRooms}</b>{copyByLocale.rooms}</span>
        </div>
      </div>
      <div className="launch-wow-actions">
        <button type="button" className="launch-wow-card domain" onClick={onDomain}>
          <span className="launch-wow-icon">DNS</span>
          <b>{copyByLocale.domain}</b>
          <small>{copyByLocale.domainBody}</small>
          <em>{selectedDomain?.domain ?? "your-domain.com"}</em>
          <span className="launch-wow-tags">
            {(selectedDomainTags.length ? selectedDomainTags : ["launch", "vip"]).slice(0, 3).map((tag) => <i key={tag}>#{tag}</i>)}
          </span>
          <strong>{copyByLocale.actionDomain}</strong>
        </button>
        <button type="button" className="launch-wow-card room" onClick={onRoom}>
          <ProviderBadge provider={provider.id} c={copy[locale]} />
          <b>{copyByLocale.room}</b>
          <small>{copyByLocale.roomBody}</small>
          <em>{provider.name}</em>
          <strong>{copyByLocale.actionRoom}</strong>
        </button>
        <button type="button" className="launch-wow-card community" onClick={onCommunity}>
          <span className="login-preview-mini" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <b>{copyByLocale.community}</b>
          <small>{copyByLocale.communityBody}</small>
          <em>/community/neon-nexus</em>
          <strong>{copyByLocale.actionCommunity}</strong>
        </button>
      </div>
    </section>
  );
}

function KeyValue({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <code title={title ?? value}>{value}</code>
    </div>
  );
}

function LiveDomainSearchPanel({
  value,
  results,
  busy,
  mode,
  meta,
  queue,
  onValue,
  onMode,
  onSearch,
  onPick,
  onSendPromising,
  onClearQueue,
  onOpenRegistrar
}: {
  value: string;
  results: DomainSearchResult[];
  busy: boolean;
  mode: "front-door" | "exact";
  meta: { checkedAt: string; viaFallback: boolean } | null;
  queue: string[];
  onValue: (value: string) => void;
  onMode: (mode: "front-door" | "exact") => void;
  onSearch: () => void;
  onPick: (domain: string) => void;
  onSendPromising: () => void;
  onClearQueue: () => void;
  onOpenRegistrar: (domain: string) => void;
}) {
  const preview = mode === "front-door" ? frontDoorCandidates(value, { limit: 6 }) : domainSearchCandidates(value).slice(0, 6);
  const promisingCount = results.filter((result) => result.promising).length;

  return (
    <div className="live-domain-search" aria-label="Live domain search">
      <div className="live-domain-search-head">
        <div>
          <span className="launch-wow-status">Live domain search</span>
          <h3>Find a clean Fenrir front door before you wire DNS.</h3>
          <p>Checks public DNS now, then sends promising names into the domain wizard.</p>
        </div>
        <div className="live-domain-search-form">
          <input
            value={value}
            onChange={(event) => onValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
            }}
            aria-label="Search domains live"
            placeholder="brand, community, or full domain"
          />
          <button type="button" disabled={busy} onClick={onSearch}>
            {busy ? "Checking DNS + RDAP..." : "Search live"}
          </button>
        </div>
      </div>

      <div className="live-domain-search-modes" role="group" aria-label="Search mode">
        <button
          type="button"
          className={`compact-button ${mode === "front-door" ? "secondary" : "ghost"}`}
          onClick={() => onMode("front-door")}
        >
          Front-door variants
        </button>
        <button
          type="button"
          className={`compact-button ${mode === "exact" ? "secondary" : "ghost"}`}
          onClick={() => onMode("exact")}
        >
          Exact name
        </button>
        {meta && (
          <small className="muted">
            Checked {new Date(meta.checkedAt).toLocaleTimeString()}
            {meta.viaFallback ? " · resolved from this browser" : ""}
          </small>
        )}
      </div>

      {results.length > 0 && (
        <div className="live-domain-handoff" aria-label="Wizard handoff">
          <span className="status good">{promisingCount} clean</span>
          <button type="button" className="compact-button" disabled={!promisingCount} onClick={onSendPromising}>
            Send clean names to the wizard
          </button>
          {queue.length > 0 && (
            <>
              <span className="muted">Queued: {queue.join(", ")}</span>
              <button type="button" className="ghost compact-button" onClick={onClearQueue}>
                Clear
              </button>
            </>
          )}
        </div>
      )}

      <div className="live-domain-results" aria-label="Domain search results">
        {results.length
          ? results.map((result) => {
              const evidence = domainEvidence(result);
              return (
                <article className={`live-domain-result ${result.verdict}`} key={result.domain}>
                  <div>
                    <b>{result.domain}</b>
                    <span className={`status ${domainVerdictTones[result.verdict]}`}>{domainVerdictLabels[result.verdict]}</span>
                  </div>
                  <p>{result.summary}</p>
                  <small>{evidence || "No public DNS records."}</small>
                  {result.flags.length > 0 && (
                    <small className="live-domain-flags">
                      {result.flags.map((flag) => domainFlagLabels[flag] ?? flag).join(" · ")}
                    </small>
                  )}
                  <div className="row-actions">
                    <button
                      type="button"
                      className="secondary compact-button"
                      disabled={!result.promising}
                      title={result.promising ? "Load into the domain wizard" : "Only clean, buyable names go to the wizard"}
                      onClick={() => onPick(result.domain)}
                    >
                      Use in wizard
                    </button>
                    <button type="button" className="ghost compact-button" onClick={() => onOpenRegistrar(result.domain)}>
                      Check registrar
                    </button>
                  </div>
                </article>
              );
            })
          : preview.map((domain) => (
              <article className="live-domain-result pending" key={domain}>
                <div>
                  <b>{domain}</b>
                  <span className="status blue">Not checked</span>
                </div>
                <p>Run the live search to query public DNS and the registry.</p>
              </article>
            ))}
      </div>
    </div>
  );
}

function providerLabel(provider: LiveRoomProvider, c: Copy) {
  const labels: Record<LiveRoomProvider, string> = {
    zoom: "Zoom",
    webex: "Microsoft Teams",
    whereby: "Whereby",
    google_meet: "Google Meet",
    other: c.openCall.toLowerCase()
  };
  return labels[provider];
}

function ProviderBadge({ provider, c, compact = false }: { provider: LiveRoomProvider; c: Copy; compact?: boolean }) {
  const meta = liveRoomProviders.find((item) => item.id === provider);
  const label = providerLabel(provider, c);
  return (
    <span className={`provider-brand provider-brand-${provider} ${compact ? "compact-provider-brand" : ""}`} aria-label={`${label} logo`}>
      <span className="provider-logo-mark">{meta?.icon ?? label[0]}</span>
      <span className="provider-logo-word">{meta?.brand ?? label}</span>
    </span>
  );
}

function friendlyAccountLabel(value: string, fallback: string) {
  const suffix = value.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  return `${fallback} ${suffix || "active"}`;
}

function roomProviderPlaceholder(provider: LiveRoomProvider) {
  return liveRoomProviders.find((item) => item.id === provider)?.placeholder ?? "https://your-room-link.example/...";
}

function BridgeGallery({
  bridges,
  invites,
  onRotate,
  onRevoke,
  c
}: {
  bridges: AppState["bridges"];
  invites: AppState["invites"];
  onRotate: (bridge: FriskyBridge) => void;
  onRevoke: (bridge: FriskyBridge) => void;
  c: Copy;
}) {
  if (bridges.length === 0) {
    return <p className="empty-state">{c.noLocks}</p>;
  }

  return (
    <div className="lock-gallery">
      {bridges.map((bridge) => {
        const invite = invites.find((item) => item.id === bridge.currentInviteId);
        const photoUrl = bridgeGroupPhotoUrl(bridge);
        return (
          <article className="lock-card" key={bridge.id}>
            <div className="lock-cover" style={photoUrl ? { backgroundImage: `linear-gradient(180deg, rgba(18,23,21,.16), rgba(18,23,21,.74)), url("${photoUrl}")` } : undefined}>
              <span className={`status ${bridge.status === "active" ? "good" : "danger"}`}>{invite?.status ?? bridge.status}</span>
              <span className="lock-shield">◈</span>
            </div>
            <div className="lock-body">
              <div className="lock-title">
                <GroupAvatar bridge={bridge} />
                <div>
                  <b>{bridge.telegramGroupName}</b>
                  <small>{bridge.telegramChatId}</small>
                </div>
              </div>
              <div className="lock-meta">
                <span>/{bridge.slug}</span>
                <code>{bridge.publicUrl}</code>
              </div>
              <div className="row-actions">
                <button className="secondary" onClick={() => navigator.clipboard?.writeText(bridge.publicUrl)}>{c.copyUrl}</button>
                <button onClick={() => onRotate(bridge)}>{c.rotate}</button>
                <button className="danger-button" onClick={() => onRevoke(bridge)}>{c.revoke}</button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function GroupAvatar({ bridge }: { bridge: FriskyBridge }) {
  const photoUrl = bridgeGroupPhotoUrl(bridge);
  return (
    <span className="group-avatar" style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined}>
      <span>🐺</span>
    </span>
  );
}

function bridgeGroupPhotoUrl(bridge: FriskyBridge) {
  const explicitPhoto = bridge.telegramGroupImageUrl.trim();
  if (explicitPhoto) return explicitPhoto;
  const chatId = bridge.telegramChatId.trim();
  if (!chatId) return "";
  return `/api/telegram/chat-photo?chat_id=${encodeURIComponent(chatId)}`;
}

function DomainChoice({ c }: { c: Copy }) {
  return (
    <div className="domain-choice">
      <div>
        <h3>{c.domainChoiceTitle}</h3>
        <p>{c.domainChoiceBody}</p>
      </div>
      <div className="domain-choice-grid">
        <div>
          <b>{c.instantSubdomain}</b>
          <small>{c.instantSubdomainBody}</small>
        </div>
        <div>
          <b>{c.ownDomain}</b>
          <small>{c.ownDomainBody}</small>
        </div>
        <div>
          <b>{c.conciergeDomain}</b>
          <small>{c.conciergeDomainBody}</small>
        </div>
      </div>
    </div>
  );
}

function LiveRoomGallery({
  rooms,
  onPause,
  c,
  ui
}: {
  rooms: AppState["liveRooms"];
  onPause: (room: FriskyLiveRoom) => void;
  c: Copy;
  ui: typeof uiCopy[Locale];
}) {
  return (
    <div className="room-gallery">
      {rooms.map((room) => {
        const coverUrl = trustedFenrirImageUrl(room.coverImageUrl) || providerLogoPresets[room.provider];
        return (
        <article className="room-card" key={room.id}>
          <div className="room-cover" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined}>
            <span className={room.status === "active" ? "status good" : "status amber"}>{room.status}</span>
            <span className="room-provider"><ProviderBadge provider={room.provider} c={c} compact /></span>
          </div>
          <div className="room-body">
            <div>
              <b>{room.title}</b>
              <small>{room.id}</small>
            </div>
            <code>{room.publicUrl}</code>
            <div className="gate-badges">
              <span>{ui.liveRoomSecondaryLabel}</span>
              <span>{ui.liveRoomChallengeReady}</span>
            </div>
            <small className="muted">{c.targetPrivate} {room.targetUrl}</small>
            <div className="row-actions">
              <button className="secondary" onClick={() => navigator.clipboard?.writeText(room.publicUrl)}>{c.copyRoom}</button>
              <button onClick={() => openSafeUrl(room.targetUrl)}>{c.openCall}</button>
              <button className="danger-button" onClick={() => onPause(room)}>{c.pause}</button>
            </div>
          </div>
        </article>
      );
      })}
    </div>
  );
}

function DnsWizard({ domains, selected, onSelect, c }: { domains: FriskyDomain[]; selected: FriskyDomain | null | undefined; onSelect: (id: string) => void; c: Copy }) {
  if (!selected) return null;
  return (
    <div className="dns-layout">
      <div className="domain-list">
        {domains.map((domain) => (
          <button className={domain.id === selected.id ? "active-line" : ""} key={domain.id} onClick={() => onSelect(domain.id)}>
            <b>{domain.domain}</b>
            <span className={`status ${domain.status === "verified" ? "good" : domain.status === "failed" ? "danger" : "amber"}`}>{domain.status}</span>
          </button>
        ))}
      </div>
      <div className="dns-records">
        <div className="cloudflare-recommendation">
          <b>{c.recommendedPath}</b>
          <p>{c.recommendedPathBody}</p>
          <p className="frisky-tip"><b>{c.friskyTip}</b> {c.friskyTipBody}</p>
          <div className="step-line">
            <span className="status good">{c.steps[0]}</span>
            <span className={selected.status === "verified" ? "status good" : "status amber"}>{c.steps[1]}</span>
            <span className={selected.certificateStatus === "active" ? "status good" : "status amber"}>{c.steps[2]} {selected.certificateStatus}</span>
            <span className={selected.status === "verified" && selected.certificateStatus === "active" ? "status good" : "status amber"}>{c.steps[3]}</span>
          </div>
        </div>
        <DnsRecord type="NS" name="@" value={selected.cloudflareNameservers?.join(" / ") ?? "Cloudflare assigned nameservers"} purpose={c.nsPurpose} />
        <DnsRecord type="TXT" name={selected.txtRecordName} value={selected.txtRecordValue} purpose={c.txtPurpose} />
        <DnsRecord type="CNAME" name={selected.cnameHost} value={selected.cnameTarget} purpose={c.cnamePurpose} />
        <div className="provider-tabs">
          {["Cloudflare recommended", "Dynadot registrar", "Namecheap registrar", "Generic registrar"].map((provider) => (
            <div className="provider" key={provider}>
              <b>{provider}</b>
              <small>{c.friskyTipBody}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DnsRecord({ type, name, value, purpose }: { type: string; name: string; value: string; purpose: string }) {
  return (
    <div className="dns-record">
      <span>{type}</span>
      <code>Name: {name}</code>
      <code>Value: {value}</code>
      <small>TTL: Auto · {purpose}</small>
    </div>
  );
}

function RecommendedTools({ state, onOpen, c }: { state: AppState; onOpen: (slug: string) => void; c: Copy }) {
  return (
    <div className="commerce-panel">
      <div>
        <h3>{c.toolsTitle}</h3>
        <p>{c.toolsBody}</p>
      </div>
      <div className="commerce-grid">
        {state.commissionLinks.map((link) => (
          <a
            href={absoluteUrl(link.url) || "#"}
            className={`commerce-card ${link.status}`}
            key={link.id}
            onClick={(event) => {
              event.preventDefault();
              onOpen(link.url.split("/").pop() ?? link.id);
              openAnyUrl(link.url);
            }}
          >
            <b>{link.label}</b>
            <span>{link.provider} · {link.partnerStatus}</span>
            <small>{link.commissionNote} {link.clicks} tracked clicks.</small>
          </a>
        ))}
        <div className="commerce-card pending">
          <b>{c.domainBuyer}</b>
          <span>{c.later}</span>
          <small>{c.domainBuyerBody}</small>
        </div>
        <div className="commerce-card badge-card">
          <b>{c.digitalOceanBadge}</b>
          <span>{c.referralReady}</span>
          <a href="https://www.digitalocean.com/?refcode=e31bed76086e&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge" target="_blank" rel="noreferrer">
            <img src="https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%201.svg" alt="DigitalOcean Referral Badge" />
          </a>
        </div>
      </div>
    </div>
  );
}

function CelebrationBurst({
  celebration,
  dnsLabel,
  commerceLabel
}: {
  celebration: Celebration;
  dnsLabel: string;
  commerceLabel: string;
}) {
  return (
    <div className={`celebration celebration-${celebration.tone}`} aria-live="polite">
      <div className="confetti-field" aria-hidden="true">
        {confettiPieces.map((piece) => (
          <span key={`${celebration.id}-${piece}`} />
        ))}
      </div>
      <section className="celebration-card">
        <span className="celebration-ring">
          <img src="/fenrir-splash-icon.svg" alt="" />
        </span>
        <div>
          <p className="label">{celebration.tone === "dns" ? dnsLabel : commerceLabel}</p>
          <h2>{celebration.title}</h2>
          <p>{celebration.detail}</p>
        </div>
      </section>
    </div>
  );
}

function AuditLog({ state }: { state: AppState }) {
  return (
    <div className="audit-list">
      {state.auditLogs.map((log) => (
        <div className="audit-row" key={log.id}>
          <span>{log.action}</span>
          <code>{log.targetId}</code>
          <small>{new Date(log.createdAt).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}
