// Guard: new MyFenrir sign-ins prefer Better Auth (@frisky/auth) when
// /api/auth/providers reports engine=better-auth. Direct OAuth remains a
// cutover fallback. WorkOS is banned from this repo (same treatment as Vercel).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const apiSource = readFileSync(join(root, "src/services/api.ts"), "utf8");
const providersSource = readFileSync(join(root, "functions/api/auth/providers.ts"), "utf8");
const supabaseAuthSource = readFileSync(join(root, "src/services/supabaseAuth.ts"), "utf8");
const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const routingSource = readFileSync(join(root, "src/app/routing.ts"), "utf8");
const callbackPathMatcher = supabaseAuthSource.match(/function isAuthCallbackPath[\s\S]*?\n}/)?.[0] ?? "";
const appCallbackPathMatcher = appSource.match(/function isAuthCallbackPath[\s\S]*?\n}/)?.[0] ?? "";
const routingCallbackPathMatcher = routingSource.match(/export function isAuthCallbackPath[\s\S]*?\n}/)?.[0] ?? "";

function workosMatches() {
  try {
    // Tracked files only; -i catches every casing. git grep exits 1 on zero hits.
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
    name: "the production App auth surface renders only advertised providers",
    pass: appSource.includes("friskyClientAuthEngine") &&
      appSource.includes(".enabledProviders()") &&
      appSource.includes("enabledProviders?.map((provider)") &&
      !appSource.includes('(["apple", "google", "microsoft"] as AuthProvider[]).map')
  },
  {
    name: "legacy Supabase callback support remains available for existing sessions only",
    pass: supabaseAuthSource.includes("signInWithOAuth")
  },
  {
    name: `no WorkOS reference exists anywhere in the app (banned)${offenders ? ` — found in: ${offenders.replaceAll("\n", ", ")}` : ""}`,
    pass: offenders === ""
  },
  {
    name: "plain /login is not treated as an OAuth callback in any client route",
    pass: !callbackPathMatcher.includes('normalizedPath === "/login"') &&
      !appCallbackPathMatcher.includes('normalizedPath === "/login"') &&
      !routingCallbackPathMatcher.includes('normalizedPath === "/login"')
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
