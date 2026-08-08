import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static wiring guard for the MyFenrir login. The login broker is Supabase
// Auth on the canonical project (yqevglppbhuoxxfsfnih), called client-side via
// signInWithOAuth. No external auth broker may ever be wired again (banned,
// same status as Vercel) — the last check fails the build if one sneaks back.

const root = new URL("..", import.meta.url).pathname;
const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const apiSource = readFileSync(join(root, "src/services/api.ts"), "utf8");
const authGatewaySource = readFileSync(join(root, "src/services/authGateway.ts"), "utf8");
const supabaseAuthSource = readFileSync(join(root, "src/services/supabaseAuth.ts"), "utf8");
const supabaseSessionSource = readFileSync(join(root, "functions/api/auth/supabase-session.ts"), "utf8");
const supabaseLibSource = readFileSync(join(root, "functions/_lib/supabase.ts"), "utf8");
const directOauthLoginSource = readFileSync(join(root, "functions/api/auth/login/[provider].ts"), "utf8");
const directOauthCallbackSource = readFileSync(join(root, "functions/api/auth/callback/[provider].ts"), "utf8");

function bannedBrokerReferences() {
  // Any mention of the banned auth broker in shipped code fails the guard.
  const banned = ["work" + "os"];
  try {
    const out = execSync("git grep -il " + banned[0] + " -- src functions workers scripts public", {
      cwd: root,
      encoding: "utf8"
    }).trim();
    return out ? out.split("\n").filter((f) => !f.endsWith("test-auth-redirect.mjs")) : [];
  } catch {
    return []; // git grep exits 1 when there are no matches
  }
}

const checks = [
  {
    name: "auth gateway routes social login through Supabase signInWithOAuth",
    pass: authGatewaySource.includes("signInWithSupabase") &&
      !authGatewaySource.includes("authService.login")
  },
  {
    name: "auth service login() is Supabase-only",
    pass: apiSource.includes("await signInWithSupabase(provider)") &&
      supabaseAuthSource.includes("signInWithOAuth") &&
      supabaseAuthSource.includes("yqevglppbhuoxxfsfnih.supabase.co")
  },
  {
    name: "auth service completes the Supabase callback into the Fenrir cookie",
    pass: apiSource.includes("completeSupabaseSession") &&
      supabaseAuthSource.includes("/api/auth/supabase-session") &&
      supabaseSessionSource.includes("createSessionFromSupabaseToken") &&
      supabaseLibSource.includes("createSessionFromSupabaseToken")
  },
  {
    name: "auth service reads the server session via /api/auth/me",
    pass: apiSource.includes('apiRequest<AuthSession & { ok: boolean }>("/api/auth/me")')
  },
  {
    name: "server-side direct OAuth fallback carries no banned broker",
    pass: directOauthLoginSource.includes("isDirectOAuthAvailable") &&
      !/authkit/i.test(directOauthLoginSource) &&
      !/authkit/i.test(directOauthCallbackSource)
  },
  {
    name: "direct OAuth callback validates the transaction before minting",
    pass: directOauthCallbackSource.includes("validateOAuthTransaction") &&
      directOauthCallbackSource.includes("exchangeCodeForSession")
  },
  {
    name: "authenticated app shell never normalizes login success back to public root",
    pass: appSource.includes('const managedDashboardPath = "/main";') &&
      appSource.includes('window.history.replaceState({}, "", managedDashboardPath);')
  },
  {
    name: "no banned auth broker reference anywhere in shipped code",
    pass: bannedBrokerReferences().length === 0
  }
];

let failed = 0;
for (const check of checks) {
  const status = check.pass ? "PASS" : "FAIL";
  if (!check.pass) failed += 1;
  console.log(`${status}  ${check.name}`);
}

if (failed > 0) {
  const offenders = bannedBrokerReferences();
  if (offenders.length > 0) {
    console.error("Banned broker references found in:", offenders.join(", "));
  }
  console.error(`${failed} auth wiring check(s) failed.`);
  process.exit(1);
}
console.log("All auth wiring checks passed.");
