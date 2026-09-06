// `@supabase/supabase-js` se importa SOLO como tipo aquí: los tipos se borran
// en compilación y no arrastran la librería al chunk inicial. El runtime
// (`createClient`) se carga con dynamic import dentro de `supabaseClient()`, que
// únicamente se invoca en flujos de auth (login / callback / logout). Así la
// landing no paga el peso de supabase-js hasta que el usuario interactúa.
import type { Provider, SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout, withDeadline } from "./request";

type AuthProvider = "google" | "microsoft" | "apple";

// Production defaults are baked in so a build made WITHOUT .env still produces
// the working Supabase login instead of silently falling back to another broker
// (a silent fallback is exactly how the old broker regression shipped). Both
// values are public by design — they are embedded in every client bundle.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://yqevglppbhuoxxfsfnih.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_t8xng5GIhOmAtT4Nsf7Zgg_TO36FTTE";
const authRedirectOrigin = (import.meta.env.VITE_AUTH_REDIRECT_ORIGIN ?? "https://www.myfenrir.com").trim();
const authRedirectPath = (import.meta.env.VITE_AUTH_REDIRECT_PATH ?? "/auth/callback").trim();
const fenrirManagedUrl = (import.meta.env.VITE_FENRIR_MANAGED_URL ?? "/main").trim();
const postAuthDestinationKey = "fenrir_post_auth_destination";
const signedOutKey = "fenrir_auth_signed_out";
function sessionStorageKey() {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}
const humanVerificationRequired = "human_verification_required";

function sanitizeRedirectPath(path: string) {
  if (!path) return "/auth/callback";
  return path.startsWith("/") ? path : `/${path}`;
}

function configuredRedirectOrigin() {
  return authRedirectOrigin || window.location.origin;
}

function configuredRedirectTarget() {
  const origin = configuredRedirectOrigin().replace(/\/+$/, "");
  const callbackPath = sanitizeRedirectPath(authRedirectPath);
  return `${origin}${callbackPath}`;
}

let client: SupabaseClient | null = null;
let sessionGeneration = 0;
const pendingSessionRequests = new Set<AbortController>();

export function isSupabaseAuthConfigured() {
  return Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    !supabaseUrl.includes("example.supabase.co") && 
    !supabaseUrl.includes("<your-project-ref>") &&
    supabaseUrl.startsWith("https://")
  );
}

export function hasSupabaseCallbackInLocation() {
  return parseSupabaseCallbackParams().hasCallbackParams || isAuthCallbackPath(window.location.pathname);
}

function isAuthCallbackPath(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalizedPath === "/auth/callback" || 
         normalizedPath === "/auth/v1/callback" || 
         normalizedPath === sanitizeRedirectPath(authRedirectPath);
}

function fallbackPostAuthDestination() {
  try {
    const parsed = new URL(fenrirManagedUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/main";
    const destination = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return isSafeRedirectPath(destination) ? destination : "/main";
  } catch {
    return "/main";
  }
}

export function isSafeRedirectPath(path: string | null) {
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path)) return false;
  const destination = new URL(path, window.location.origin);
  if (destination.origin !== window.location.origin) return false;
  const pathname = destination.pathname.replace(/\/+$/, "") || "/";
  const authRoute = pathname.startsWith("/api/auth/") && pathname !== "/api/auth/community-sso";
  return pathname !== "/login" && !authRoute && !isAuthCallbackPath(pathname);
}

function currentPostAuthDestination() {
  const requested = new URLSearchParams(window.location.search).get("next");
  if (isSafeRedirectPath(requested)) return requested as string;
  const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return window.location.pathname === "/" || !isSafeRedirectPath(destination) ? fallbackPostAuthDestination() : destination;
}

function rememberPostAuthDestination() {
  try {
    window.localStorage.setItem(postAuthDestinationKey, currentPostAuthDestination());
  } catch {
    // If storage is unavailable, the callback safely falls back to the dashboard root.
  }
}

function consumePostAuthDestination() {
  try {
    const destination = window.localStorage.getItem(postAuthDestinationKey);
    window.localStorage.removeItem(postAuthDestinationKey);
    return isSafeRedirectPath(destination) ? destination as string : fallbackPostAuthDestination();
  } catch {
    return fallbackPostAuthDestination();
  }
}

function callbackDestinationPath(pathname: string, hasCallbackParams = false) {
  if (isAuthCallbackPath(pathname)) return consumePostAuthDestination();
  if (hasCallbackParams && (pathname === "/" || pathname === "/login")) return consumePostAuthDestination();
  return pathname;
}

export async function signInWithSupabase(providerName: AuthProvider) {
  try { window.localStorage.removeItem(signedOutKey); } catch { /* Storage can be unavailable. */ }
  const supabase = await withDeadline(supabaseClient());
  rememberPostAuthDestination();
  const { error } = await withDeadline(supabase.auth.signInWithOAuth({
    provider: supabaseProvider(providerName),
    options: {
      redirectTo: configuredRedirectTarget(),
      scopes: providerName === "microsoft" ? "email profile" : undefined
    }
  }));
  if (error) throw error;
}

export async function completeSupabaseSession() {
  if (!isSupabaseAuthConfigured()) return false;
  const generation = sessionGeneration;
  const params = parseSupabaseCallbackParams();
  // A failed remote sign-out must never silently restore a session on return.
  try {
    if (!params.hasCallbackParams && window.localStorage.getItem(signedOutKey)) return false;
  } catch { /* Continue with the provider's own storage handling. */ }

  if (params.error) {
    const detail = params.errorDescription?.trim();
    const errorKey = params.error === "access_denied" ? "oauth_access_denied" : "oauth_callback_error";
    setAuthCallbackError(`${errorKey}${detail ? `:${encodeURIComponent(detail)}` : ""}`);
    return false;
  }

  const supabase = await withDeadline(supabaseClient());
  const code = params.code;

  if (code) {
    try {
      const { error } = await withDeadline(supabase.auth.exchangeCodeForSession(code));
      if (error) throw error;
    } catch (error) {
      setAuthCallbackError(`code_exchange_failed:${encodeURIComponent(error instanceof Error ? error.message : "exchange_failed")}`);
      return false;
    }
  }

  const { data, error } = await withDeadline(supabase.auth.getSession());
  if (error) {
    setAuthCallbackError(`session_lookup_failed:${encodeURIComponent(error.message)}`);
    return false;
  }
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    if (params.hasCallbackParams || isAuthCallbackPath(window.location.pathname)) {
      setAuthCallbackError("session_lookup_failed:missing_session");
    }
    return false;
  }
  // A lookup started before sign-out must not mint a fresh server cookie later.
  if (generation !== sessionGeneration) return false;

  const controller = new AbortController();
  pendingSessionRequests.add(controller);
  let response: Response;
  try {
    response = await fetchWithTimeout("/api/auth/supabase-session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
      signal: controller.signal,
    });
  } finally {
    pendingSessionRequests.delete(controller);
  }
  if (generation !== sessionGeneration) return false;
  if (!response.ok) {
    const responseError = await readResponseError(response);
    if (response.status === 403 && responseError === humanVerificationRequired) {
      // The provider callback is already safely stored in the Supabase client.
      // Do not turn the expected pre-login gate into a user-facing auth error:
      // clear callback material, show HumanVerification, then retry after it succeeds.
      if (params.hasCallbackParams || isAuthCallbackPath(window.location.pathname)) {
        clearCallbackParameters(params.hasCallbackParams);
      }
      clearDeferredVerificationError();
      return false;
    }
    setAuthCallbackError(`supabase_session_failed:${encodeURIComponent(responseError)}`);
    return false;
  }
  if (params.hasCallbackParams || isAuthCallbackPath(window.location.pathname)) {
    clearCallbackParameters(params.hasCallbackParams);
  }
  try { window.localStorage.removeItem(signedOutKey); } catch { /* Storage can be unavailable. */ }
  return true;
}

export async function signOutSupabase() {
  if (!isSupabaseAuthConfigured()) return;
  sessionGeneration += 1;
  for (const request of pendingSessionRequests) request.abort();
  pendingSessionRequests.clear();
  try {
    window.localStorage.removeItem(postAuthDestinationKey);
    window.localStorage.setItem(signedOutKey, "1");
  } catch {
    // Ignore storage cleanup failures.
  }
  try {
    const supabase = await withDeadline(supabaseClient());
    const { error } = await withDeadline(supabase.auth.signOut({ scope: "local" }));
    if (error) throw error;
  } finally {
    // Supabase can retain its persisted session when remote revocation fails.
    // Always remove this origin's credentials; Community owns separate storage.
    if (client) void client.auth.stopAutoRefresh().catch(() => undefined);
    client = null;
    try {
      const authStorageKey = sessionStorageKey();
      for (const key of [authStorageKey, `${authStorageKey}-code-verifier`, `${authStorageKey}-user`]) {
        window.localStorage.removeItem(key);
      }
    } catch { /* The signed-out marker still prevents automatic restoration. */ }
  }
}

async function supabaseClient() {
  if (!isSupabaseAuthConfigured()) {
    console.warn("Supabase auth is not configured correctly. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env. Placeholder 'example.supabase.co' is not allowed.");
    throw new Error("supabase_auth_not_configured");
  }
  // Carga diferida de supabase-js: sale del chunk inicial y sólo se descarga
  // cuando de verdad se necesita un cliente (login/callback/logout).
  const { createClient } = await import("@supabase/supabase-js");
  // Main MyFenrir owns this browser session. Community Bridge intentionally
  // keeps a distinct identity boundary and therefore must not receive this
  // token through a parent-domain cookie.
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchWithTimeout },
    auth: {
      storageKey: sessionStorageKey(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return client;
}

function supabaseProvider(providerName: AuthProvider): Provider {
  if (providerName === "microsoft") return "azure";
  return providerName;
}

function parseSupabaseCallbackParams() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(
    window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
  );

  return {
    code: search.get("code") ?? hash.get("code"),
    error: search.get("error") ?? hash.get("error"),
    errorDescription: search.get("error_description") ?? hash.get("error_description"),
    hasCallbackParams: hasSupabaseCallbackParams(search) || hasSupabaseCallbackParams(hash)
  };
}

function hasSupabaseCallbackParams(params: URLSearchParams) {
  return ["code", "error", "error_description", "state", "scope", "access_token", "id_token", "refresh_token", "token_type", "expires_in"].some((key) => params.has(key));
}

function clearCallbackParameters(hasCallbackParams = false) {
  const destinationPath = callbackDestinationPath(window.location.pathname, hasCallbackParams);
  const destination = new URL(destinationPath, window.location.origin);
  const nextParams = new URLSearchParams(destination.search);
  for (const [key, value] of new URLSearchParams(window.location.search)) nextParams.set(key, value);
  for (const key of callbackParameterKeys) {
    nextParams.delete(key);
  }
  const nextSearch = nextParams.toString();
  const target = `${destination.pathname}${nextSearch ? `?${nextSearch}` : ""}${destination.hash}`;
  window.history.replaceState({}, "", target);
}

function setAuthCallbackError(code: string) {
  const params = parseSupabaseCallbackParams();
  const destinationPath = callbackDestinationPath(window.location.pathname, params.hasCallbackParams);
  const destination = new URL(destinationPath, window.location.origin);
  const nextParams = new URLSearchParams(destination.search);
  for (const [key, value] of new URLSearchParams(window.location.search)) nextParams.set(key, value);
  for (const key of callbackParameterKeys) nextParams.delete(key);
  nextParams.set("auth_error", code);
  const nextSearch = nextParams.toString();
  window.history.replaceState({}, "", `${destination.pathname}${nextSearch ? `?${nextSearch}` : ""}${destination.hash}`);
}

function clearDeferredVerificationError() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("auth_error") !== `supabase_session_failed:${humanVerificationRequired}`) return;
  params.delete("auth_error");
  params.delete("auth_error_detail");
  const nextSearch = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
}

const callbackParameterKeys = ["code", "error", "error_description", "state", "scope", "access_token", "id_token", "refresh_token", "token_type", "expires_in"];

async function readResponseError(response: Response) {
  const body = await withDeadline(response.json()).catch(() => null) as { error?: string } | null;
  return body?.error ?? `session_error_${response.status}`;
}
