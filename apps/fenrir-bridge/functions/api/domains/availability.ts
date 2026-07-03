import { noStoreJson } from "../../_lib/responses";

// Live domain-availability check, run on the Cloudflare edge instead of in the
// visitor's browser. The old wizard fetched cloudflare-dns.com directly from the
// client, so it depended on the visitor's local resolver — which on a machine
// behind a VPN that hijacks DNS (the recurring NordVPN wedge) can't resolve the
// DoH host at all, and every lookup aborted as "timed out". Running server-side
// makes the lookup independent of the client's network, and we use RDAP (the
// authoritative registration protocol) as the primary signal with DoH as a
// universal fallback for TLDs whose registries expose no RDAP service.

type Verdict = "available" | "taken" | "unknown" | "invalid";

type AvailabilityResult = {
  domain: string;
  verdict: Verdict;
  confidence: "authoritative" | "signal" | "none";
  source: "rdap" | "dns" | "rdap+dns" | "none";
  taken: boolean | null;
  registrarConfirm: boolean;
  summary: string;
  records: string[];
  priceTier: string;
};

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Rough annual first-year retail tiers (USD) by TLD, for the wizard's guidance
// only — the registrar is the source of truth at purchase time.
const PRICE_TIERS: Record<string, string> = {
  com: "$", net: "$", org: "$", dev: "$", app: "$", me: "$", co: "$$",
  io: "$$$", ai: "$$$$", gg: "$$$$", wolf: "$$", pack: "$$", xyz: "$",
  gold: "$$$", club: "$", live: "$", chat: "$$", social: "$$", community: "$$"
};

// IANA-bootstrapped RDAP base URLs for the TLDs the wizard/front-door set uses.
// ccTLDs without RDAP (.ai Anguilla, .gg Guernsey) are intentionally absent —
// they resolve via the DNS signal only.
const RDAP_BASE: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1/",
  net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/rdap/",
  app: "https://www.registry.google/rdap/",
  dev: "https://www.registry.google/rdap/",
  gold: "https://rdap.identitydigital.services/rdap/",
  wolf: "https://rdap.identitydigital.services/rdap/",
  pack: "https://rdap.identitydigital.services/rdap/",
  live: "https://rdap.identitydigital.services/rdap/",
  chat: "https://rdap.identitydigital.services/rdap/",
  social: "https://rdap.identitydigital.services/rdap/",
  community: "https://rdap.identitydigital.services/rdap/",
  io: "https://rdap.nic.io/",
  co: "https://rdap.nic.co/",
  me: "https://rdap.nic.me/",
  club: "https://rdap.nic.club/",
  xyz: "https://rdap.centralnic.com/xyz/"
};

function tldOf(domain: string): string {
  const parts = domain.split(".");
  return parts[parts.length - 1] ?? "";
}

function priceTier(domain: string): string {
  return PRICE_TIERS[tldOf(domain)] ?? "$$";
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// RDAP: authoritative registration status. 200 = registered, 404 = the registry
// reports the domain is not registered (available) OR no RDAP server exists for
// the TLD — the two are disambiguated by the caller using the DNS signal.
async function rdapStatus(domain: string): Promise<"taken" | "notfound" | "unknown"> {
  const headers = {
    accept: "application/rdap+json, application/json",
    "user-agent": "MyFenrir-DomainWizard/1.0 (+https://www.myfenrir.com)"
  };
  // Prefer the IANA-bootstrapped registry RDAP endpoint for known TLDs (direct,
  // no aggregator hop); fall back to rdap.org (which redirects to the registry).
  const direct = RDAP_BASE[tldOf(domain)];
  const urls = direct
    ? [`${direct}domain/${encodeURIComponent(domain)}`, `https://rdap.org/domain/${encodeURIComponent(domain)}`]
    : [`https://rdap.org/domain/${encodeURIComponent(domain)}`];
  for (const url of urls) {
    const res = await fetchWithTimeout(url, { headers, redirect: "follow" }, 6500);
    if (!res) continue;
    if (res.status === 200) return "taken";
    if (res.status === 404) return "notfound";
    if (res.status === 422 || res.status === 400) continue; // malformed at this registry; try next
    // 429/5xx/403 → try the next endpoint before giving up.
  }
  return "unknown";
}

// DoH SOA lookup as a universal signal (works for every TLD, including ccTLDs
// like .gg/.ai with no RDAP). A registered apex answers with SOA (Status 0);
// an unregistered name returns NXDOMAIN (Status 3). Cloudflare first, Google as
// a second edge-to-edge path so one provider hiccup doesn't fail the check.
async function dnsSignal(domain: string): Promise<{ taken: boolean | null; records: string[] }> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=SOA`,
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=SOA`
  ];
  for (const url of endpoints) {
    const res = await fetchWithTimeout(url, { headers: { accept: "application/dns-json" } }, 4000);
    if (!res || !res.ok) continue;
    const payload = (await res.json().catch(() => null)) as
      | { Status?: number; Answer?: Array<{ data?: string }>; Authority?: Array<{ data?: string }> }
      | null;
    if (!payload || typeof payload.Status !== "number") continue;
    if (payload.Status === 3) return { taken: false, records: [] }; // NXDOMAIN
    const answers = [...(payload.Answer ?? []), ...(payload.Authority ?? [])]
      .map((a) => String(a.data ?? "").trim())
      .filter(Boolean)
      .slice(0, 2);
    if (payload.Status === 0) return { taken: answers.length > 0, records: answers };
    // Other statuses (SERVFAIL/REFUSED) are inconclusive; try next provider.
  }
  return { taken: null, records: [] };
}

async function checkDomain(domain: string): Promise<AvailabilityResult> {
  const base: Omit<AvailabilityResult, "verdict" | "confidence" | "source" | "taken" | "registrarConfirm" | "summary" | "records"> = {
    domain,
    priceTier: priceTier(domain)
  };

  if (!DOMAIN_RE.test(domain)) {
    return { ...base, verdict: "invalid", confidence: "none", source: "none", taken: null, registrarConfirm: false, summary: "Use a valid domain name.", records: [] };
  }

  const [rdap, dns] = await Promise.all([rdapStatus(domain), dnsSignal(domain)]);

  // RDAP is authoritative when it returns a definite registered result.
  if (rdap === "taken") {
    return { ...base, verdict: "taken", confidence: "authoritative", source: dns.records.length ? "rdap+dns" : "rdap", taken: true, registrarConfirm: false, summary: "Registered. This domain is taken.", records: dns.records };
  }

  if (rdap === "notfound") {
    // Registry says not-registered. Corroborate with DNS: no records → strong
    // available; records present → RDAP bootstrap gap, treat as taken.
    if (dns.taken === true) {
      return { ...base, verdict: "taken", confidence: "signal", source: "dns", taken: true, registrarConfirm: true, summary: "DNS is configured — likely registered. Confirm at a registrar.", records: dns.records };
    }
    return { ...base, verdict: "available", confidence: dns.taken === false ? "authoritative" : "signal", source: dns.taken === false ? "rdap+dns" : "rdap", taken: false, registrarConfirm: dns.taken !== false, summary: dns.taken === false ? "Not registered — available." : "No registration found — likely available. Confirm at a registrar.", records: [] };
  }

  // RDAP unknown (no service for TLD, rate-limited, or unreachable) → DNS only.
  if (dns.taken === true) {
    return { ...base, verdict: "taken", confidence: "signal", source: "dns", taken: true, registrarConfirm: true, summary: "DNS is configured — likely registered. Confirm at a registrar.", records: dns.records };
  }
  if (dns.taken === false) {
    return { ...base, verdict: "available", confidence: "signal", source: "dns", taken: false, registrarConfirm: true, summary: "No DNS found — likely available. Confirm at a registrar.", records: [] };
  }
  return { ...base, verdict: "unknown", confidence: "none", source: "none", taken: null, registrarConfirm: true, summary: "Couldn't reach a live signal. Check at a registrar directly.", records: [] };
}

function parseDomains(url: URL): string[] {
  const single = url.searchParams.get("domain");
  const many = url.searchParams.get("domains");
  const raw = many ? many.split(",") : single ? [single] : [];
  return raw
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter(Boolean)
    .slice(0, 16);
}

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const domains = parseDomains(url);
  if (domains.length === 0) {
    return noStoreJson({ ok: false, error: "missing_domain", detail: "Pass ?domain=example.com or ?domains=a.com,b.io" }, { status: 400 });
  }
  const results = await Promise.all(domains.map(checkDomain));
  return noStoreJson({ ok: true, results });
};
