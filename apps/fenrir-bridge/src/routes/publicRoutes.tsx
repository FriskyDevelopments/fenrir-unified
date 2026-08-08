import { useEffect, useRef, useState } from "react";
import type { Copy } from "../i18n";
import { bridgeService, liveRoomService, type AuthSession, type BillingStatusPayload, type PaidPlan, type TelegramIdentityLinkPayload } from "../services/api";
import type { AppState, FriskyBridge, FriskyCommissionLink, FriskyLiveRoom, FriskyTelegramInvite, Plan } from "../services/types";
import { absoluteUrl, commissionFallbackBySlug, openAnyUrl, resolveCommissionDestination, trustedFenrirImageUrl, type FenrirRole } from "../app/shared";
import type { UiCopy } from "../app/uiCopy";
import { GroupAvatar, providerLabel } from "./routeCommon";
import { GlowCard } from "../components/GlowCard";
import { UnavailableCard } from "../components/UnavailableCard";
import { brandThemes, themeClassName, themeCssVars } from "../theme/brandThemes";

export function GoRoutePage({
  c,
  ui,
  slug,
  link,
  onTrack
}: {
  c: Copy;
  ui: UiCopy;
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
  ui: UiCopy;
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

export function PublicBridgeRoute({ slug, c, ui }: { slug: string; c: Copy; ui: UiCopy }) {
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
        <UnavailableCard
          loaded={loaded}
          unavailableLabel={c.publicLockUnavailable}
          unavailableTitle={c.invitePaused}
          unavailableBody={c.invitePausedBody}
          loadingLabel={ui.resolvingLockState}
          loadingTitle={ui.checkingRoute}
          loadingBody={ui.resolvingBridgeState}
        />
      )}
    </main>
  );
}

export function PublicRoomRoute({ slug, c, ui }: { slug: string; c: Copy; ui: UiCopy }) {
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
        <UnavailableCard
          loaded={loaded}
          unavailableLabel={c.publicRoomUnavailable}
          unavailableTitle={c.roomPaused}
          unavailableBody={c.roomPausedBody}
          loadingLabel={ui.resolvingLockState}
          loadingTitle={ui.checkingRoute}
          loadingBody={ui.roomWaitingBody}
        />
      )}
    </main>
  );
}

export function ProtocolActivated() {
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

export function FriskyGhostRoute({ c, ui }: { c: Copy; ui: UiCopy }) {
  const theme = brandThemes.friskyGhost;
  return (
    <main className={`product-route ghost-route ${themeClassName(theme)}`} style={themeCssVars(theme)} data-theme={theme.key}>
      <GlowCard className="product-route-card">
        <span className="status good">Frisky Ghost</span>
        <h1>{ui.ghostRouteTitle}</h1>
        <p>{ui.ghostRouteBody}</p>
        <div className="product-route-actions">
          <a className="button-link" href="/bot-os">{ui.botOsRouteFooterGhost}</a>
          <a className="button-link ghost" href="/">{ui.botOsRouteFooterHome}</a>
        </div>
      </GlowCard>
    </main>
  );
}

export function FriskyBotOsRoute({ c, ui }: { c: Copy; ui: UiCopy }) {
  const theme = brandThemes.friskyGhost;
  const botModules = [
    {
      code: "MOD 01",
      title: "Identity Router",
      status: "Ghost login",
      body: "Routes Frisky Ghost, Fenrir, and future product skins without mixing auth scopes.",
      actions: ["Brand skin", "Product landing", "Safe redirect"]
    },
    {
      code: "MOD 02",
      title: "Fenrir Bot",
      status: "Telegram ops",
      body: "Guides admins through stable links, invite rotation, Stars checkout, and DNS setup.",
      actions: ["/setup", "/plans", "/status"]
    },
    {
      code: "MOD 03",
      title: "Payment Box",
      status: "Stars first",
      body: "Opens the official Telegram Stars payment box and waits for backend entitlement truth.",
      actions: ["/subscribe", "Pro", "Operator"]
    },
    {
      code: "MOD 04",
      title: "DNS Wizard",
      status: "Fenrir Bridge DNS",
      body: "Keeps registrar choice open while routing CNAME records through Fenrir Bridge infrastructure.",
      actions: ["TXT _fenrir", "CNAME join", "SSL"]
    },
    {
      code: "MOD 05",
      title: "Community Gate",
      status: "Neon scope",
      body: "Separate realauth for community gates. Different database, tables, and session cookie.",
      actions: ["/community/fenrir", "Invite codes", "Neon"]
    },
    {
      code: "MOD 06",
      title: "Operator Console",
      status: "Bot of bots",
      body: "A modular command layer for setup, support, routing, billing state, and handoffs.",
      actions: ["Cursor", "Gemini", "Frisky Signal"]
    }
  ];

  return (
    <main className={`product-route bot-route ${themeClassName(theme)}`} style={themeCssVars(theme)} data-theme={theme.key}>
      <section className="bot-os-shell">
        <div className="bot-os-header">
          <div>
            <span className="status amber">Frisky Bot OS</span>
            <h1>{ui.botOsRouteTitle}</h1>
            <p>{ui.botOsRouteBody}</p>
            <h3>{ui.botOsRouteModulesTitle}</h3>
          </div>
          <div className="bot-os-terminal" aria-label="Bot OS menu">
            <b>MENU</b>
            <code>/menu</code>
            <code>/setup</code>
            <code>/plans</code>
            <code>/status</code>
          </div>
        </div>

        <div className="bot-module-grid">
          {botModules.map((module) => (
            <GlowCard as="article" className="bot-module-card" key={module.code}>
              <div className="bot-module-topline">
                <span>{module.code}</span>
                <b>{module.status}</b>
              </div>
              <h2>{module.title}</h2>
              <p>{module.body}</p>
              <div className="bot-module-actions">
                {module.actions.map((action) => (
                  <span key={action}>{action}</span>
                ))}
              </div>
            </GlowCard>
          ))}
        </div>

        <div className="product-route-actions">
          <a className="button-link" href="/ghost">{ui.botOsRouteFooterGhost}</a>
          <a className="button-link" href="/community/fenrir">{ui.botOsRouteFooterCommunity}</a>
          <a className="button-link ghost" href="/">{ui.botOsRouteFooterHome}</a>
        </div>
      </section>
    </main>
  );
}