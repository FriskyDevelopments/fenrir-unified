import type { Locale } from "../i18n";

export const uiCopy: Record<Locale, {
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
  ghostRouteTitle: string;
  ghostRouteBody: string;
  botOsRouteTitle: string;
  botOsRouteSubtitle: string;
  botOsRouteBody: string;
  botOsRouteModulesTitle: string;
  botOsRouteFooterGhost: string;
  botOsRouteFooterCommunity: string;
  botOsRouteFooterHome: string;
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
    proCustomization: "The Pack customization",
    proCustomizationBodyTitle: "With The Pack, customers can add their logo and branded room visuals.",
    proCustomizationBody: "Free includes the clean Fenrir room gate. The Pack unlocks a customer logo, custom room-name styling, and a branded hero image on the secondary link.",
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
    devRequestViaSignal: "Support",
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
    ghostRouteTitle: "Ghost login belongs to the Bot OS surface.",
    ghostRouteBody: "This route is intentionally separate from Fenrir Bridge. Use it for Frisky Ghost, ghost-styled onboarding, and Bot OS identity moments without touching client accounts.",
    botOsRouteTitle: "Bot-of-bots command layer.",
    botOsRouteSubtitle: "Modular command layer for Fenrir and Bot OS operators.",
    botOsRouteBody: "Modular boxes are back. Ghost handles the playful login skin, Fenrir handles bridge operations, and Community Gate stays isolated on Neon.",
    botOsRouteModulesTitle: "Bot OS modules",
    botOsRouteFooterGhost: "Ghost login",
    botOsRouteFooterCommunity: "Community Gate",
    botOsRouteFooterHome: "Fenrir Bridge",
    communityEmailPlaceholder: "you@community.com",
    neonMagicBusy: "Signing you in...",
    neonMagicButton: "Continue to Sign On",
    neonMagicSuccessMessage: "Sign-in link sent. Check your inbox to continue.",
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
    setupInputRoomCover: "Logo / branded image URL",
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
    proCustomization: "Personalizacion The Pack",
    proCustomizationBodyTitle: "Con The Pack, los clientes pueden agregar logo y portada de sala personalizada.",
    proCustomizationBody: "Gratis incluye la puerta limpia de sala. The Pack habilita logo del cliente, estilo de nombre y hero branding en el enlace secundario.",
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
    setupInputRoomCover: "Logo / URL de portada",
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
    ghostRouteTitle: "El inicio de sesión de Ghost pertenece a Bot OS.",
    ghostRouteBody: "Esta ruta está separada de Fenrir Bridge. Úsala para Frisky Ghost, onboarding con estilo Ghost y momentos de identidad de Bot OS sin tocar cuentas de cliente.",
    botOsRouteTitle: "Capa de comandos de bots.",
    botOsRouteSubtitle: "Capa de comandos modular para admins Fenrir y Bot OS.",
    botOsRouteBody: "Las cajas modulares están de vuelta. Ghost maneja la piel de login lúdica, Fenrir maneja operaciones de puente, y Community Gate permanece aislado en Neon.",
    botOsRouteModulesTitle: "Módulos de Bot OS",
    botOsRouteFooterGhost: "Login de Ghost",
    botOsRouteFooterCommunity: "Community Gate",
    botOsRouteFooterHome: "Fenrir Bridge",
    communityEmailPlaceholder: "tu@comunidad.com",
    neonMagicBusy: "Iniciando sesión...",
    neonMagicButton: "Continuar al inicio de sesión",
    neonMagicSuccessMessage: "Enlace de autenticación Neon enviado. Revisa el correo y sigue el último paso de aprobación.",
    neonMagicDevLinkLabel: "Abrir enlace de prueba Neon",
    fallbackPartnerLabel: "Enlaces de respaldo"
  },
  fr: {
    friskyAccount: "Compte Frisky",
    secondaryGate: "Passerelle secondaire",
    routePrivateViaFenrir: "Acheminer Zoom, Meet, Webex ou toute salle via Fenrir en premier.",
    proCustomization: "Personnalisation The Pack",
    proCustomizationBodyTitle: "Avec The Pack, les clients peuvent ajouter logo et visuels personnalises.",
    proCustomizationBody: "Gratuit garde la passerelle Fenrir standard. The Pack debloque logo client, style de nom personnalise et hero image sur le lien secondaire.",
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
    setupInputRoomCover: "Logo / URL image de marque",
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
    ghostRouteTitle: "La connexion Ghost appartient à la surface Bot OS.",
    ghostRouteBody: "Cette route est séparée volontairement de Fenrir Bridge. Utilisez-la pour Frisky Ghost, l'onboarding Ghost et les moments d'identité Bot OS sans toucher les comptes clients Fenrir Bridge.",
    botOsRouteTitle: "Couche de commandes de bots.",
    botOsRouteSubtitle: "Couche de commande modulaire pour Fenrir et les ops Bot OS.",
    botOsRouteBody: "Les blocs modulaires sont de retour. Ghost gère la skin de connexion, Fenrir gère les opérations de pont, et Community Gate reste isolé sur Neon.",
    botOsRouteModulesTitle: "Modules Bot OS",
    botOsRouteFooterGhost: "Connexion Ghost",
    botOsRouteFooterCommunity: "Community Gate",
    botOsRouteFooterHome: "Fenrir Bridge",
    communityEmailPlaceholder: "vous@communaute.com",
    neonMagicBusy: "Connexion...",
    neonMagicButton: "Continuer vers la connexion",
    neonMagicSuccessMessage: "Lien d'authentification Neon envoyé. Vérifiez votre e-mail et suivez l'étape d'approbation.",
    neonMagicDevLinkLabel: "Ouvrir le lien développeur Neon",
    fallbackPartnerLabel: "Liens de secours"
  },
  de: {
    friskyAccount: "Frisky Konto",
    secondaryGate: "Sekundaere Tor",
    routePrivateViaFenrir: "Routen Sie Zoom, Meet, Webex oder jede Room erst über Fenrir.",
    proCustomization: "The-Pack-Anpassung",
    proCustomizationBodyTitle: "Mit The Pack koennen Kunden ihr Logo und gebrandete Raumvisuals nutzen.",
    proCustomizationBody: "Gratis enthaelt das klare Fenrir-Raum-Gate. The Pack aktiviert Kundenlogo, benutzerdefinierten Raumnamenstil und Hero-Bild auf dem Sekundaerlink.",
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
    setupInputRoomCover: "Logo / Marken-Bild URL",
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
    ghostRouteTitle: "Ghost-Login gehört zur Bot OS Oberfläche.",
    ghostRouteBody: "Diese Route ist absichtlich von Fenrir Bridge getrennt. Nutze sie für Frisky Ghost, Ghost-Onboarding und Bot-OS-Identitätsmomente ohne Berührung der Fenrir-Bridge-Kundenkonten.",
    botOsRouteTitle: "Befehls-Schicht der Bots.",
    botOsRouteSubtitle: "Modulare Befehls-Schicht für Fenrir- und Bot-OS-Operatoren.",
    botOsRouteBody: "Modulare Boxen sind zurück. Ghost übernimmt die spielerische Login-Hülle, Fenrir die Bridge-Operationen, Community Gate bleibt isoliert auf Neon.",
    botOsRouteModulesTitle: "Bot OS Module",
    botOsRouteFooterGhost: "Ghost Login",
    botOsRouteFooterCommunity: "Community Gate",
    botOsRouteFooterHome: "Fenrir Bridge",
    communityEmailPlaceholder: "du@gemeinschaft.com",
    neonMagicBusy: "Anmeldung...",
    neonMagicButton: "Weiter zur Anmeldung",
    neonMagicSuccessMessage: "Neon-Auth-Link gesendet. E-Mail prüfen und dem letzten Freigabeschritt folgen.",
    neonMagicDevLinkLabel: "Neon-Entwicklerlink öffnen",
    fallbackPartnerLabel: "Fallback-Links"
  }
};

export type UiCopy = typeof uiCopy[Locale];
