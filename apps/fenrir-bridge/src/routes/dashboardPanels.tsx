import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { copy, type Copy, type Locale } from "../i18n";
import type { AppState, FriskyBridge, FriskyCommissionLink, FriskyDomain, FriskyLiveRoom, LiveRoomProvider, Plan } from "../services/types";
import type { AuthSession, BillingStatusPayload, PaidPlan, ReadinessPayload, TelegramIdentityLinkPayload } from "../services/api";
import type { CommunityAuthProposal } from "../services/communityAuth";
import { brandThemes } from "../theme/brandThemes";
import {
  absoluteUrl,
  confettiPieces,
  defaultDomainTags,
  domainSearchCandidates,
  domainTagPresets,
  domainSearchTlds,
  liveRoomProviders,
  lookupDomainDns,
  openAnyUrl,
  openSafeUrl,
  providerLogoPresets,
  safeHttpUrl,
  trustedFenrirImageUrl,
  type Celebration,
  type DomainSearchResult,
  type FenrirRole,
  type PageKey,
  type PersonalLink,
  type VaultLink
} from "../app/shared";
import type { UiCopy } from "../app/uiCopy";
import { knowledgeBaseUrl } from "../services/knowledgeBase";
import { buildVaultLinks, createVaultShareUrl } from "./vaultRoutes";
import { BrandSignature, bridgeGroupPhotoUrl, GroupAvatar, PanelTitle, providerLabel, ProviderBadge } from "./routeCommon";
import { DnsLookupPanel } from "../components/DnsLookupPanel";
export { BrandSignature, bridgeGroupPhotoUrl, GroupAvatar, PanelTitle, providerLabel, ProviderBadge } from "./routeCommon";


export function overlayAuthState(state: AppState, auth: AuthSession): AppState {
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

export function planLabel(plan: Plan) {
  const labels: Record<Plan, string> = {
    free: "Free",
    starter: "The Pack",
    pro: "The Pack",
    operator: "The Pack",
    standard: "The Pack"
  };
  return labels[plan];
}

/**
 * Normalizes an authentication provider name to a user-facing label.
 *
 * @returns A recognized provider label, the original provider name, or `"OAuth"` when no provider is supplied.
 */
export function authProviderLabel(provider: string) {
  const value = provider.toLowerCase();
  if (value.includes("apple")) return "Apple";
  if (value.includes("google")) return "Google";
  if (value.includes("microsoft") || value.includes("azure")) return "Microsoft";
  if (value.includes("telegram")) return "Telegram";
  if (value.includes("passkey")) return "Passkey";
  if (value.includes("frisky") || value.includes("better-auth")) return "Frisky";
  return provider || "OAuth";
}

export function planLockLimit(plan: Plan) {
  const limits: Record<Plan, string> = {
    free: "5",
    starter: "5",
    pro: "5",
    operator: "5",
    standard: "5"
  };
  return limits[plan];
}

export function SessionLabels({
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
  ui: UiCopy;
}) {
  const activeLocks = state.bridges.filter((bridge) => bridge.status === "active").length;
  const backendLimit = billingStatus?.limits.maxTelegramLocks;
  const lockLimit = backendLimit === null ? "5" : backendLimit ?? planLockLimit(state.org.plan);
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

export function BetaPreviewControls({
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
        <option value="operator">The Pack preview</option>
      </select>
      <small>Preview only. Billing entitlement still comes from the backend.</small>
    </section>
  );
}
export function CommunityAuthProposalPanel({ proposal, locale }: { proposal: CommunityAuthProposal | null; locale: Locale }) {
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
export function FenrirSilhouette({ className }: { className: string }) {
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

export function ProtocolLivingSystem({ state, c }: { state: AppState; c: Copy }) {
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

export function ClientWalkthroughPanel({ c, ui }: { c: Copy; ui: UiCopy }) {
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

export function SetupInboxWizard({
  onStart,
  c,
  ui
}: {
  onStart: (kind: "telegram" | "room" | "vault" | "domain" | "concierge") => void;
  c: Copy;
  ui: UiCopy;
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

export function ExampleDiagramCard({ c, ui }: { c: Copy; ui: UiCopy }) {
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

export function CashoutPipeline({ c, onStars }: { c: Copy; onStars: () => void }) {
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

export function AccountServicePanel({
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
        </div>

        <div className="stripe-mvp-card">
          <span className="status amber">{c.stripeMode}</span>
          <h3>{checkoutPlan.charAt(0).toUpperCase() + checkoutPlan.slice(1)}</h3>
          <p>{c.checkoutReady}</p>
          <label className="courtesy-code-field">
            <span>Courtesy code (optional)</span>
            <input value={courtesyCode} onChange={(event) => onCourtesyCode(event.target.value.toUpperCase())} placeholder="MYFENRIR-COURTESY" autoComplete="off" />
            <small>Single-use admin courtesy. Leave blank for normal checkout.</small>
          </label>
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


export function LinkVaultPanel({
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
  ui: UiCopy;
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

export function FaqPanel({ c }: { c: Copy }) {
  return (
    <section className="panel wide faq-panel">
      <div className="faq-heading-row">
        <PanelTitle title={c.faqTitle} subtitle={c.faqSub} />
        <a className="faq-wiki-link" href={knowledgeBaseUrl}>
          <span>31 FIELD GUIDES</span>
          <b>Open the new Wiki</b>
          <i aria-hidden="true">↗</i>
        </a>
      </div>
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

export function operatorReadinessBanner(
  c: Copy,
  r: ReadinessPayload
): { text: string; tone: "good" | "danger" } {
  if (r.app.readyForPaidUsers) {
    return { text: c.operatorReadyForPaidUsers, tone: "good" };
  }
  const { auth, billing } = r;
  const hasPrimaryAuth =
    auth.googleConfigured || auth.microsoftConfigured || auth.appleConfigured || auth.friskyAuthEnabled;
  if (!hasPrimaryAuth) {
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

export function ProductionReadinessPanel({
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

export function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <section className={`metric ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </section>
  );
}

export function LaunchWowConsole({
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

export function KeyValue({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <code title={title ?? value}>{value}</code>
    </div>
  );
}

export function LiveDomainSearchPanel({
  value,
  results,
  busy,
  onValue,
  onSearch,
  onPick,
  onOpenRegistrar
}: {
  value: string;
  results: DomainSearchResult[];
  busy: boolean;
  onValue: (value: string) => void;
  onSearch: () => void;
  onPick: (domain: string) => void;
  onOpenRegistrar: (domain: string) => void;
}) {
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
            {busy ? "Searching..." : "Search live"}
          </button>
        </div>
      </div>
      <div className="live-domain-results" aria-label="Domain search results">
        {(results.length ? results : domainSearchCandidates(value).slice(0, 5).map((domain) => ({
          domain,
          status: "ready" as const,
          summary: "Ready to check live DNS.",
          records: []
        }))).map((result) => (
          <article className={`live-domain-result ${result.status}`} key={result.domain}>
            <div>
              <b>{result.domain}</b>
              <span className={`status ${result.status === "dns_found" ? "amber" : result.status === "no_dns_signal" ? "good" : result.status === "ready" ? "blue" : "danger"}`}>
                {result.status === "dns_found" ? "DNS found" : result.status === "no_dns_signal" ? "No DNS signal" : result.status === "ready" ? "Ready" : result.status}
              </span>
            </div>
            <p>{result.summary}</p>
            {result.records.length ? <small>NS: {result.records.join(" / ")}</small> : <small>Registrar check still required before purchase.</small>}
            <div className="row-actions">
              <button type="button" className="secondary compact-button" onClick={() => onPick(result.domain)}>
                Use in wizard
              </button>
              <button type="button" className="ghost compact-button" onClick={() => onOpenRegistrar(result.domain)}>
                Check registrar
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function friendlyAccountLabel(value: string, fallback: string) {
  const suffix = value.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  return `${fallback} ${suffix || "active"}`;
}

export function roomProviderPlaceholder(provider: LiveRoomProvider) {
  return liveRoomProviders.find((item) => item.id === provider)?.placeholder ?? "https://your-room-link.example/...";
}

export function BridgeGallery({
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

export function DomainChoice({ c }: { c: Copy }) {
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

export function LiveRoomGallery({
  rooms,
  onPause,
  c,
  ui
}: {
  rooms: AppState["liveRooms"];
  onPause: (room: FriskyLiveRoom) => void;
  c: Copy;
  ui: UiCopy;
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

function domainLacksOwnershipProof(domain: FriskyDomain | null | undefined): boolean {
  if (!domain) return false;
  return !domain.txtRecordValue || !domain.cnameTarget || !domain.verificationToken;
}

export function DnsWizard({
  domains,
  selected,
  onSelect,
  c,
  locale,
  showLookup = true
}: {
  domains: FriskyDomain[];
  selected: FriskyDomain | null | undefined;
  onSelect: (id: string) => void;
  c: Copy;
  locale?: Locale;
  showLookup?: boolean;
}) {
  const fleetNeedsReverify = domains.some((domain) => domainLacksOwnershipProof(domain));
  const selectedNeedsReverify = domainLacksOwnershipProof(selected);

  return (
    <div className="dns-wizard-shell">
      {fleetNeedsReverify ? (
        <div className="dns-ops-banner dns-ops-banner-warn" role="status">
          <strong>{c.dnsReverifyBannerTitle}</strong>
          <p>{c.dnsReverifyFleetBanner}</p>
        </div>
      ) : null}
      {showLookup && locale ? <DnsLookupPanel selected={selected} c={c} locale={locale} /> : null}
      {!selected ? (
        <p className="frisky-tip">{c.dnsConnectIntro}</p>
      ) : (
        <div className="dns-layout">
          <div className="domain-list">
            {domains.map((domain) => (
              <button className={domain.id === selected.id ? "active-line" : ""} key={domain.id} onClick={() => onSelect(domain.id)}>
                <b>{domain.domain}</b>
                <span className={`status ${domain.status === "verified" ? "good" : domain.status === "failed" ? "danger" : "amber"}`}>{domain.status}</span>
                {domainLacksOwnershipProof(domain) ? <small className="dns-proof-chip">{c.dnsReverifyBannerTitle}</small> : null}
              </button>
            ))}
          </div>
          <div className="dns-records">
            <div className="cloudflare-recommendation">
              <b>{c.dnsConnectPrepare}</b>
              <p>{c.dnsConnectIntro}</p>
              <p className="frisky-tip"><b>{c.friskyTip}</b> {c.friskyTipBody}</p>
              <div className="step-line">
                <span className="status good">{c.steps[0]}</span>
                <span className={selected.status === "verified" ? "status good" : "status amber"}>{c.steps[1]}</span>
                <span className={selected.certificateStatus === "active" ? "status good" : "status amber"}>{c.steps[2]} {selected.certificateStatus}</span>
                <span className={selected.status === "verified" && selected.certificateStatus === "active" ? "status good" : "status amber"}>{c.steps[3]}</span>
              </div>
              {selectedNeedsReverify ? (
                <div className="dns-ops-banner dns-ops-banner-warn" role="alert">
                  <strong>{c.dnsReverifyBannerTitle}</strong>
                  <p>{c.dnsReverifyBannerBody}</p>
                </div>
              ) : (
                <p className="dns-ops-note" role="status">{c.dnsRecheckWarning}</p>
              )}
            </div>
            {selected.txtRecordValue ? <DnsRecord type="TXT" name={selected.txtRecordName} value={selected.txtRecordValue} purpose={c.txtPurpose} /> : null}
            {selected.cnameTarget ? <DnsRecord type="CNAME" name={selected.cnameHost} value={selected.cnameTarget} purpose={c.cnamePurpose} /> : null}
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
      )}
    </div>
  );
}

export function DnsRecord({ type, name, value, purpose }: { type: string; name: string; value: string; purpose: string }) {
  return (
    <div className="dns-record">
      <span>{type}</span>
      <code>Name: {name}</code>
      <code>Value: {value}</code>
      <small>TTL: Auto · {purpose}</small>
    </div>
  );
}

export function RecommendedTools({ state, onOpen, c }: { state: AppState; onOpen: (slug: string) => void; c: Copy }) {
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

export function CelebrationBurst({
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

export function AuditLog({ state }: { state: AppState }) {
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
