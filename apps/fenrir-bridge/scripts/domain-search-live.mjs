#!/usr/bin/env node
/**
 * Live domain search runner for the Fenrir DNS Wizard.
 *
 * Real network only — DoH against Cloudflare 1.1.1.1 and Google 8.8.8.8, plus RDAP.
 * Nothing here is mocked; if the network is down the run reports `unknown`, it does not guess.
 *
 *   node scripts/domain-search-live.mjs                     # Fenrir front-door sweep
 *   node scripts/domain-search-live.mjs fenrir myfenrir     # brand seeds -> variants
 *   node scripts/domain-search-live.mjs --exact a.com b.io  # check these names only
 *   node scripts/domain-search-live.mjs --json              # machine-readable output
 *   node scripts/domain-search-live.mjs --limit 30
 */
import { frontDoorCandidates, promisingResults, rankResults, searchDomains } from "../shared/domain-search.ts";

const argv = process.argv.slice(2);
const flags = new Set();
const words = [];
let limit = 24;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--limit") {
    limit = Number(argv[index + 1]) || 24;
    index += 1;
    continue;
  }
  if (arg.startsWith("--")) {
    flags.add(arg);
    continue;
  }
  words.push(arg);
}
const json = flags.has("--json");
const exact = flags.has("--exact");

const candidates = exact
  ? words
  : words.length
    ? dedupe(words.flatMap((word) => frontDoorCandidates(word, { limit: Math.ceil(limit / words.length) })))
    : frontDoorCandidates("fenrir", { limit });

if (!candidates.length) {
  console.error("No candidates to check.");
  process.exit(1);
}

const startedAt = Date.now();
if (!json) {
  console.log(`\nLIVE DOMAIN SEARCH — ${candidates.length} candidates`);
  console.log(`resolvers: cloudflare 1.1.1.1 + google 8.8.8.8 (DoH) · registry: RDAP\n`);
}

const results = rankResults(await searchDomains(candidates, { concurrency: 6 }));
const promising = promisingResults(results);
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

if (json) {
  console.log(JSON.stringify({ ok: true, checked: results.length, elapsedSeconds: Number(elapsed), results, promising }, null, 2));
  process.exit(0);
}

const pad = (value, width) => String(value).padEnd(width);
console.log(`${pad("DOMAIN", 22)}${pad("VERDICT", 20)}${pad("SCORE", 7)}${pad("RDAP", 10)}DNS / FLAGS`);
console.log("-".repeat(104));
for (const result of results) {
  const rdap =
    result.registration.registered === false ? "free" : result.registration.registered === true ? "taken" : "n/a";
  const dns = result.dns.nxdomain
    ? "NXDOMAIN"
    : [
        result.dns.ns.length ? `NS:${result.dns.ns.length}` : "",
        result.dns.a.length ? `A:${result.dns.a.length}` : "",
        result.dns.aaaa.length ? `AAAA:${result.dns.aaaa.length}` : "",
        result.dns.mx.length ? `MX:${result.dns.mx.length}` : "",
        result.dns.txt.length ? `TXT:${result.dns.txt.length}` : ""
      ]
        .filter(Boolean)
        .join(" ") || "none";
  const flags = result.flags.length ? ` [${result.flags.join(",")}]` : "";
  console.log(`${pad(result.domain, 22)}${pad(result.verdict, 20)}${pad(result.score, 7)}${pad(rdap, 10)}${dns}${flags}`);
}

console.log(`\nChecked ${results.length} names in ${elapsed}s.`);
console.log(`Clean and promising -> sent to the domain wizard: ${promising.length}`);
for (const result of promising) {
  console.log(`  * ${result.domain}  (score ${result.score})  ${result.summary}`);
}
if (!promising.length) console.log("  (none — every candidate is registered or has residue)");
console.log("");

function dedupe(values) {
  return Array.from(new Set(values));
}
