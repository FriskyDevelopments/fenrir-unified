#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const requiredSource = [
  ["src/routes/g.$slug.tsx", "Proceed to SSO"],
  ["src/routes/g.$slug.tsx", "Continue Gate"],
  ["src/routes/g.$slug.tsx", "community-sso"],
  ["src/lib/access.functions.ts", "Gate security:"],
  ["src/lib/access.functions.ts", "decision_note"],
  ["src/lib/access.functions.ts", "telegram_user_id"],
  ["src/routes/access.tsx", "Security context"],
  ["src/routes/access.tsx", "Ask info"],
];

const forbiddenSource = [
  ["src/routes/g.$slug.tsx", "Link Telegram securely"],
  ["src/lib/access.functions.ts", "Link Telegram securely"],
  ["src/lib/gate.functions.ts", "Link Telegram securely"],
  ["src/routes/g.$slug.tsx", 'href="/activate"'],
  ["src/routes/g.$slug.tsx", "communities.myfenrir.com/activate"],
];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

for (const [file, needle] of requiredSource) {
  const text = read(file);
  if (!text.includes(needle)) fail(`${file} is missing required contract text: ${needle}`);
}

for (const [file, needle] of forbiddenSource) {
  const text = read(file);
  if (text.includes(needle)) fail(`${file} contains forbidden gate regression text: ${needle}`);
}

const routeSource = read("src/routes/g.$slug.tsx");
if (!/const needsSso = checkingAccess \|\| !session;/.test(routeSource)) {
  fail("public Gate must only need SSO when there is no session; Telegram identity gaps belong to post-SSO security");
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
    if (builtText.includes(needle)) fail(`built output contains forbidden gate regression text: ${needle}`);
  }
  for (const needle of ["Proceed to SSO", "Gate security:", "Security context", "Ask info"]) {
    if (!builtText.includes(needle)) fail(`built output is missing required contract text: ${needle}`);
  }
}

if (!process.exitCode) console.log("✓ Community Gate contract checks passed");
