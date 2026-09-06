// Guard: new MyFenrir sign-ins prefer the Fenrir Better Auth Worker on /auth/{provider}
// when it is live, then Better Auth (@frisky/auth) when /api/auth/providers reports
// engine=better-auth, and finally fall back to direct OAuth as the cutover fallback.
// Authentik/Supabase proxy stays retired. WorkOS is banned from this repo (same as Vercel).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const apiSource = readFileSync(join(root, "src/services/api.ts"), "utf8");
const providersSource = readFileSync(join(root, "functions/api/auth/providers.ts"), "utf8");
const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const routingSource = readFileSync(join(root, "src/app/routing.ts"), "utf8");
const communityOAuthSource = readFileSync(join(root, "functions/_lib/community-oauth.ts"), "utf8");
const communityMagicLinkSource = readFileSync(join(root, "functions/api/community-auth/magic-link/consume.ts"), "utf8");
const workerIndex = readFileSync(join(root, "workers/fenrir-auth/src/index.js"), "utf8");
const appCallbackPathMatcher = appSource.match(/function isAuthCallbackPath[\s\S]*?\n}/)?.[0] ?? "";
const routingCallbackPathMatcher = routingSource.match(/export function isAuthCallbackPath[\s\S]*?\n}/)?.[0] ?? "";

function workosMatches() {
  try {
    return execSync("git grep -li workos -- . \":(exclude)scripts/test-auth-redirect.mjs\" \":(exclude)functions/__tests__/community-oauth.test.ts\"", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const offenders = workosMatches();
const checks = [
  {
    name: "new social login prefers Better Auth when providers.engine is better-auth",
    pass: apiSource.includes("signInWithFriskyAuth") &&
      apiSource.includes('engine === "better-auth"') &&
      apiSource.includes('>("/api/auth/providers")') &&
      !apiSource.includes("signInWithSupabase(provider)") &&
      providersSource.includes("better-auth")
  },
  {
    name: "new social login prefers Fenrir Better Auth Worker /auth/{provider}, Pages OAuth until that Worker is live",
    pass: apiSource.includes("/auth/${provider}") &&
      apiSource.includes('workerAuthUrl("/auth/providers")') &&
      apiSource.includes("/api/auth/login/${provider}") &&
      apiSource.includes("workerAuthIsLive") &&
      apiSource.includes('workerAuthUrl("/auth/ready")') &&
      !apiSource.includes('workerAuthUrl("/auth/health")') &&
      !apiSource.includes("signInWithSupabase(provider)") &&
      providersSource.includes("better-auth")
  },
  {
    name: "the production App auth surface renders only advertised providers",
    pass: appSource.includes("friskyClientAuthEngine") &&
      appSource.includes(".enabledProviders()") &&
      appSource.includes("enabledProviders?.map((provider)") &&
      !appSource.includes('(["apple", "google", "microsoft"] as AuthProvider[]).map')
  },
  {
    name: "Fenrir Worker copies folios-auth-worker endpoints on myfenrir.com",
    pass: workerIndex.includes("fenrir-auth-worker") &&
      workerIndex.includes("myfenrir.com") &&
      workerIndex.includes("safeReturnTo") &&
      workerIndex.includes("withCors") &&
      workerIndex.includes("authFailure") &&
      workerIndex.includes('from "./identity.js"') &&
      !workerIndex.includes("handleDataApi")
  },
  {
    name: "www.myfenrir.com canonicalizes to apex for login (not apex→www)",
    pass: (() => {
      const redirects = readFileSync(join(root, "public/_redirects"), "utf8");
      const hops = readFileSync(join(root, "workers/fenrir-redirects/worker.js"), "utf8");
      return /https:\/\/www\.myfenrir\.com\/\*\s+https:\/\/myfenrir\.com\/:splat\s+301/.test(redirects)
        && hops.includes('url.hostname === "www.myfenrir.com"')
        && hops.includes('url.hostname = "myfenrir.com"')
        && apiSource.includes('from "./authOrigin"')
        && apiSource.includes("resolveAuthOrigin");
    })()
  },
  {
    name: `no WorkOS reference exists anywhere in the app (banned)${offenders ? ` — found in: ${offenders.replaceAll("\n", ", ")}` : ""}`,
    pass: offenders === ""
  },
  {
    name: "plain /login is not treated as an OAuth callback in any client route",
    pass: !appCallbackPathMatcher.includes('normalizedPath === "/login"') &&
      !routingCallbackPathMatcher.includes('normalizedPath === "/login"')
  },
  {
    name: "Community OAuth and magic links never mint a MyFenrir Supabase session",
    pass: !communityOAuthSource.includes("supabase-shared-session") &&
      !communityMagicLinkSource.includes("supabase-shared-session") &&
      !communityOAuthSource.includes("sb-") &&
      !communityMagicLinkSource.includes("sb-")
  },
  {
    name: "SPA no longer completes Authentik/Supabase sessions",
    pass: !apiSource.includes("completeSupabaseSession") && !apiSource.includes("signOutSupabase")
  },
  {
    name: "Better Auth login preserves FriskyDev Telegram link-start next",
    pass: apiSource.includes('from "../../functions/_lib/fenrir-login"') &&
      apiSource.includes("preservedLoginNext") &&
      apiSource.includes("safeLoginNextPath")
  }
];

let failed = 0;
for (const check of checks) {
  const status = check.pass ? "ok" : "FAIL";
  if (!check.pass) failed += 1;
  console.log(`${status}  ${check.name}`);
}
if (failed > 0) {
  console.error(`\n${failed} auth guard check(s) failed.`);
  process.exit(1);
}
