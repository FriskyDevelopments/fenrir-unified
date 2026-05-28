import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const source = readFileSync(join(root, "src/services/supabaseAuth.ts"), "utf8");
const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const directOauthGuardSource = readFileSync(join(root, "workers/fenrir-direct-oauth-guard.js"), "utf8");
const mainSource = readFileSync(join(root, "src/main.tsx"), "utf8");
const honeybadgerClientSource = readFileSync(join(root, "src/services/honeybadger.ts"), "utf8");
const honeybadgerServerSource = readFileSync(join(root, "functions/_lib/honeybadger.ts"), "utf8");

const checks = [
  {
    name: "stores the pre-login path before Supabase OAuth",
    pass: source.includes("window.localStorage.setItem(postAuthDestinationKey, currentPostAuthDestination())") &&
      source.includes("rememberPostAuthDestination();") &&
      source.indexOf("rememberPostAuthDestination();") < source.indexOf("supabase.auth.signInWithOAuth")
  },
  {
    name: "root/login fallback targets the managed MyFenrir dashboard",
    pass: source.includes('import.meta.env.VITE_FENRIR_MANAGED_URL ?? "/main"') &&
      source.includes('return destination === "/" || !isSafeRedirectPath(destination) ? fallbackPostAuthDestination() : destination;')
  },
  {
    name: "callback path consumes the stored post-auth destination",
    pass: source.includes("if (isAuthCallbackPath(pathname)) return consumePostAuthDestination();") &&
      source.includes('if (hasCallbackParams && (pathname === "/" || pathname === "/login")) return consumePostAuthDestination();')
  },
  {
    name: "root hash token callback redirects to managed MyFenrir dashboard",
    pass: source.includes("hasSupabaseCallbackParams(search) || hasSupabaseCallbackParams(hash)") &&
      source.includes("params.hasCallbackParams || isAuthCallbackPath(window.location.pathname)") &&
      source.includes("clearCallbackParameters(params.hasCallbackParams)")
  },
  {
    name: "auth service handles pending Supabase callback before /api/auth/me",
    pass: readFileSync(join(root, "src/services/api.ts"), "utf8").includes("if (hasSupabaseCallbackInLocation())") &&
      readFileSync(join(root, "src/services/api.ts"), "utf8").indexOf("if (hasSupabaseCallbackInLocation())") <
        readFileSync(join(root, "src/services/api.ts"), "utf8").indexOf('apiRequest<AuthSession & { ok: boolean }>("/api/auth/me")')
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
    name: "rejects unsafe or callback destinations",
    pass: source.includes("path.startsWith(\"//\")") &&
      source.includes("return !isAuthCallbackPath(pathname);")
  },
  {
    name: "callback cleanup removes OAuth parameters",
    pass: source.includes("\"code\"") &&
      source.includes("\"error_description\"") &&
      source.includes("nextParams.delete(key)")
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
