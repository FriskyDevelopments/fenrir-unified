import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const directOauthGuardSource = readFileSync(join(root, "workers/fenrir-direct-oauth-guard.js"), "utf8");
const directOauthSource = readFileSync(join(root, "functions/_lib/oauth.ts"), "utf8");
const directOauthLoginSource = readFileSync(join(root, "functions/api/auth/login/[provider].ts"), "utf8");
const directOauthCallbackSource = readFileSync(join(root, "functions/api/auth/callback/[provider].ts"), "utf8");
const apiSource = readFileSync(join(root, "src/services/api.ts"), "utf8");
const mainSource = readFileSync(join(root, "src/main.tsx"), "utf8");
const honeybadgerClientSource = readFileSync(join(root, "src/services/honeybadger.ts"), "utf8");
const honeybadgerServerSource = readFileSync(join(root, "functions/_lib/honeybadger.ts"), "utf8");
const workosSource = readFileSync(join(root, "functions/_lib/workos.ts"), "utf8");
const workosLoginSource = readFileSync(join(root, "functions/api/auth/workos/login.ts"), "utf8");
const workosCallbackSource = readFileSync(join(root, "functions/api/auth/callback/workos.ts"), "utf8");

const checks = [
  {
    name: "auth service routes social login through WorkOS AuthKit",
    pass: apiSource.includes("VITE_DIRECT_AUTH_ORIGIN") &&
      apiSource.includes("/api/auth/workos/login?provider=") &&
      apiSource.includes("return_to=${encodeURIComponent(returnTo)}") &&
      !apiSource.includes("signInWithSupabase")
  },
  {
    name: "Supabase client login flow is fully removed from the browser bundle",
    pass: !apiSource.includes("supabaseAuth") &&
      !apiSource.includes("completeSupabaseSession") &&
      !apiSource.includes("hasSupabaseCallbackInLocation")
  },
  {
    name: "WorkOS login builds an AuthKit authorize URL with a signed state cookie",
    pass: workosLoginSource.includes("buildAuthorizationUrl") &&
      workosLoginSource.includes("stateSetCookie") &&
      workosSource.includes("user_management/authorize") &&
      workosSource.includes('params.set("provider", providerHint ? providerMap[providerHint] : "authkit")')
  },
  {
    name: "WorkOS login fails closed to /login on misconfig, never a raw 500",
    pass: workosLoginSource.includes('auth_error: "workos_login_init_failed"') &&
      workosLoginSource.includes("isWorkOSConfigured(context.env)") &&
      workosLoginSource.includes("status: 302")
  },
  {
    name: "WorkOS callback validates state, exchanges the code, and mints the Fenrir session cookie",
    pass: workosCallbackSource.includes("readState") &&
      workosCallbackSource.includes("stored.state !== state") &&
      workosCallbackSource.includes("exchangeCodeForSession") &&
      workosCallbackSource.includes("signSession") &&
      workosCallbackSource.includes("sessionSetCookie") &&
      workosSource.includes("user_management/authenticate")
  },
  {
    name: "auth service reads the server session via /api/auth/me",
    pass: apiSource.includes('apiRequest<AuthSession & { ok: boolean }>("/api/auth/me")')
  },
  {
    name: "direct OAuth login stores a signed PKCE transaction cookie",
    pass: directOauthLoginSource.includes("createOAuthTransaction(provider") &&
      directOauthLoginSource.includes("transactionSetCookie") &&
      directOauthSource.includes("code_challenge_method") &&
      directOauthSource.includes("S256") &&
      directOauthSource.includes("code_verifier: tx.verifier")
  },
  {
    name: "direct OAuth callback validates state and OIDC ID tokens",
    pass: directOauthCallbackSource.includes("readOAuthTransaction") &&
      directOauthCallbackSource.includes("validateOAuthTransaction") &&
      directOauthSource.includes("id_token_signature_invalid") &&
      directOauthSource.includes("id_token_nonce_invalid") &&
      directOauthSource.includes("id_token_audience_invalid")
  },
  {
    name: "authenticated app shell never normalizes login success back to public root",
    pass: appSource.includes('const managedDashboardPath = "/main";') &&
      appSource.includes('return page === "command" ? managedDashboardPath : `/${page}`;') &&
      appSource.includes('window.history.replaceState({}, "", managedDashboardPath);') &&
      appSource.includes('window.location.assign(managedDashboardPath);')
  },
  {
    name: "direct OAuth guard does not force /api/auth/me to signed-out",
    pass: !directOauthGuardSource.includes('url.pathname === "/api/auth/me"') &&
      !directOauthGuardSource.includes("authenticated: false")
  },
  {
    name: "Honeybadger browser errors proxy through Fenrir without exposing an API key",
    pass: mainSource.includes("installHoneybadgerBrowserReporter();") &&
      honeybadgerClientSource.includes('fetch("/api/observability/client-error"') &&
      honeybadgerClientSource.includes("window.addEventListener(\"unhandledrejection\"") &&
      !honeybadgerClientSource.includes("HONEYBADGER_API_KEY") &&
      honeybadgerServerSource.includes("https://api.honeybadger.io/v1/notices") &&
      honeybadgerServerSource.includes('"X-API-Key": apiKey')
  },
  {
    name: "WorkOS return_to rejects open redirects and auth loops",
    pass: workosSource.includes('value.startsWith("//")') &&
      workosSource.includes('pathname.startsWith("/auth/")') &&
      workosSource.includes('pathname.startsWith("/api/auth/")') &&
      workosSource.includes('return "/main"')
  },
  {
    name: "WorkOS state cookie is HMAC-signed and expires",
    pass: workosSource.includes("HttpOnly; Secure; SameSite=Lax") &&
      workosSource.includes("timingSafeEqual(signature, expected)") &&
      workosSource.includes("payload.exp < Math.floor(Date.now() / 1000)")
  }
];

let failed = false;
for (const check of checks) {
  if (check.pass) {
    console.log(`ok - ${check.name}`);
  } else {
    failed = true;
    console.error(`not ok - ${check.name}`);
  }
}

const simulatedStorage = new Map();
const callbackPaths = new Set(["/auth/callback", "/auth/v1/callback", "/login"]);

function isAuthCallbackPath(pathname) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return callbackPaths.has(normalizedPath);
}

function isSafeRedirectPath(path) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false;
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return !isAuthCallbackPath(pathname);
}

function fallbackPostAuthDestination() {
  return "/main";
}

function consumePostAuthDestination() {
  const destination = simulatedStorage.get("fenrir_post_auth_destination");
  simulatedStorage.delete("fenrir_post_auth_destination");
  return isSafeRedirectPath(destination) ? destination : fallbackPostAuthDestination();
}

function callbackDestinationPath(pathname, hasCallbackParams = false) {
  if (isAuthCallbackPath(pathname)) return consumePostAuthDestination();
  if (hasCallbackParams && (pathname === "/" || pathname === "/login")) return consumePostAuthDestination();
  return pathname;
}

const cases = [
  { saved: "/locks", callback: "/auth/callback", hasCallbackParams: false, expected: "/locks" },
  { saved: "/telegram", callback: "/login", hasCallbackParams: true, expected: "/telegram" },
  { saved: "/telegram", callback: "/login", hasCallbackParams: false, expected: "/telegram" },
  { saved: "https://evil.example/path", callback: "/auth/callback", hasCallbackParams: false, expected: "/main" },
  { saved: "//evil.example/path", callback: "/auth/callback", hasCallbackParams: false, expected: "/main" },
  { saved: "/auth/callback", callback: "/auth/callback", hasCallbackParams: false, expected: "/main" },
  { saved: null, callback: "/", hasCallbackParams: true, expected: "/main" },
  { saved: "/locks", callback: "/", hasCallbackParams: true, expected: "/locks" },
  { saved: "/locks", callback: "/", hasCallbackParams: false, expected: "/" }
];

for (const testCase of cases) {
  simulatedStorage.clear();
  if (testCase.saved) simulatedStorage.set("fenrir_post_auth_destination", testCase.saved);
  const actual = callbackDestinationPath(testCase.callback, testCase.hasCallbackParams);
  if (actual !== testCase.expected) {
    failed = true;
    console.error(`not ok - ${testCase.saved} via ${testCase.callback} redirected to ${actual}, expected ${testCase.expected}`);
  } else {
    console.log(`ok - ${testCase.saved} via ${testCase.callback} redirects to ${testCase.expected}`);
  }
}

if (failed) process.exit(1);
