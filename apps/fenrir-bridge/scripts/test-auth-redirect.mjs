// Guard: MyFenrir sign-in is Supabase Auth only. WorkOS is banned from this
// repo (same treatment as Vercel). This script fails the build if the login
// flow stops going through Supabase, or if any WorkOS wiring sneaks back in.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const apiSource = readFileSync(join(root, "src/services/api.ts"), "utf8");
const supabaseAuthSource = readFileSync(join(root, "src/services/supabaseAuth.ts"), "utf8");

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
    name: "auth service routes social login through Supabase signInWithOAuth",
    pass: apiSource.includes("signInWithSupabase(provider)") &&
      supabaseAuthSource.includes("signInWithOAuth")
  },
  {
    name: `no WorkOS reference exists anywhere in the app (banned)${offenders ? ` — found in: ${offenders.replaceAll("\n", ", ")}` : ""}`,
    pass: offenders === ""
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
