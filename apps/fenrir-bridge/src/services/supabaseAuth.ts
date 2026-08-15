// `@supabase/supabase-js` se importa SOLO como tipo aquí: los tipos se borran
// en compilación y no arrastran la librería al chunk inicial. El runtime
// (`createClient`) se carga con dynamic import dentro de `supabaseClient()`, que
// únicamente se invoca en flujos de auth (login / callback / logout). Así la
// landing no paga el peso de supabase-js hasta que el usuario interactúa.
import type { Provider, SupabaseClient } from "@supabase/supabase-js";
import { sharedSessionStorage, sharedStorageKey } from "./sharedSession";

type AuthProvider = "google" | "microsoft" | "apple";

// Production defaults are baked in so a build made WITHOUT .env still produces
// the working Supabase login instead of silently falling back to another broker
// (a silent fallback is exactly how the old broker regression shipped). Both
// values are public by design — they are embedded in every client bundle.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://yqevglppbhuoxxfsfnih.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_t8xng5GIhOmAtT4Nsf7Zgg_TO36FTTE";
const authRedirectOrigin = (import.meta.env.VITE_AUTH_REDIRECT_ORIGIN ?? "").trim();
const previewAuthEnabled = import.meta.env.VITE_PREVIEW_AUTH_ENABLED === "true";
const authRedirectPath = (import.meta.env.VITE_AUTH_REDIRECT_PATH ?? "/auth/callback").trim();
const fenrirManagedUrl = (import.meta.env.VITE_FENRIR_MANAGED_URL ?? "/main").trim();
const postAuthDestinationKey = "fenrir_post_auth_destination";

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

function isSafeRedirectPath(path: string | null) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return !isAuthCallbackPath(pathname);
}

function currentPostAuthDestination() {
  const destination = window.location.pathname;
  return destination === "/" || !isSafeRedirectPath(destination) ? fallbackPostAuthDestination() : destination;
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
  if (window.location.hostname.endsWith(".pages.dev") && !previewAuthEnabled) {
    throw new Error("preview_auth_not_configured");
  }
  const supabase = await supabaseClient();
  rememberPostAuthDestination();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: supabaseProvider(providerName),
    options: {
      redirectTo: configuredRedirectTarget(),
      scopes: providerName === "microsoft" ? "email profile" : undefined
    }
  });
  if (error) throw error;
}

export async function completeSupabaseSession() {
  if (!isSupabaseAuthConfigured()) return false;
  const params = parseSupabaseCallbackParams();

  if (params.error) {
    const detail = params.errorDescription?.trim();
    const errorKey = params.error === "access_denied" ? "oauth_access_denied" : "oauth_callback_error";
    setAuthCallbackError(`${errorKey}${detail ? `:${encodeURIComponent(detail)}` : ""}`);
    clearCallbackParameters(params.hasCallbackParams);
    return false;
  }

  const supabase = await supabaseClient();
  const code = params.code;

  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch (error) {
      setAuthCallbackError(`code_exchange_failed:${encodeURIComponent(error instanceof Error ? error.message : "exchange_failed")}`);
      return false;
    }
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setAuthCallbackError(`session_lookup_failed:${encodeURIComponent(error.message)}`);
    return false;
  }
  const accessToken = data.session?.access_token;
  if (!accessToken) return false;

  const response = await fetch("/api/auth/supabase-session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken })
  });
  if (!response.ok) {
    setAuthCallbackError(`supabase_session_failed:${encodeURIComponent(await readResponseError(response))}`);
    return false;
  }
  if (params.hasCallbackParams || isAuthCallbackPath(window.location.pathname)) {
    clearCallbackParameters(params.hasCallbackParams);
  }
  return true;
}

export async function signOutSupabase() {
  if (!isSupabaseAuthConfigured()) return;
  try {
    window.localStorage.removeItem(postAuthDestinationKey);
  } catch {
    // Ignore storage cleanup failures.
  }
  await (await supabaseClient()).auth.signOut();
}

async function supabaseClient() {
  if (!isSupabaseAuthConfigured()) {
    console.warn("Supabase auth is not configured correctly. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env. Placeholder 'example.supabase.co' is not allowed.");
    throw new Error("supabase_auth_not_configured");
  }
  // Carga diferida de supabase-js: sale del chunk inicial y sólo se descarga
  // cuando de verdad se necesita un cliente (login/callback/logout).
  const { createClient } = await import("@supabase/supabase-js");
  // La sesión se guarda en una cookie de `.myfenrir.com` para que valga en
  // todas las superficies (communities.myfenrir.com incluida) — ver
  // services/sharedSession.ts. La clave es la que Supabase usa por defecto,
  // así que las sesiones ya abiertas en localStorage se adoptan sin re-login.
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: sharedSessionStorage,
      storageKey: sharedStorageKey(supabaseUrl),
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
  const nextParams = new URLSearchParams(window.location.search);
  for (const key of callbackParameterKeys) {
    nextParams.delete(key);
  }
  const nextSearch = nextParams.toString();
  const target = `${destinationPath}${nextSearch ? `?${nextSearch}` : ""}`;
  window.history.replaceState({}, "", target);
}

function setAuthCallbackError(code: string) {
  const params = parseSupabaseCallbackParams();
  const destinationPath = callbackDestinationPath(window.location.pathname, params.hasCallbackParams);
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("auth_error", code);
  const nextSearch = nextParams.toString();
  if (destinationPath === "/") {
    window.history.replaceState({}, "", `/?${nextSearch}`);
    return;
  }
  window.history.replaceState({}, "", `${destinationPath}${nextSearch ? `?${nextSearch}` : ""}`);
}

const callbackParameterKeys = ["code", "error", "error_description", "state", "scope", "access_token", "id_token", "refresh_token", "token_type", "expires_in"];

async function readResponseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? `session_error_${response.status}`;
}
