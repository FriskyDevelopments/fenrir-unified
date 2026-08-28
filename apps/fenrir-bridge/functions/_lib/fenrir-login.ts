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
 * AUTH service binding. /auth/health is liveness only (200 while secrets are
 * missing). Cut over only when /auth/ready is 200 and at least one provider
 * can start — otherwise keep Pages Google/Microsoft OAuth.
 */
export function fenrirAuthWorkerCanStartLogin(
  status: number,
  contentType: string | null | undefined,
  body: unknown,
): boolean {
  if (status !== 200) return false;
  if (!isFenrirAuthWorkerDocument(contentType, body)) return false;
  const doc = body as Record<string, unknown>;
  if (doc.ready === true) return true;
  const providers = doc.providers;
  if (!providers || typeof providers !== "object") return false;
  for (const name of ["google", "microsoft", "apple"] as const) {
    const entry = (providers as Record<string, unknown>)[name];
    if (entry === true) return true;
    if (
      entry &&
      typeof entry === "object" &&
      (entry as { can_start?: boolean }).can_start === true
    ) {
      return true;
    }
  }
  return false;
}

export async function publicFenrirAuthWorkerIsLive(
  origin: string = FENRIR_LOGIN_ORIGIN,
): Promise<boolean> {
  try {
    const response = await fetch(new URL("/auth/ready", origin).toString(), {
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    return fenrirAuthWorkerCanStartLogin(
      response.status,
      response.headers.get("content-type"),
      body,
    );
  } catch {
    return false;
  }
}
