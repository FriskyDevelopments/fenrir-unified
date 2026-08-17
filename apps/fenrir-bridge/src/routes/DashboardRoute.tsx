import { useEffect, useMemo, useState } from "react";
import { copy, detectLocale, languageNames, locales, type Copy, type Locale } from "../i18n";
import {
  aiOpsService,
  appService,
  authService,
  billingService,
  bridgeService,
  commerceService,
  domainService,
  liveRoomService,
  readinessService,
  telegramIdentityService,
  telegramService,
  membershipService,
  webauthnService,
  type AuthSession,
  type MembershipStatePayload,
  type BillingStatusPayload,
  type PaidPlan,
  type ReadinessPayload,
  type TelegramIdentityLinkPayload
} from "../services/api";
import type { AppState, FriskyBridge, FriskyDomain, FriskyLiveRoom, LiveRoomProvider, Plan } from "../services/types";
import { communityBridgeDashboardUrl } from "../services/communityBridge";
import { uiCopy, type UiCopy } from "../app/uiCopy";
import {
  addDomainTag,
  commissionUrlSlug,
  defaultDomainTags,
  defaultServiceOrg,
  defaultServiceSubdomain,
  domainSearchCandidates,
  domainTagPresets,
  findCommissionLink,
  legalRoutes,
  liveRoomProviders,
  lookupDomainDns,
  managedDashboardPath,
  openAnyUrl,
  openSafeUrl,
  pageKeys,
  parseDomainTags,
  providerLogoPresets,
  safeHttpUrl,
  type Celebration,
  type DomainSearchResult,
  type FenrirRole,
  type PageKey,
  type PersonalLink,
  type VaultLink
} from "../app/shared";
import { activePageFromLocation, dashboardPathFor, isAuthCallbackPath, paidPlanFromProductLabel } from "../app/routing";
import { CommunityBridgeHandoffPanel, CommunityNeonGateRoute } from "./communityGate";
import { FriskyBotOsRoute, FriskyGhostRoute, GoRoutePage, ProtocolActivated, PublicBridgeRoute, PublicRoomRoute } from "./publicRoutes";
import { AuthGate } from "./authGate";
import { PackCelebration } from "../components/PackCelebration";
import { LegalPage } from "./legalPage";
import {
  AccountServicePanel,
  AuditLog,
  BetaPreviewControls,
  BrandSignature,
  BridgeGallery,
  CelebrationBurst,
  CashoutPipeline,
  ClientWalkthroughPanel,
  DnsWizard,
  DomainChoice,
  ExampleDiagramCard,
  FaqPanel,
  FenrirSilhouette,
  friendlyAccountLabel,
  KeyValue,
  LaunchWowConsole,
  LinkVaultPanel,
  LiveDomainSearchPanel,
  LiveRoomGallery,
  Metric,
  overlayAuthState,
  PanelTitle,
  ProductionReadinessPanel,
  ProtocolLivingSystem,
  ProviderBadge,
  RecommendedTools,
  SessionLabels,
  SetupInboxWizard,
  roomProviderPlaceholder
} from "./dashboardPanels";
import { buildVaultLinks, createVaultShareUrl, decodeVaultLinks, PublicVaultPage } from "./vaultRoutes";

export function DashboardRoute() {
  const path = window.location.pathname;
  const host = window.location.hostname.toLowerCase();
  const joinMatch = path.match(/^\/join\/([^/]+)/);
  const roomMatch = path.match(/^\/room\/([^/]+)/);
  const vaultMatch = path.match(/^\/vault\/?$/);
  const communityGateMatch = path.match(/^\/(?:community|gate)(?:\/group)?\/([^/]+)/);
  const ghostRoute = host === "friskyghost.com" || path === "/ghost" || path.startsWith("/ghost/");
  const botOsRoute = path === "/bot-os" || path.startsWith("/bot-os/") || path === "/bots" || path.startsWith("/bots/");
  const legalMatch = legalRoutes.has(path);
  const [state, setState] = useState<AppState | null>(null);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [active, setActive] = useState<PageKey>(() => activePageFromLocation(path, window.location.hash));
  const [domainInput, setDomainInput] = useState("");
  const [domainTagsInput, setDomainTagsInput] = useState("launch, paid");
  const [domainTagsById, setDomainTagsById] = useState<Record<string, string[]>>({});
  const [domainSearchInput, setDomainSearchInput] = useState("myfenrir");
  const [domainSearchResults, setDomainSearchResults] = useState<DomainSearchResult[]>([]);
  const [domainSearchBusy, setDomainSearchBusy] = useState(false);
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
  // The Pack moment is server-decided, not URL-decided. See the ?billing=success
  // effect below for why the old trigger could not be trusted.
  const [membership, setMembership] = useState<MembershipStatePayload | null>(null);
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
    if (
      staleAuthError.startsWith("missing_env:") ||
      staleAuthError === "direct_oauth_disabled" ||
      staleAuthError === "supabase_session_failed:human_verification_required"
    ) {
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
    if (billing === "success") {
      // Notice only. This branch fires on Stripe's post-checkout redirect, which
      // means the browser came back - NOT that the webhook has landed the
      // entitlement. It used to assert "Your MyFenrir subscription is active"
      // right here, a claim the backend had not yet made; and Stars buyers never
      // saw it at all because they never pass through this URL. The moment
      // itself is now driven by confirmed server state.
      setNotice(copy[locale].billingReturnSuccess);
    }
    if (billing === "cancel") setNotice(copy[locale].billingReturnCancel);
    if (billing === "portal_return") setNotice(copy[locale].billingReturnPortal);
    void refresh();
    window.history.replaceState({}, "", window.location.pathname);
  }, [auth?.authenticated, locale]);

  // Ask the server what this membership is and whether the moment is owed.
  // Keyed on `state` so a purchase that lands while the portal is open is
  // picked up by the next refresh() without a reload.
  useEffect(() => {
    if (!auth?.authenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await membershipService.getState();
        if (!cancelled) setMembership(payload);
      } catch {
        // A failed read must never fabricate a celebration. Staying null means
        // the moment simply does not fire; MembershipPanel surfaces the error.
        if (!cancelled) setMembership(null);
      }
    })();
    return () => { cancelled = true; };
  }, [auth?.authenticated, state]);

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

  if (ghostRoute) {
    return <FriskyGhostRoute c={c} ui={ui} />;
  }

  if (botOsRoute) {
    return <FriskyBotOsRoute c={c} ui={ui} />;
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

  async function runDomainSearch(seed = domainSearchInput) {
    const candidates = domainSearchCandidates(seed);
    if (!candidates.length) {
      setNotice("Enter a domain or brand name before searching.");
      return;
    }
    setDomainSearchBusy(true);
    setDomainSearchResults([]);
    const results = await Promise.all(candidates.slice(0, 5).map(lookupDomainDns));
    setDomainSearchResults(results);
    setDomainSearchBusy(false);
    setNotice(`Live domain search checked ${results.length} option${results.length === 1 ? "" : "s"}.`);
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
    if (!domainId || !roomTargetInput.trim()) return;
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
      // se descarga al registrar un passkey desde el dashboard.
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
    <div className="app threshold-dashboard">
      {activationVisible && <ProtocolActivated />}
      <aside className="sidebar threshold-rail">
        <div className="brand">
          <img className="brand-wordmark" src="/fenrir-cut-wordmark.svg" alt="Fenrir" />
          <div className="brand-lockup">
            <b>MyFenrir</b>
            <small>CONTROL PLANE · R/01</small>
          </div>
        </div>
        <nav>
          {c.nav.map((item, index) => (
            <button className={active === pageKeys[index] ? "active" : ""} onClick={() => navigateActive(pageKeys[index])} key={item}>
              <span className="threshold-nav-index">{String(index).padStart(2, "0")}</span>
              <span>{item}</span>
            </button>
          ))}
        </nav>
        <div className="operator-card">
          <span>Frisky Account</span>
          <b>{state.user.email}</b>
          <small>{state.org.id}</small>
          <div className="legal-mini-links">
            <a href="/legal">{c.legal}</a>
            <a href="/terms">{c.terms}</a>
          </div>
        </div>
      </aside>

      <main className="threshold-main">
        <div className="fenrir-wallpaper" aria-hidden="true">
          <span className="wallpaper-orbit orbit-one" />
          <span className="wallpaper-orbit orbit-two" />
          <FenrirSilhouette className="wallpaper-silhouette" />
          <span className="wallpaper-paw">F</span>
          <span className="wallpaper-bot">◈</span>
        </div>
        <header className="topbar threshold-topbar">
          <div className="threshold-engine" aria-hidden="true">
            <span className="threshold-engine-ring ring-a" />
            <span className="threshold-engine-ring ring-b" />
            <span className="threshold-engine-ring ring-c" />
            <span className="threshold-engine-scan" />
            <span className="threshold-engine-core"><b>R/01</b><small>THRESHOLD<br />ONLINE</small></span>
            <span className="threshold-engine-node node-a" />
            <span className="threshold-engine-node node-b" />
            <span className="threshold-engine-node node-c" />
          </div>
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
              onValue={setDomainSearchInput}
              onSearch={() => void runDomainSearch()}
              onPick={(domain) => {
                setDomainInput(domain);
                setDomainTagsInput(addDomainTag(domainTagsInput, "launch"));
                setNotice(`${domain} moved into the Fenrir domain wizard.`);
              }}
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
                }}>
                  <ProviderBadge provider={provider.id} c={c} compact />
                </button>
              ))}
            </div>
            <div className="room-wow-preview" aria-label="Live room preview">
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
      {membership?.celebrate && membership.membership.entitled && (
        <PackCelebration
          facts={membership.membership as never}
          locale={locale === "es" ? "es" : "en"}
          onDismiss={() => {
            // Close immediately, then record. If the write fails the moment may
            // repeat once - preferable to a member who paid seeing nothing.
            setMembership((current) => (current ? { ...current, celebrate: false } : current));
            void membershipService.acknowledgeCelebration().catch(() => {});
          }}
          onOpenPortal={() => {
            setMembership((current) => (current ? { ...current, celebrate: false } : current));
            void membershipService.acknowledgeCelebration().catch(() => {});
            navigateActive("billing");
          }}
        />
      )}
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
