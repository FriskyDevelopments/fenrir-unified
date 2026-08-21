import type { Session, User } from "@supabase/supabase-js";

/**
 * Demo mode: a client-only preview switch that fakes an authenticated staff
 * session so every screen (dashboard, activate, gates, brands console) can be
 * opened and reviewed without signing in. It never touches the backend — any
 * server-backed list simply comes back empty.
 */
const LINK_KEY = "fenrir_demo_telegram_linked";
const CODE_KEY = "fenrir_demo_link_code";

/** The one static code that always "works" in demo mode. */
export const DEMO_LINK_CODE = "FENRIR";
/** A code that is always treated as expired, so that error state is reviewable. */
export const DEMO_EXPIRED_CODE = "EXPIRD";
/** A code that is always treated as malformed. */
export const DEMO_MALFORMED_CODE = "AB-1";
/** Telegram identity shown once the demo account is linked. */
export const DEMO_TELEGRAM_ID = 1234567;
export const DEMO_TELEGRAM_PROFILE = {
  id: DEMO_TELEGRAM_ID,
  username: "demo_fenrir",
  firstName: "Demo",
  lastName: "User",
  photoUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=fenrir-demo",
};

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_LENGTH = 6;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type DemoRedeemFailure = "malformed" | "expired" | "invalid";
export type DemoRedeemResult = { ok: true } | { ok: false; reason: DemoRedeemFailure };

export interface DemoLinkCode {
  code: string;
  issuedAt: number;
  expiresAt: number;
}

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  // Demo access must be explicit for the current URL. Persisting it in local
  // storage made real public Gates adopt a mock owner session after a preview.
  return new URLSearchParams(window.location.search).has("demo");
}

export function setDemoMode(on: boolean): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (on) url.searchParams.set("demo", "1");
  else {
    url.searchParams.delete("demo");
    try {
      window.localStorage.removeItem(LINK_KEY);
      window.localStorage.removeItem(CODE_KEY);
    } catch {
      /* storage unavailable — demo mode is still off */
    }
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Whether the simulated Telegram link has been completed in this browser. */
export function isDemoTelegramLinked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LINK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoTelegramLinked(linked: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (linked) window.localStorage.setItem(LINK_KEY, "1");
    else window.localStorage.removeItem(LINK_KEY);
  } catch {
    /* ignore */
  }
}

/** Mint a fresh, short-lived linking code (as if the bot had just sent one). */
export function issueDemoLinkCode(): DemoLinkCode {
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)))
      : Array.from({ length: CODE_LENGTH }, () => Math.floor(Math.random() * 256));
  const code = bytes.map((b) => ALPHABET[b % ALPHABET.length]).join("");
  const issuedAt = Date.now();
  const issued: DemoLinkCode = { code, issuedAt, expiresAt: issuedAt + CODE_TTL_MS };
  try {
    window.localStorage.setItem(CODE_KEY, JSON.stringify(issued));
  } catch {
    /* ignore */
  }
  return issued;
}

export function getDemoLinkCode(): DemoLinkCode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoLinkCode;
    if (!parsed?.code || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDemoLinkCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
}

/** Force the stored code into an expired state (for the expiry scenario). */
export function expireDemoLinkCode(): DemoLinkCode | null {
  const current = getDemoLinkCode();
  if (!current) return null;
  const expired: DemoLinkCode = { ...current, expiresAt: Date.now() - 1000 };
  try {
    window.localStorage.setItem(CODE_KEY, JSON.stringify(expired));
  } catch {
    /* ignore */
  }
  return expired;
}

/**
 * Simulated redemption: latency, then classify the code so the UI can show the
 * matching error state (malformed / expired / simply wrong) without leaving the
 * activation screen.
 */
export async function demoRedeemLinkCode(code: string): Promise<DemoRedeemResult> {
  await new Promise((r) => window.setTimeout(r, 900));
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) return { ok: false, reason: "malformed" };
  if (normalized === DEMO_EXPIRED_CODE) return { ok: false, reason: "expired" };

  const issued = getDemoLinkCode();
  if (issued && normalized === issued.code) {
    if (Date.now() > issued.expiresAt) return { ok: false, reason: "expired" };
    setDemoTelegramLinked(true);
    return { ok: true };
  }
  if (normalized === DEMO_LINK_CODE) {
    setDemoTelegramLinked(true);
    return { ok: true };
  }
  return { ok: false, reason: "invalid" };
}



const demoUser = {
  id: "00000000-0000-4000-8000-000000000demo".slice(0, 36),
  aud: "authenticated",
  role: "authenticated",
  email: "demo@example.com",
  app_metadata: {},
  user_metadata: { full_name: "Demo User" },
  created_at: new Date(0).toISOString(),
} as unknown as User;

export const DEMO_SESSION = {
  access_token: "demo",
  refresh_token: "demo",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  user: demoUser,
} as unknown as Session;
