/**
 * shoot.mjs — screenshot the real PackCelebration with real production facts.
 *
 *   node shoot.mjs <frisky_org_id> [--locale es] [--out /tmp/shot.png] [--phase 2600]
 *
 * Bundles the actual TSX with esbuild, injects live facts from D1, waits for
 * the formation to finish, and captures. What lands in the PNG is the shipping
 * component — no mockup, no hand-drawn stand-in.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
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
// Positional = neither a --flag nor a value consumed by one, so `--out <path>`
// is not mistaken for the org id.
const flagValueIdx = new Set(argv.map((a, i) => (a.startsWith("--") ? i + 1 : -1)).filter((i) => i > 0));
const orgId = argv.filter((a, i) => !a.startsWith("--") && !flagValueIdx.has(i))[0];
const locale = flag("locale") || "en";
const out = flag("out") || "/tmp/pack-celebration.png";
const phase = Number(flag("phase") || 2600);
const width = Number(flag("width") || 1280);
const height = Number(flag("height") || 1100);

// --scenario <file.json> renders a hypothetical facts payload instead of a live
// org. Used to exercise states production has no row for yet (e.g. a Stripe
// purchase whose amount the bridge cannot substantiate). Clearly not live data.
const scenario = flag("scenario");
if (!orgId && !scenario) {
  console.error("usage: shoot.mjs <frisky_org_id> | --scenario <file.json> [--locale es] [--out path]");
  process.exit(1);
}

// 1. Facts — live from production, or an explicitly-labelled scenario.
let facts;
if (scenario) {
  facts = JSON.parse(readFileSync(scenario, "utf8"));
  console.log(`SCENARIO RENDER (not live data): ${scenario}`);
} else {
  facts = await getMembershipFacts(db, orgId);
  if (!facts.entitled) {
    console.error(`org is not entitled (${facts.reason}) — the celebration correctly renders nothing.`);
    process.exit(2);
  }
}
console.log("facts:", JSON.stringify({ plan: facts.plan, amount: facts.amount, rail: facts.rail, term: facts.term }, null, 2));

// 2. Bundle the actual component.
const work = mkdtempSync(join(tmpdir(), "pk-"));
const bundle = join(work, "bundle.js");
execFileSync(
  join(appRoot, "node_modules/.bin/esbuild"),
  [
    join(here, "celebration-preview.tsx"),
    "--bundle", `--outfile=${bundle}`,
    "--loader:.tsx=tsx", "--jsx=automatic",
    "--format=iife", "--platform=browser",
    "--define:process.env.NODE_ENV=\"production\"",
  ],
  { cwd: appRoot, stdio: ["ignore", "inherit", "inherit"] }
);

// esbuild emits the CSS import next to the JS bundle.
const cssPath = bundle.replace(/\.js$/, ".css");

const page = join(work, "index.html");
writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;800&family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="file://${cssPath}">
<style>html,body{margin:0;background:#0b0b0c;height:100%}</style>
</head><body><div id="root"></div>
<script>window.__FACTS__=${JSON.stringify(facts)};window.__LOCALE__=${JSON.stringify(locale)};</script>
<script src="file://${bundle}"></script></body></html>`);

// 3. Capture after the formation settles.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || "/Users/friskypup/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const pg = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
const errors = [];
pg.on("pageerror", (e) => errors.push(String(e)));
pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await pg.goto(`file://${page}`, { waitUntil: "networkidle" });
await pg.waitForSelector(".pk__title", { timeout: 10000 });
await pg.waitForTimeout(phase);
await pg.screenshot({ path: out });
await browser.close();

if (errors.length) { console.error("PAGE ERRORS:", errors); process.exit(3); }
console.log(`shot: ${out}`);
