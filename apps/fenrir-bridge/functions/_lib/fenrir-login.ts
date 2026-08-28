export const FENRIR_LOGIN_ORIGIN = "https://myfenrir.com";
export const TELEGRAM_LINK_START_PATH = "/api/telegram/link/start";
export const COMMUNITY_SSO_PATH = "/api/auth/community-sso";

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

export function isFenrirAuthWorkerDocument(contentType: string | null | undefined, body: unknown): boolean {
  if (!contentType?.toLowerCase().includes("application/json")) return false;
  if (!body || typeof body !== "object") return false;
  const doc = body as Record<string, unknown>;
  return doc.service === "fenrir-auth-worker" || typeof doc.ready === "boolean";
}

/**
 * Browser login must follow the public /auth/* zone routes, not the Pages
 * AUTH service binding. The binding can succeed while myfenrir.com/auth/health
 * still serves SPA HTML, which would 302 the visitor into a dead Worker URL.
 */
export async function publicFenrirAuthWorkerIsLive(
  origin: string = FENRIR_LOGIN_ORIGIN,
): Promise<boolean> {
  try {
    const response = await fetch(new URL("/auth/health", origin).toString(), {
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    return isFenrirAuthWorkerDocument(response.headers.get("content-type"), body);
  } catch {
    return false;
  }
}
