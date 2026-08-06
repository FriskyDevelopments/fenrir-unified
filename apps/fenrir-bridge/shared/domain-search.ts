/**
 * Live domain search core for the Fenrir DNS Wizard.
 *
 * Dependency-free and runtime-agnostic (only `fetch`), so the exact same code path runs in:
 *  - the browser (src/App.tsx live search panel),
 *  - the Cloudflare Pages Function (functions/api/domains/search.ts),
 *  - Node (scripts/domain-search-live.mjs verification run).
 *
 * It answers two different questions per candidate and refuses to conflate them:
 *  1. Public DNS right now  -> DoH against Cloudflare 1.1.1.1 and Google 8.8.8.8.
 *  2. Registration status   -> RDAP (IANA bootstrap, rdap.org fallback).
 *
 * "No DNS" never means "available" on its own; only RDAP can say that, and where a TLD
 * has no RDAP service we downgrade the verdict to `likely_*` instead of guessing.
 */

export type DomainVerdict =
  | "available_clean"
  | "available_dirty"
  | "registered_dropping"
  | "registered_parked"
  | "registered_live"
  | "likely_available"
  | "likely_registered"
  | "unknown"
  | "invalid";

export type DomainDnsFacts = {
  resolvers: string[];
  nxdomain: boolean;
  ns: string[];
  soa: string[];
  a: string[];
  aaaa: string[];
  mx: string[];
  txt: string[];
};

export type DomainRegistrationFacts = {
  source: "rdap" | "none";
  registered: boolean | null;
  registrar: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  statuses: string[];
  server: string | null;
  note: string | null;
};

export type DomainSearchResult = {
  domain: string;
  tld: string;
  verdict: DomainVerdict;
  /** True only when the name is buyable AND carries no leftover history. */
  promising: boolean;
  /** 0-100 front-door quality; ranking hint, not a verdict. */
  score: number;
  summary: string;
  flags: string[];
  dns: DomainDnsFacts;
  registration: DomainRegistrationFacts;
  checkedAt: string;
};

export const domainSearchTlds = ["com", "io", "app", "dev", "ai"] as const;

/** TLDs worth trying for a Fenrir front door, best-first. */
export const frontDoorTlds = ["com", "io", "app", "dev", "co", "net", "ai", "xyz", "gg", "chat", "link", "sh"] as const;

/** Name shapes Francisco asked for: fenrir.*, myfenrir.*, getfenrir.*, and friends. */
export const frontDoorPrefixes = ["", "my", "get", "use", "join", "try", "go"] as const;
export const frontDoorSuffixes = ["", "app", "hq", "gate", "bridge"] as const;

const DOH_ENDPOINTS = [
  { id: "cloudflare-1.1.1.1", url: "https://cloudflare-dns.com/dns-query" },
  { id: "google-8.8.8.8", url: "https://dns.google/resolve" }
] as const;

const RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const RDAP_FALLBACK = "https://rdap.org/domain/";

/**
 * TLDs that run RDAP but are missing from the IANA bootstrap file.
 * Only add an entry after confirming the server answers 200 for a domain known to be
 * registered under that TLD — a server that does not serve the TLD answers 404 to
 * everything, which would read as "available" and is exactly the trap we guard against.
 */
const RDAP_SUPPLEMENTAL: Record<string, string> = {
  io: "https://rdap.identitydigital.services/rdap/",
  sh: "https://rdap.identitydigital.services/rdap/"
};

const DIRTY_TXT_MARKERS = [
  "v=spf1",
  "v=dmarc1",
  "google-site-verification",
  "ms=",
  "facebook-domain-verification",
  "stripe-verification",
  "atlassian-domain-verification",
  "_domainkey"
];

const DROPPING_STATUSES = ["redemption period", "pending delete", "pending restore", "client hold", "server hold"];

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function cleanDomainSearchBase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^[.-]+|[.-]+$/g, "");
}

export function domainSearchCandidates(value: string, tlds: readonly string[] = domainSearchTlds) {
  const base = cleanDomainSearchBase(value);
  if (!base) return [];
  if (base.includes(".")) return [base];
  return tlds.map((tld) => `${base}.${tld}`);
}

/**
 * Reasonable front-door variants for a brand word: fenrir.com, myfenrir.io, getfenrir.app, ...
 * Ordered best-first so a truncated run still checks the names most worth having.
 */
export function frontDoorCandidates(
  brand: string,
  options: { tlds?: readonly string[]; prefixes?: readonly string[]; suffixes?: readonly string[]; limit?: number } = {}
) {
  const base = cleanDomainSearchBase(brand).replace(/\..*$/, "");
  if (!base) return [];
  const tlds = options.tlds ?? frontDoorTlds;
  const prefixes = options.prefixes ?? frontDoorPrefixes;
  const suffixes = options.suffixes ?? frontDoorSuffixes;
  const limit = options.limit ?? 24;

  const scored: Array<{ domain: string; rank: number }> = [];
  const seen = new Set<string>();
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      const label = `${prefix}${base}${suffix}`;
      if (label.length > 63) continue;
      for (const tld of tlds) {
        const domain = `${label}.${tld}`;
        if (seen.has(domain)) continue;
        seen.add(domain);
        // Rank: exact brand first, then short labels, then TLD preference order.
        const rank =
          (prefix ? 10 : 0) + (suffix ? 12 : 0) + label.length + tlds.indexOf(tld) * 6;
        scored.push({ domain, rank });
      }
    }
  }
  scored.sort((left, right) => left.rank - right.rank || left.domain.localeCompare(right.domain));
  return scored.slice(0, limit).map((entry) => entry.domain);
}

export async function searchDomains(
  candidates: string[],
  options: { concurrency?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<DomainSearchResult[]> {
  const concurrency = Math.max(1, options.concurrency ?? 6);
  const results = new Array<DomainSearchResult>(candidates.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= candidates.length) return;
      results[index] = await checkDomain(candidates[index], options);
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

export async function checkDomain(
  input: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<DomainSearchResult> {
  const domain = cleanDomainSearchBase(input);
  const checkedAt = new Date().toISOString();
  const emptyDns: DomainDnsFacts = { resolvers: [], nxdomain: false, ns: [], soa: [], a: [], aaaa: [], mx: [], txt: [] };
  const emptyRegistration: DomainRegistrationFacts = {
    source: "none",
    registered: null,
    registrar: null,
    createdAt: null,
    expiresAt: null,
    statuses: [],
    server: null,
    note: null
  };

  if (!domain || !DOMAIN_RE.test(domain)) {
    return {
      domain: domain || input.trim(),
      tld: "",
      verdict: "invalid",
      promising: false,
      score: 0,
      summary: "Not a valid domain name.",
      flags: [],
      dns: emptyDns,
      registration: emptyRegistration,
      checkedAt
    };
  }

  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  const [dns, registration] = await Promise.all([lookupDns(domain, options), lookupRdap(domain, options)]);
  const flags = collectFlags(dns, registration);
  const verdict = classify(dns, registration, flags);
  const promising = verdict === "available_clean" || verdict === "likely_available";

  return {
    domain,
    tld,
    verdict,
    promising,
    score: scoreCandidate(domain, tld, verdict, flags),
    summary: summarize(verdict, dns, registration),
    flags,
    dns,
    registration,
    checkedAt
  };
}

/* ------------------------------------------------------------------ DNS */

type DohAnswer = { Status?: number; Answer?: Array<{ data?: string; type?: number }>; Authority?: Array<{ data?: string }> };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type JsonFetch = { status: number; ok: boolean; body: unknown };

/**
 * Fetch + parse under a single deadline.
 *
 * The timeout has to stay armed until the body is parsed: some RDAP servers return headers
 * promptly and then stall the response body, and a timer cleared at header time leaves the
 * request hanging forever.
 */
async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  doFetch: typeof fetch
): Promise<JsonFetch | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(url, { ...init, signal: controller.signal });
    if (response.status === 404 || !response.ok) {
      // Drain so the connection is not left open, but do not fail on an unreadable body.
      await response.text().catch(() => "");
      return { status: response.status, ok: false, body: null };
    }
    return { status: response.status, ok: true, body: await response.json() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function dohQuery(
  endpoint: (typeof DOH_ENDPOINTS)[number],
  domain: string,
  type: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<DohAnswer | null> {
  const doFetch = options.fetchImpl ?? fetch;
  // Resolvers throttle bursts; a missing answer must never be mistaken for "no records",
  // so retry before giving up and let the caller see an empty resolver list if we truly failed.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(250 * attempt);
    const result = await fetchJson(
      `${endpoint.url}?name=${encodeURIComponent(domain)}&type=${type}`,
      { headers: { accept: "application/dns-json" } },
      options.timeoutMs ?? 6000,
      doFetch
    );
    if (result?.ok) return result.body as DohAnswer;
  }
  return null;
}

function answerData(payload: DohAnswer | null, limit = 6) {
  return (payload?.Answer ?? [])
    .map((answer) => String(answer.data ?? "").replace(/\.$/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

async function lookupDns(domain: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<DomainDnsFacts> {
  const [cf, google] = DOH_ENDPOINTS;

  // NS + SOA are the presence signal, so ask both resolvers. Content records go to Cloudflare.
  const [cfNs, cfSoa, googleNs, googleSoa] = await Promise.all([
    dohQuery(cf, domain, "NS", options),
    dohQuery(cf, domain, "SOA", options),
    dohQuery(google, domain, "NS", options),
    dohQuery(google, domain, "SOA", options)
  ]);
  const [a, aaaa, mx, txt] = await Promise.all([
    dohQuery(cf, domain, "A", options),
    dohQuery(cf, domain, "AAAA", options),
    dohQuery(cf, domain, "MX", options),
    dohQuery(cf, domain, "TXT", options)
  ]);

  const resolvers: string[] = [];
  if (cfNs || cfSoa) resolvers.push(cf.id);
  if (googleNs || googleSoa) resolvers.push(google.id);

  const seen = [cfNs, cfSoa, googleNs, googleSoa].filter(Boolean) as DohAnswer[];
  // NXDOMAIN (RCODE 3) from every resolver that answered = the name is not delegated at all.
  const nxdomain = seen.length > 0 && seen.every((payload) => payload.Status === 3);

  const ns = dedupe([...answerData(cfNs), ...answerData(googleNs)]);
  const soa = dedupe([...answerData(cfSoa), ...answerData(googleSoa)]);

  return {
    resolvers,
    nxdomain,
    ns,
    soa,
    a: answerData(a),
    aaaa: answerData(aaaa),
    mx: answerData(mx),
    txt: answerData(txt).map((value) => value.replace(/^"|"$/g, ""))
  };
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
}

/* ----------------------------------------------------------------- RDAP */

type RdapBootstrap = { services?: Array<[string[], string[]]> };
let bootstrapCache: { loadedAt: number; map: Map<string, string> } | null = null;
let bootstrapInFlight: Promise<void> | null = null;

async function loadBootstrap(doFetch: typeof fetch) {
  const fresh = bootstrapCache && Date.now() - bootstrapCache.loadedAt < 6 * 60 * 60 * 1000;
  if (fresh) return;
  // Every candidate needs the bootstrap; without this guard a fan-out fires N copies of
  // the same request and the losers see a null map (which used to read as "no RDAP").
  if (!bootstrapInFlight) {
    bootstrapInFlight = (async () => {
      try {
        const result = await fetchJson(RDAP_BOOTSTRAP_URL, { headers: { accept: "application/json" } }, 10000, doFetch);
        if (!result?.ok) return;
        const payload = result.body as RdapBootstrap;
        const map = new Map<string, string>();
        for (const [tlds, servers] of payload.services ?? []) {
          const server = servers.find((entry) => entry.startsWith("https://")) ?? servers[0];
          if (!server) continue;
          for (const entry of tlds) map.set(entry.toLowerCase(), server.endsWith("/") ? server : `${server}/`);
        }
        if (map.size) bootstrapCache = { loadedAt: Date.now(), map };
      } catch {
        /* leave the cache alone; callers fall back to the supplemental map */
      } finally {
        bootstrapInFlight = null;
      }
    })();
  }
  await bootstrapInFlight;
}

async function rdapBaseFor(tld: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch }) {
  await loadBootstrap(options.fetchImpl ?? fetch);
  const key = tld.toLowerCase();
  return bootstrapCache?.map.get(key) ?? RDAP_SUPPLEMENTAL[key] ?? null;
}

type RdapDomain = {
  ldhName?: string;
  status?: string[];
  entities?: Array<{ roles?: string[]; vcardArray?: unknown; handle?: string }>;
  events?: Array<{ eventAction?: string; eventDate?: string }>;
};

async function lookupRdap(
  domain: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<DomainRegistrationFacts> {
  const doFetch = options.fetchImpl ?? fetch;
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  const base = await rdapBaseFor(tld, options);

  /**
   * `authoritative` marks a server the bootstrap says owns this TLD. Only such a server may
   * turn a 404 into "not registered". rdap.org answers 404 both for "no such domain" and for
   * "I cannot route this TLD" — trusting it reported registered names like fenrir.io as free.
   */
  const attempts: Array<{ url: string; authoritative: boolean }> = base
    ? [{ url: `${base}domain/${domain}`, authoritative: true }, { url: `${RDAP_FALLBACK}${domain}`, authoritative: false }]
    : [{ url: `${RDAP_FALLBACK}${domain}`, authoritative: false }];

  const empty: DomainRegistrationFacts = {
    source: "none",
    registered: null,
    registrar: null,
    createdAt: null,
    expiresAt: null,
    statuses: [],
    server: null,
    note: base ? null : `No RDAP service published for .${tld}`
  };

  let throttled = false;

  for (const attempt of attempts) {
    const { url, authoritative } = attempt;
    let result: JsonFetch | null = null;

    // Registry RDAP servers throttle hard (Verisign in particular). A 429 is not an answer,
    // and silently downgrading it would make every .com look like it has no registry at all.
    for (let tries = 0; tries < 3; tries += 1) {
      result = await rdapHostGate(url, () =>
        // The deadline starts once we own the slot; arming it before queueing would abort
        // the requests still waiting their turn.
        fetchJson(
          url,
          { headers: { accept: "application/rdap+json, application/json" }, redirect: "follow" },
          options.timeoutMs ?? 8000,
          doFetch
        )
      );

      const retryable = !result || result.status === 429 || result.status >= 500;
      if (retryable) {
        if (result) throttled = true;
        if (tries < 2) {
          await sleep(400 * (tries + 1));
          result = null;
          continue;
        }
      }
      break;
    }

    if (!result) continue;

    if (result.status === 404) {
      if (authoritative) return { ...empty, source: "rdap", registered: false, server: url, note: null };
      // Non-authoritative 404 proves nothing. Fall through to the DNS-only verdict.
      continue;
    }
    if (!result.ok) continue;

    const payload = result.body as RdapDomain | null;
    // rdap.org answers 200 with an error object for TLDs it cannot route.
    if (!payload?.ldhName && !payload?.events && !payload?.status) continue;

    const statuses = (payload.status ?? []).map((value) => String(value).toLowerCase());
    const events = payload.events ?? [];
    const eventDate = (action: string) =>
      events.find((event) => String(event.eventAction ?? "").toLowerCase() === action)?.eventDate ?? null;

    return {
      source: "rdap",
      registered: true,
      registrar: registrarName(payload),
      createdAt: eventDate("registration"),
      expiresAt: eventDate("expiration"),
      statuses,
      server: url,
      note: null
    };
  }

  return throttled ? { ...empty, note: empty.note ?? "RDAP servers throttled this lookup" } : empty;
}

/**
 * Serialises RDAP calls per host with a small gap. Registries answer 429 to bursts, and a
 * throttled lookup is indistinguishable from "no registry" in the response body.
 */
const rdapHostQueues = new Map<string, Promise<unknown>>();

function rdapHostGate(url: string, run: () => Promise<JsonFetch | null>): Promise<JsonFetch | null> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return run();
  }
  const previous = rdapHostQueues.get(host) ?? Promise.resolve();
  const result = previous.then(() => run());
  // The caller gets the response immediately; the gap only holds back the next queued call.
  rdapHostQueues.set(host, result.then(() => sleep(120), () => sleep(120)));
  return result;
}

function registrarName(payload: RdapDomain) {
  const entity = (payload.entities ?? []).find((item) => (item.roles ?? []).includes("registrar"));
  if (!entity) return null;
  const vcard = entity.vcardArray;
  if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
    for (const field of vcard[1] as unknown[]) {
      if (Array.isArray(field) && field[0] === "fn" && typeof field[3] === "string") return field[3];
    }
  }
  return entity.handle ?? null;
}

/* -------------------------------------------------------- classification */

function collectFlags(dns: DomainDnsFacts, registration: DomainRegistrationFacts) {
  const flags: string[] = [];
  if (dns.mx.length) flags.push("mail-history");
  if (dns.txt.some((value) => DIRTY_TXT_MARKERS.some((marker) => value.toLowerCase().includes(marker)))) {
    flags.push("verification-txt-leftovers");
  }
  if (dns.a.length || dns.aaaa.length) flags.push("resolves-to-host");
  if (registration.registered === false && (dns.ns.length || dns.soa.length || dns.a.length)) {
    // A truly unregistered name is not delegated by the TLD, so it cannot answer NS/SOA/A.
    // When it does, one of the two sources is wrong and neither verdict may be trusted.
    flags.push("rdap-dns-conflict");
  }
  if (registration.statuses.some((status) => DROPPING_STATUSES.some((needle) => status.includes(needle)))) {
    flags.push("registration-dropping");
  }
  if (registration.source === "none") {
    flags.push(registration.note?.startsWith("No RDAP service") ? "no-rdap-service" : "rdap-unreachable");
  }
  if (!dns.resolvers.length) flags.push("dns-unreachable");
  return flags;
}

function classify(dns: DomainDnsFacts, registration: DomainRegistrationFacts, flags: string[]): DomainVerdict {
  if (registration.registered === false) {
    if (flags.includes("rdap-dns-conflict")) return "unknown";
    // Unregistered, yet stale MX/TXT are still being served from cache: usable, but not clean.
    const residue = flags.includes("mail-history") || flags.includes("verification-txt-leftovers");
    return residue ? "available_dirty" : "available_clean";
  }

  if (registration.registered === true) {
    if (flags.includes("registration-dropping")) return "registered_dropping";
    if (dns.a.length || dns.aaaa.length) return "registered_live";
    return "registered_parked";
  }

  // No RDAP answer: DNS-only inference, deliberately hedged.
  if (!dns.resolvers.length) return "unknown";
  if (dns.nxdomain && !dns.ns.length && !dns.soa.length) return "likely_available";
  if (dns.ns.length || dns.a.length || dns.aaaa.length || dns.soa.length) return "likely_registered";
  return "unknown";
}

function summarize(verdict: DomainVerdict, dns: DomainDnsFacts, registration: DomainRegistrationFacts) {
  switch (verdict) {
    case "available_clean":
      return "Unregistered and no public DNS at all. Clean front door — send it to the wizard.";
    case "available_dirty":
      return "Unregistered, but a previous owner's records are still being served. Usable; expect residue.";
    case "registered_dropping":
      return `Registered but in ${registration.statuses.join(", ")}. It may drop soon — worth watching, not buying today.`;
    case "registered_parked":
      return `Registered${registration.registrar ? ` via ${registration.registrar}` : ""} but not serving a site. Parked or held.`;
    case "registered_live":
      return `Registered and live on ${dns.a.concat(dns.aaaa).slice(0, 2).join(", ")}. Taken.`;
    case "likely_available":
      return `${registration.note ?? "No RDAP answer"}; both resolvers return NXDOMAIN. Probably free — confirm at a registrar.`;
    case "likely_registered":
      return `${registration.note ?? "No RDAP answer"}; public DNS exists, so treat it as taken.`;
    case "invalid":
      return "Not a valid domain name.";
    default:
      if (registration.registered === false && dns.ns.length) {
        return "RDAP reports it unregistered but it still resolves in public DNS. Contradictory — confirm at a registrar before trusting either answer.";
      }
      return "Could not reach DNS or RDAP for this name. Re-run before deciding.";
  }
}

function scoreCandidate(domain: string, tld: string, verdict: DomainVerdict, flags: string[]) {
  const base: Record<DomainVerdict, number> = {
    available_clean: 78,
    likely_available: 60,
    available_dirty: 45,
    registered_dropping: 30,
    registered_parked: 15,
    registered_live: 5,
    likely_registered: 10,
    unknown: 20,
    invalid: 0
  };

  let score = base[verdict];
  if (verdict === "available_clean" || verdict === "likely_available") {
    const label = domain.slice(0, domain.lastIndexOf("."));
    const tldRank = frontDoorTlds.indexOf(tld as (typeof frontDoorTlds)[number]);
    score += tldRank === -1 ? -8 : Math.max(0, 12 - tldRank * 2);
    score += label.length <= 8 ? 6 : label.length <= 12 ? 3 : 0;
  }
  if (flags.includes("no-rdap-service")) score -= 4;
  if (flags.includes("dns-unreachable")) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function rankResults(results: DomainSearchResult[]) {
  return [...results].sort((left, right) => right.score - left.score || left.domain.localeCompare(right.domain));
}

export function promisingResults(results: DomainSearchResult[]) {
  return rankResults(results.filter((result) => result.promising));
}
