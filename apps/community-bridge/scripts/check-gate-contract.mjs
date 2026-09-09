#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

/*
 * Cada entrada es [archivo | [archivos...], texto]. Con una lista, basta con
 * que el texto esté en UNO de ellos.
 *
 * Por qué existe la lista: la copy del Gate se movió de la isla local
 * `GATE_COPY` de la ruta a `src/i18n/gate.ts`, para que haya una sola fuente
 * por dominio. La aserción NO se debilita —el texto sigue siendo obligatorio—;
 * lo único que deja de asumirse es en qué archivo vive. La capa que de verdad
 * blinda esto contra regresiones es la del bundle construido, más abajo, que
 * es independiente de la ubicación y no se ha tocado.
 */
const requiredSource = [
  [["src/routes/g.$slug.tsx", "src/i18n/gate.ts"], "Proceed to SSO"],
  [["src/routes/g.$slug.tsx", "src/i18n/gate.ts"], "Continue Gate"],
  ["src/routes/g.$slug.tsx", "community-sso"],
  ["src/routes/g.$slug.tsx", 'url.searchParams.set("gate", slug)'],
  ["src/lib/access.functions.ts", "Gate security:"],
  ["src/lib/access.functions.ts", "decision_note"],
  ["src/lib/access.functions.ts", "telegram_user_id"],
  ["src/routes/access.tsx", "Security context"],
  ["src/routes/access.tsx", "Ask info"],
  ["src/routes/login.tsx", "canonicalCommunityOAuthUrl"],
  ["src/routes/login.tsx", "availableBrandProviders"],
  ["src/routes/login.tsx", "sourceGate"],
  ["src/components/auth/auth-layout.tsx", "Community sign-in"],
  ["src/lib/canonical-auth.ts", "brandId"],
  ["src/lib/canonical-auth.ts", "gateSlug"],
  ["src/lib/canonical-auth.ts", "/api/auth/community-sso"],
];

const forbiddenSource = [
  ["src/routes/g.$slug.tsx", "Link Telegram securely"],
  ["src/lib/access.functions.ts", "Link Telegram securely"],
  ["src/lib/gate.functions.ts", "Link Telegram securely"],
  ["src/routes/g.$slug.tsx", 'href="/activate"'],
  ["src/routes/g.$slug.tsx", "communities.myfenrir.com/activate"],
  ["src/routes/login.tsx", "supabase.auth.signInWithOAuth"],
];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

for (const [where, needle] of requiredSource) {
  const files = Array.isArray(where) ? where : [where];
  const found = files.some((file) => read(file).includes(needle));
  if (!found) fail(`${files.join(" / ")} is missing required contract text: ${needle}`);
}

for (const [file, needle] of forbiddenSource) {
  const text = read(file);
  if (text.includes(needle)) fail(`${file} contains forbidden gate regression text: ${needle}`);
}

const routeSource = read("src/routes/g.$slug.tsx");
if (!/const needsSso = checkingAccess \|\| !session;/.test(routeSource)) {
  fail(
    "public Gate must only need SSO when there is no session; Telegram identity gaps belong to post-SSO security",
  );
}
if (!/needsSso\s*\?\s*ssoHref/.test(routeSource)) {
  fail("public Gate must send unauthenticated visitors directly to Community SSO");
}
if (routeSource.includes("#human-verification")) {
  fail("public Gate must not place human verification in front of SSO");
}

const accessSource = read("src/lib/access.functions.ts");
if (!/photoStatus = "review"/.test(accessSource)) {
  fail("photo signal must not be faked as pass before bot-side photo evidence exists");
}

// SSO boundary: only a one-time token may cross origins. Long-lived Supabase
// access/refresh tokens must stay in host-isolated storage on Community.
const handoffSource = read("src/hooks/use-auth.tsx");
const storageSource = read("src/integrations/supabase/shared-session.ts");
const ssoSource = read("../fenrir-bridge/functions/api/auth/community-sso.ts");
for (const needle of ["fenrir_handoff", "verifyOtp", "history.replaceState"]) {
  if (!handoffSource.includes(needle)) fail(`Community handoff is missing ${needle}`);
}
for (const needle of ["hostSessionStorage", "window.localStorage"]) {
  if (!storageSource.includes(needle)) fail(`host-isolated session storage is missing ${needle}`);
}
for (const needle of ["fenrir_handoff", '"Referrer-Policy": "no-referrer"']) {
  if (!ssoSource.includes(needle)) fail(`Fenrir SSO handoff is missing ${needle}`);
}
for (const needle of ["access_token", "refresh_token", "COOKIE_MAX_AGE"]) {
  if (ssoSource.includes(needle)) fail(`Fenrir SSO must not serialize ${needle}`);
}
if (storageSource.includes("writeChunked") || storageSource.includes("COOKIE_MAX_AGE")) {
  fail("Community must not write refresh tokens into a parent-domain cookie");
}

const buildRoot = join(root, ".output");
if (existsSync(buildRoot)) {
  const builtFiles = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (/\.(js|mjs|html)$/.test(name)) builtFiles.push(path);
    }
  }
  walk(buildRoot);
  const builtText = builtFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const needle of ["Link Telegram securely", "communities.myfenrir.com/activate"]) {
    if (builtText.includes(needle))
      fail(`built output contains forbidden gate regression text: ${needle}`);
  }
  for (const needle of ["Proceed to SSO", "Gate security:", "Security context", "Ask info"]) {
    if (!builtText.includes(needle))
      fail(`built output is missing required contract text: ${needle}`);
  }
}

if (!process.exitCode) console.log("✓ Community Gate contract checks passed");
