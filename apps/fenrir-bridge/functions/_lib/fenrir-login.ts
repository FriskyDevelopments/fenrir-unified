export const FENRIR_LOGIN_ORIGIN = "https://myfenrir.com";
export const FENRIR_LOGIN_WWW_ORIGIN = "https://www.myfenrir.com";
export const TELEGRAM_LINK_START_PATH = "/api/telegram/link/start";
export const COMMUNITY_SSO_PATH = "/api/auth/community-sso";

const AUTH_READY_ORIGINS = [FENRIR_LOGIN_ORIGIN, FENRIR_LOGIN_WWW_ORIGIN] as const;
const SOCIAL_PROVIDERS = ["google", "microsoft", "apple"] as const;

export function canonicalFenrirLoginUrl(nextPath: string): string {
  const login = new URL("/login", FENRIR_LOGIN_ORIGIN);
  login.searchParams.set("next", nextPath);
  return login.toString();
}

export function preservedLoginNext(next: string | null | undefined): string | null {
  if (!next?.startsWith("/") || next.startsWith("//")) return null;
  const pathname = next.split(/[?#]/, 1)[0] ?? "";
  if (pathname === TELEGRAM_LINK_START_PATH) return pathname;
  if (pathname === COMMUNITY_SSO_PATH) return next;
  if (pathname === "/login" || pathname === "/main" || pathname.startsWith("/main/")) {
    try {
      return preservedLoginNext(new URL(next, FENRIR_LOGIN_ORIGIN).searchParams.get("next"));
    } catch {
      return null;
    }
  }
  return null;
}

function isSocialProviderTrue(value: unknown): boolean {
  return value === true;
}

/**
 * /auth/health 200 `{ service: "fenrir-auth-worker" }` is liveness only.
 * Browser login follows public /auth/ready on apex and www: HTTP 200 JSON
 * with ready true, or at least one of providers.google|microsoft|apple true.
 */
export function isFenrirAuthWorkerReady(
  status: number,
  contentType: string | null | undefined,
  body: unknown,
): boolean {
  if (status !== 200) return false;
  if (!contentType?.toLowerCase().includes("application/json")) return false;
  if (!body || typeof body !== "object") return false;
  const doc = body as Record<string, unknown>;
  if (doc.ready === true) return true;
  const providers = doc.providers;
  if (!providers || typeof providers !== "object") return false;
  const advertised = providers as Record<string, unknown>;
  return SOCIAL_PROVIDERS.some((name) => isSocialProviderTrue(advertised[name]));
}

async function fetchPublicAuthReady(origin: string): Promise<boolean> {
  const response = await fetch(new URL("/auth/ready", origin).toString(), {
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  return isFenrirAuthWorkerReady(response.status, response.headers.get("content-type"), body);
}

/**
 * Probe public /auth/ready on both myfenrir.com and www. Do not use /auth/health
 * or the Pages AUTH service binding: health can be 200 while ready is 503 with
 * every social provider false, which is the live Worker today.
 */
export async function publicFenrirAuthWorkerIsLive(): Promise<boolean> {
  try {
    const results = await Promise.all(AUTH_READY_ORIGINS.map((origin) => fetchPublicAuthReady(origin)));
    return results.every(Boolean);
  } catch {
    return false;
  }
}
