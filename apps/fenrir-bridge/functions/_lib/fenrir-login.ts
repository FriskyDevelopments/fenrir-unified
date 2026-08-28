export const FENRIR_LOGIN_ORIGIN = "https://myfenrir.com";
export const TELEGRAM_LINK_START_PATH = "/api/telegram/link/start";
export const COMMUNITY_SSO_PATH = "/api/auth/community-sso";

/**
 * Builds the canonical Fenrir login URL with a redirect target.
 *
 * @param nextPath - The path to preserve after login
 * @returns The canonical login URL containing the redirect target
 */
export function canonicalFenrirLoginUrl(nextPath: string): string {
  const login = new URL("/login", FENRIR_LOGIN_ORIGIN);
  login.searchParams.set("next", nextPath);
  return login.toString();
}

/**
 * Preserves a safe internal redirect target for the login flow.
 *
 * @param next - The candidate redirect path, including any nested `next` parameter
 * @returns The supported redirect path, or `null` when the target is invalid
 */
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

/**
 * Determines whether a response represents the Fenrir authentication worker.
 *
 * @param contentType - The response content type.
 * @param body - The parsed response body.
 * @returns `true` if the response is JSON and identifies the Fenrir authentication worker, `false` otherwise.
 */
export function isFenrirAuthWorkerDocument(contentType: string | null | undefined, body: unknown): boolean {
  if (!contentType?.toLowerCase().includes("application/json")) return false;
  if (!body || typeof body !== "object") return false;
  const doc = body as Record<string, unknown>;
  return doc.service === "fenrir-auth-worker" || typeof doc.ready === "boolean";
}

/**
 * Checks whether the public Fenrir authentication worker is serving its health endpoint.
 *
 * @param origin - The origin hosting the authentication worker
 * @returns `true` if the health response identifies the Fenrir authentication worker, `false` otherwise
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
