/**
 * shoot-panel.mjs — screenshot the real MembershipPanel across its states.
 * Case 1 uses LIVE production facts; the rest are labelled scenarios that
 * exercise the paths production has no row for yet.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { db } from "../../../workers/_lib/__verify__/d1-cli-adapter.mjs";
import { getMembershipFacts } from "../../../workers/_lib/membership-facts.js";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../../..");
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
// Positional = anything that is neither a --flag nor the value consumed by one.
// (Without the second condition, `--out <path>` gets mistaken for the org id.)
const flagValueIdx = new Set(argv.map((a, i) => (a.startsWith("--") ? i + 1 : -1)).filter((i) => i > 0));
const positional = argv.filter((a, i) => !a.startsWith("--") && !flagValueIdx.has(i));
const orgId = positional[0] || "frisky_org_FRISKYUSRWORKOSUSE_7ZAXU2";
const out = flag("out") || "/tmp/membership-panel.png";
const locale = flag("locale") || "en";

const live = await getMembershipFacts(db, orgId);
const { contact, ...liveSafe } = live;

const CASES = [
  { label: "LIVE — production D1, this org right now", response: { ok: true, membership: liveSafe } },
  {
    label: "SCENARIO — Stars purchase, term + amount the bridge cannot substantiate",
    response: { ok: true, membership: {
      entitled: true,
      plan: { key: "standard", display: "The Pack", recognised: true },
      status: { raw: "active", needsAttention: false, cancelAtPeriodEnd: false },
      term: { currentPeriodEnd: null, known: false, reason: "no_period_end_recorded" },
      rail: { key: "telegram_stars", label: "Telegram Stars" },
      amount: { charged: true, display: "1,150 ⭐ Telegram Stars", reason: null },
      limits: { maxTelegramLocks: null, locksUnlimited: true, multiAdmin: true, auditLogs: true, customDomain: true },
      startedAt: "2026-07-24T13:47:02.184Z",
    } },
  },
  {
    label: "SCENARIO — payment failed (past_due): access on, but said plainly",
    response: { ok: true, membership: {
      entitled: true,
      plan: { key: "standard", display: "The Pack", recognised: true },
      status: { raw: "past_due", needsAttention: true, cancelAtPeriodEnd: false },
      term: { currentPeriodEnd: "2026-09-14T00:00:00.000Z", known: true, reason: null },
      rail: { key: "stripe", label: "Stripe" },
      amount: { charged: true, display: null, reason: "amount_not_recorded_in_bridge" },
      limits: { maxTelegramLocks: null, locksUnlimited: true, multiAdmin: true, auditLogs: true, customDomain: true },
      startedAt: "2026-02-14T00:00:00.000Z",
    } },
  },
  {
    label: "LIVE PATH — no active subscription: states the reason, invents nothing",
    response: { ok: true, membership: { entitled: false, reason: "no_active_subscription" } },
  },
  {
    label: "LIVE PATH — bridge unreachable: shows a failed read, not a fake status",
    response: { ok: false, error: "db_unavailable" },
  },
];

const work = mkdtempSync(join(tmpdir(), "mp-"));
const bundle = join(work, "bundle.js");
execFileSync(join(appRoot, "node_modules/.bin/esbuild"), [
  join(here, "panel-preview.tsx"), "--bundle", `--outfile=${bundle}`,
  "--loader:.tsx=tsx", "--jsx=automatic", "--format=iife", "--platform=browser",
  "--define:process.env.NODE_ENV=\"production\"",
], { cwd: appRoot, stdio: ["ignore", "inherit", "inherit"] });

const page = join(work, "index.html");
writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;800&family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="file://${bundle.replace(/\.js$/, ".css")}">
<style>html,body{margin:0;background:#0b0b0c}</style></head>
<body><div id="root"></div>
<script>window.__CASES__=${JSON.stringify(CASES)};window.__LOCALE__=${JSON.stringify(locale)};</script>
<script src="file://${bundle}"></script></body></html>`);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || "/Users/friskypup/Library/Caches/ms-playwright/chromium_headless_shell-1161/chrome-mac/headless_shell",
});
const pg = await browser.newPage({ viewport: { width: 860, height: 1400 }, deviceScaleFactor: 2 });
const errors = [];
pg.on("pageerror", (e) => errors.push(String(e)));
await pg.goto(`file://${page}`, { waitUntil: "networkidle" });
await pg.waitForTimeout(1200);
await pg.screenshot({ path: out, fullPage: true });
await browser.close();
if (errors.length) { console.error("PAGE ERRORS:", errors); process.exit(3); }
console.log(`shot: ${out}`);
