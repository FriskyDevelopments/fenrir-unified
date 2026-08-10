import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { copy } from "../i18n";
import { addBridge, addDomain, addLiveRoom, appendAudit, pauseLiveRoom, store, trackCommissionClick } from "./mockStore";
import { completeSupabaseSession, hasSupabaseCallbackInLocation, signInWithSupabase, signOutSupabase } from "./supabaseAuth";
import type { AppState, FriskyBridge, FriskyLiveRoom, FriskyTelegramInvite, LiveRoomProvider, Plan, TelegramPermissionCheck } from "./types";

/** English-primary message for Stripe checkout failures; UI should prefer `copy[locale].checkoutErrorGeneric` when rendering. */
export const defaultBillingCheckoutErrorMessage = copy.en.checkoutErrorGeneric;

const telegramBotUsername = () =>
  (
    import.meta.env.VITE_FENRIR_TELEGRAM_BOT_USERNAME ??
    import.meta.env.VITE_MYFENRIR_TELEGRAM_BOT_USERNAME ??
    "Myfenrir_bot"
  )
    .replace(/^@/, "")
    .trim();


export type PaidPlan = Exclude<Plan, "free">;

export type BillingLimits = {
  maxTelegramLocks: number | null;
  maxFenrirSubdomains: number | null;
  customDomainSupported: boolean;
  liveRoomsSupported: boolean;
  multiAdminWorkflows: boolean;
  auditLogScope: "none" | "standard" | "full";
};

export type ReadinessPayload = {
  ok: true;
  auth: {
    googleConfigured: boolean;
    microsoftConfigured: boolean;
    appleConfigured: boolean;
  };
  billing: {
    stripeSecretConfigured: boolean;
    webhookSecretConfigured: boolean;
    priceIdsConfigured: boolean;
    telegramBotConfigured?: boolean;
    telegramBotUsernameConfigured?: boolean;
    telegramStarsConfigured: boolean;
    telegramWebhookSecretConfigured: boolean;
    d1Configured: boolean;
    neonConfigured: boolean;
  };
  app: {
    readyForPaidUsers: boolean;
  };
};

export type BillingStatusPayload = {
  ok: true;
  plan: Plan;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  limits: BillingLimits;
};

export type TelegramIdentityLinkPayload = {
  ok: true;
  linked: boolean;
  telegramUserId: string | null;
  telegramUsername: string | null;
  linkedAt: string | null;
};

export type TelegramIdentityLinkStartPayload = {
  ok: true;
  linked: false;
  code: string;
  expiresAt: string;
  url: string;
};

export type TelegramReaddPayload = {
  ok: true;
  mode: "telegram_readd";
  linked: true;
  telegramUserId: string;
  telegramUsername: string | null;
  bridgeId: string;
  chatId: string;
  inviteUrl: string;
  expiresAt: string;
};

export type AuthSession = {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    authProvider: "google" | "microsoft" | "apple" | "telegram" | "passkey";
  };
  org?: {
    id: string;
    plan: Plan;
  };
};

export type TelegramLoginPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

async function apiRequest<T>(path: string, init?: RequestInit) {
  try {
    const response = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init
    });
    const body = await response.json().catch(() => null) as T | null;
    if (!body) {
      return devApiFallback<T>(path, init, `api_empty_${response.status}`);
    }
    if (!response.ok) {
      return devApiFallback<T>(path, init, (body as { error?: string } | null)?.error ?? `api_error_${response.status}`);
    }
    return body as T;
  } catch (error) {
    return devApiFallback<T>(path, init, error instanceof Error ? error.message : "api_unavailable");
  }
}

function cloneStore(): AppState {
  return JSON.parse(JSON.stringify(store)) as AppState;
}

function devAuthSession(): AuthSession & { ok: true } {
  return {
    ok: true,
    authenticated: true,
    user: {
      id: store.user.id,
      email: store.user.email,
      name: store.user.name,
      authProvider: "google"
    },
    org: {
      id: store.org.id,
      plan: store.org.plan
    }
  };
}

function devApiFallback<T>(path: string, init: RequestInit | undefined, reason: string): T {
  if (!import.meta.env.DEV) {
    throw new Error(reason);
  }

  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? JSON.parse(init.body || "{}") as Record<string, unknown> : {};

  if (path === "/api/auth/me") {
    return devAuthSession() as T;
  }
  if (path === "/api/auth/logout") {
    return { ok: true } as T;
  }
  if (path === "/api/auth/telegram-session" && method === "POST") {
    return { ok: true } as T;
  }
  if (path === "/api/app-state") {
    return { ok: true, data: cloneStore() } as T;
  }
  if (path === "/api/domains" && method === "POST") {
    return { ok: true, data: addDomain(String(body.domain || "")) } as T;
  }
  if (path === "/api/domains/check" && method === "POST") {
    const domain = store.domains.find((item) => item.id === body.domainId) ?? store.domains[0];
    if (domain) {
      domain.status = "verified";
      domain.certificateStatus = "active";
      domain.verifiedAt = new Date().toISOString();
    }
    return { ok: true, data: domain } as T;
  }
  if (path === "/api/bridges" && method === "POST") {
    const bridge = addBridge(
      String(body.domainId || store.domains[0]?.id || ""),
      String(body.slug || "main"),
      String(body.telegramChatId || "-10020260513"),
      String(body.telegramGroupName || ""),
      String(body.telegramGroupImageUrl || "")
    );
    const invite = store.invites.find((item) => item.id === bridge.currentInviteId);
    return { ok: true, data: bridge, invite } as T;
  }
  if (path === "/api/bridges/rotate" && method === "POST") {
    const bridge = store.bridges.find((item) => item.id === body.bridgeId);
    if (!bridge) throw new Error("bridge_not_found");
    const currentInvite = store.invites.find((item) => item.id === bridge.currentInviteId);
    if (currentInvite) {
      currentInvite.status = "revoked";
      currentInvite.revokedAt = new Date().toISOString();
    }
    const invite: FriskyTelegramInvite = {
      id: `frisky_invite_${Date.now()}`,
      bridgeId: bridge.id,
      inviteLink: `https://t.me/+${bridge.slug}Rotated${Math.random().toString(36).slice(2, 5)}`,
      status: "active",
      createdAt: new Date().toISOString()
    };
    store.invites.unshift(invite);
    bridge.currentInviteId = invite.id;
    bridge.status = "active";
    bridge.rotatedAt = new Date().toISOString();
    return { ok: true, data: bridge, invite } as T;
  }
  if (path === "/api/bridges/revoke" && method === "POST") {
    const bridge = store.bridges.find((item) => item.id === body.bridgeId);
    if (!bridge) throw new Error("bridge_not_found");
    bridge.status = "revoked";
    bridge.revokedAt = new Date().toISOString();
    const currentInvite = store.invites.find((item) => item.id === bridge.currentInviteId);
    if (currentInvite) {
      currentInvite.status = "revoked";
      currentInvite.revokedAt = bridge.revokedAt;
    }
    return { ok: true, data: bridge } as T;
  }
  if (path === "/api/rooms" && method === "POST") {
    const room = addLiveRoom(
      String(body.domainId || store.domains[0]?.id || ""),
      String(body.slug || "room"),
      String(body.title || ""),
      (body.provider || "zoom") as LiveRoomProvider,
      String(body.targetUrl || "https://meet.google.com/client-room"),
      String(body.coverImageUrl || "")
    );
    return { ok: true, data: room } as T;
  }
  if (path === "/api/rooms/pause" && method === "POST") {
    const room = pauseLiveRoom(String(body.roomId || ""));
    if (!room) throw new Error("room_not_found");
    return { ok: true, data: room } as T;
  }
  if (path === "/api/telegram/check" && method === "POST") {
    const check: TelegramPermissionCheck = {
      chatId: String(body.chatId || "-10020260513"),
      botIsAdmin: true,
      canInviteUsers: true,
      canRevokeLinks: true,
      status: "ready"
    };
    store.telegramChecks.unshift(check);
    return { ok: true, data: check } as T;
  }
  if (path.startsWith("/api/public/bridge/")) {
    const slug = decodeURIComponent(path.split("/").pop() || "");
    const bridge = store.bridges.find((item) => item.slug === slug && item.status === "active");
    const invite = bridge ? store.invites.find((item) => item.id === bridge.currentInviteId && item.status === "active") : null;
    if (!bridge || !invite) throw new Error("bridge_not_found");
    return { ok: true, bridge, invite } as T;
  }
  if (path.startsWith("/api/public/room/")) {
    const slug = decodeURIComponent(path.split("/").pop() || "");
    const room = store.liveRooms.find((item) => item.slug === slug && item.status === "active");
    if (!room) throw new Error("room_not_found");
    return { ok: true, room } as T;
  }
  if (path === "/api/billing/status") {
    return {
      ok: true,
      plan: store.org.plan,
      subscriptionStatus: "telegram_stars_pending",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: null,
      limits: {
        maxTelegramLocks: 3,
        maxFenrirSubdomains: 3,
        customDomainSupported: false,
        liveRoomsSupported: true,
        multiAdminWorkflows: false,
        auditLogScope: "standard"
      }
    } as T;
  }
  if (path === "/api/telegram/link" && method === "POST") {
    const code = Math.random().toString(36).slice(2, 14);
    return {
      ok: true,
      linked: false,
      code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      url: `https://t.me/${telegramBotUsername()}?start=link_${code}`
    } as T;
  }
  if (path === "/api/telegram/link") {
    return { ok: true, linked: false, telegramUserId: null, telegramUsername: null, linkedAt: null } as T;
  }
  if (path === "/api/telegram/readd" && method === "POST") {
    const bridge = store.bridges.find((item) => item.status === "active" && (item.id === body.bridgeId || item.telegramChatId === body.chatId));
    if (!bridge) throw new Error("telegram_bridge_not_found");
    return {
      ok: true,
      mode: "telegram_readd",
      linked: true,
      telegramUserId: "123456789",
      telegramUsername: "fenrir_dev",
      bridgeId: bridge.id,
      chatId: bridge.telegramChatId,
      inviteUrl: "https://t.me/+fenrirRecoveryInvite",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    } as T;
  }
  throw new Error(reason);
}

async function webauthnPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : "{}"
  });
  const data = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((data as { error?: string } | null)?.error ?? `api_error_${response.status}`);
  }
  return data as T;
}

export const webauthnService = {
  async registerOptions(): Promise<{ ok: true; optionsJSON: PublicKeyCredentialCreationOptionsJSON }> {
    return webauthnPost("/api/webauthn/register-options");
  },
  async registerVerify(registration: RegistrationResponseJSON): Promise<{ ok: true }> {
    return webauthnPost("/api/webauthn/register-verify", registration);
  },
  async loginOptions(): Promise<{ ok: true; optionsJSON: PublicKeyCredentialRequestOptionsJSON }> {
    return webauthnPost("/api/webauthn/login-options");
  },
  async loginVerify(assertion: AuthenticationResponseJSON): Promise<{ ok: true }> {
    return webauthnPost("/api/webauthn/login-verify", assertion);
  }
};

export const authService = {
  async me() {
    if (hasSupabaseCallbackInLocation()) {
      const completed = await completeSupabaseSession();
      if (completed) {
        return { ok: true as const, data: await apiRequest<AuthSession & { ok: boolean }>("/api/auth/me") };
      }
    }
    try {
      const result = await apiRequest<AuthSession & { ok: boolean }>("/api/auth/me");
      if (!result.authenticated) {
        const completed = await completeSupabaseSession();
        if (completed) {
          return { ok: true as const, data: await apiRequest<AuthSession & { ok: boolean }>("/api/auth/me") };
        }
      }
      return { ok: true as const, data: result };
    } catch {
      return { ok: true as const, data: { authenticated: false } as AuthSession };
    }
  },
  async login(provider: "google" | "microsoft" | "apple") {
    await signInWithSupabase(provider);
  },
  async telegramLogin(payload: TelegramLoginPayload) {
    return apiRequest<{ ok: true; authenticated: true; user: AuthSession["user"]; org: AuthSession["org"] }>("/api/auth/telegram-session", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  async logout() {
    // The Fenrir cookie is authoritative for protected routes, so revoke it
    // even when Supabase storage cleanup is slow or offline.
    await apiRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" }).catch(() => null);
    await Promise.race([
      signOutSupabase().catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 3_000))
    ]);
  }
};

export const liveRoomService = {
  async create(input: { domainId: string; slug: string; title: string; provider: LiveRoomProvider; targetUrl: string; coverImageUrl: string }) {
    return apiRequest<{ ok: true; data: FriskyLiveRoom }>("/api/rooms", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async pause(roomId: string) {
    return apiRequest<{ ok: true; data: FriskyLiveRoom }>("/api/rooms/pause", {
      method: "POST",
      body: JSON.stringify({ roomId })
    });
  },
  async publicRedirect(slug: string) {
    return apiRequest<{ ok: true; room: FriskyLiveRoom }>(`/api/public/room/${encodeURIComponent(slug)}`);
  }
};

export const appService = {
  async load(): Promise<{ ok: true; data: AppState }> {
    return apiRequest<{ ok: true; data: AppState }>("/api/app-state");
  }
};

export const domainService = {
  async create(domain: string) {
    return apiRequest<{ ok: true; data: AppState["domains"][number] }>("/api/domains", {
      method: "POST",
      body: JSON.stringify({ domain })
    });
  },
  async checkDns(domainId: string) {
    try {
      return await apiRequest<{ ok: true; data: AppState["domains"][number] }>("/api/domains/check", {
        method: "POST",
        body: JSON.stringify({ domainId })
      });
    } catch (error) {
      return { ok: false as const, error: { code: "dns_check_failed", message: error instanceof Error ? error.message : "DNS check failed." } };
    }
  }
};

export const bridgeService = {
  async create(input: { domainId: string; slug: string; telegramChatId: string; telegramGroupName: string; telegramGroupImageUrl: string }) {
    return apiRequest<{ ok: true; data: FriskyBridge; invite: FriskyTelegramInvite }>("/api/bridges", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async rotate(bridgeId: string) {
    return apiRequest<{ ok: true; data: FriskyBridge; invite: FriskyTelegramInvite }>("/api/bridges/rotate", {
      method: "POST",
      body: JSON.stringify({ bridgeId })
    });
  },
  async revoke(bridgeId: string) {
    return apiRequest<{ ok: true; data: FriskyBridge }>("/api/bridges/revoke", {
      method: "POST",
      body: JSON.stringify({ bridgeId })
    });
  },
  async publicRedirect(slug: string) {
    return apiRequest<{
      ok: true;
      bridge: FriskyBridge;
      invite: FriskyTelegramInvite | null;
      access: { inviteAvailable: boolean; reason: string };
    }>(`/api/public/bridge/${encodeURIComponent(slug)}`);
  }
};

export const telegramService = {
  async checkPermissions(chatId: string): Promise<{ ok: true; data: TelegramPermissionCheck }> {
    return apiRequest<{ ok: true; data: TelegramPermissionCheck }>("/api/telegram/check", {
      method: "POST",
      body: JSON.stringify({ chatId })
    });
  },
  commandExamples: [
    "/bridge_link main <telegram_group_id>",
    "/bridge_rotate main",
    "/bridge_revoke main",
    "/bridge_links",
    "/bridge_check <telegram_group_id>"
  ]
};

export const aiOpsService = {
  julesTicket() {
    appendAudit("jules_ticket_created", "FriskyOrg", store.org.id, { label: "backend hardening task" });
  },
  geminiDnsExplanation() {
    appendAudit("gemini_dns_explained", "FriskyDomain", store.domains[0]?.id ?? "none", { assistant: "Gemini", note: "DNS wizard guidance generated." });
  },
  cursorHandoff() {
    appendAudit("cursor_handoff_exported", "FriskyOrg", store.org.id, { target: "Cursor workspace" });
  }
};

export const commerceService = {
  click(slug: string) {
    return trackCommissionClick(slug);
  }
};

export const readinessService = {
  async get(): Promise<ReadinessPayload | null> {
    try {
      const response = await fetch("/api/readiness", { credentials: "same-origin" });
      const body = (await response.json().catch(() => null)) as ReadinessPayload | null;
      if (!response.ok || !body?.ok) return null;
      return body;
    } catch {
      return null;
    }
  }
};

export const billingService = {
  async getStatus(): Promise<BillingStatusPayload> {
    return apiRequest<BillingStatusPayload>("/api/billing/status");
  },
  async checkout(plan: PaidPlan): Promise<{ ok: true; url: string }> {
    return apiRequest<{ ok: true; url: string }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan })
    });
  },
  async portal(): Promise<{ ok: true; url: string }> {
    return apiRequest<{ ok: true; url: string }>("/api/billing/portal", { method: "POST" });
  },
  async telegramStars(): Promise<{ ok: true; botUsername: string; url: string; stars: number; mode: "telegram_stars" }> {
    return apiRequest<{ ok: true; botUsername: string; url: string; stars: number; mode: "telegram_stars" }>("/api/telegram/stars");
  }
};

export const telegramIdentityService = {
  async status(): Promise<TelegramIdentityLinkPayload> {
    return apiRequest<TelegramIdentityLinkPayload>("/api/telegram/link");
  },
  async start(): Promise<TelegramIdentityLinkStartPayload> {
    return apiRequest<TelegramIdentityLinkStartPayload>("/api/telegram/link", { method: "POST" });
  },
  async readd(input: { bridgeId?: string; chatId?: string }): Promise<TelegramReaddPayload> {
    return apiRequest<TelegramReaddPayload>("/api/telegram/readd", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }
};
