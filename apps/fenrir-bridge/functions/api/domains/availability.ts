import { noStoreJson } from '../../_lib/responses';

// Live domain-availability check, run on the Cloudflare edge instead of in the
// visitor's browser. The old wizard fetched cloudflare-dns.com directly from the
// client, so it depended on the visitor's local resolver — which on a machine
// behind a VPN that hijacks DNS (the recurring NordVPN wedge) can't resolve the
// DoH host at all, and every lookup aborted as "timed out". Running server-side
// makes the lookup independent of the client's network, and we use RDAP (the
// authoritative registration protocol) as the primary signal with DoH as a
// universal fallback for TLDs whose registries expose no RDAP service.

type Verdict = 'available' | 'taken' | 'unknown' | 'invalid';

type AvailabilityResult = {
  domain: string;
  verdict: Verdict;
  confidence: 'authoritative' | 'signal' | 'none';
  source: 'rdap' | 'dns' | 'rdap+dns' | 'none';
  taken: boolean | null;
  registrarConfirm: boolean;
  summary: string;
  records: string[];
  priceTier: string;
};

const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Rough annual first-year retail tiers (USD) by TLD, for the wizard's guidance
// only — the registrar is the source of truth at purchase time.
const PRICE_TIERS: Record<string, string> = {
  com: '$',
  net: '$',
  org: '$',
  dev: '$',
  app: '$',
  me: '$',
  co: '$$',
  io: '$$$',
  ai: '$$$$',
  gg: '$$$$',
  wolf: '$$',
  pack: '$$',
  xyz: '$',
  gold: '$$$',
  club: '$',
  live: '$',
  chat: '$$',
  social: '$$',
  community: '$$',
};

// Verified RDAP overrides for TLDs the IANA bootstrap gets wrong or omits.
// Each was confirmed to return 200 (taken) / 404 (available) from the edge.
// - .io is not in the IANA bootstrap but Identity Digital serves it.
// - .ai/.io/etc. run on Identity Digital's shared RDAP.
// The IANA bootstrap (fetched below) covers everything else authoritatively —
// including .app/.dev (→ pubapi.registry.google/rdap/, which the old hardcoded
// www.registry.google/rdap/ got wrong and 404'd on).
const RDAP_OVERRIDE: Record<string, string> = {
  io: 'https://rdap.identitydigital.services/rdap/',
  ai: 'https://rdap.identitydigital.services/rdap/',
};

// Static fallback used only if the IANA bootstrap fetch fails, so we never fully
// lose authoritative RDAP for the majors. Verified-correct endpoints.
const RDAP_STATIC: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/',
  net: 'https://rdap.verisign.com/net/v1/',
  org: 'https://rdap.publicinterestregistry.org/rdap/',
  app: 'https://pubapi.registry.google/rdap/',
  dev: 'https://pubapi.registry.google/rdap/',
  xyz: 'https://rdap.centralnic.com/xyz/',
};

// IANA RDAP bootstrap (tld -> registry RDAP base). Fetched once per isolate and
// cached; Workers reuse isolates so this is effectively memoized across requests.
let bootstrapCache: Record<string, string> | null = null;
let bootstrapPromise: Promise<Record<string, string>> | null = null;

async function loadBootstrap(): Promise<Record<string, string>> {
  if (bootstrapCache) return bootstrapCache;
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const res = await fetchWithTimeout(
        'https://data.iana.org/rdap/dns.json',
        { headers: { accept: 'application/json' } },
        4000
      );
      const map: Record<string, string> = {};
      if (res && res.ok) {
        const data = (await res.json().catch(() => null)) as {
          services?: Array<[string[], string[]]>;
        } | null;
        for (const svc of data?.services ?? []) {
          const [tlds, urls] = svc;
          const base = (urls ?? []).find((u) => u.startsWith('https://')) ?? urls?.[0];
          if (!base) continue;
          for (const t of tlds ?? []) map[t.toLowerCase()] = base.endsWith('/') ? base : `${base}/`;
        }
      }
      bootstrapCache = map;
      return map;
    })();
  }
  return bootstrapPromise;
}

async function rdapBaseFor(tld: string): Promise<string | null> {
  if (RDAP_OVERRIDE[tld]) return RDAP_OVERRIDE[tld];
  const boot = await loadBootstrap().catch(() => ({}) as Record<string, string>);
  return boot[tld] ?? RDAP_STATIC[tld] ?? null;
}

function tldOf(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1] ?? '';
}

function priceTier(domain: string): string {
  return PRICE_TIERS[tldOf(domain)] ?? '$$';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response | null> {
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

// RDAP registration status. Returns:
//   "taken"     — an RDAP server returned 200 (authoritatively registered)
//   "available" — a KNOWN registry RDAP endpoint returned 404 (authoritatively
//                 not registered). Only trusted from an endpoint resolved via the
//                 IANA bootstrap / verified override — never from a bare aggregator
//                 404, which can mean "no RDAP server for this TLD" (a guess).
//   "unknown"   — no RDAP endpoint for the TLD, or the endpoint was unreachable.
async function rdapStatus(domain: string): Promise<'taken' | 'available' | 'unknown'> {
  const headers = {
    accept: 'application/rdap+json, application/json',
    'user-agent': 'MyFenrir-DomainWizard/1.0 (+https://www.myfenrir.com)',
  };
  const base = await rdapBaseFor(tldOf(domain));
  if (base) {
    const res = await fetchWithTimeout(
      `${base}domain/${encodeURIComponent(domain)}`,
      { headers, redirect: 'follow' },
      6500
    );
    if (res) {
      if (res.status === 200) return 'taken';
      if (res.status === 404) return 'available'; // authoritative: the registry has no such registration
      // 429/5xx/403/malformed → fall through to the aggregator for a taken-confirm only.
    }
  }
  // Aggregator can only positively CONFIRM "taken" (a 200). We never infer
  // availability from its 404, because that may just mean it has no RDAP server
  // for the TLD — that path is left to the DNS signal / "couldn't check".
  const agg = await fetchWithTimeout(
    `https://rdap.org/domain/${encodeURIComponent(domain)}`,
    { headers, redirect: 'follow' },
    6000
  );
  if (agg && agg.status === 200) return 'taken';
  return 'unknown';
}

// DoH SOA lookup as a universal signal (works for every TLD, including ccTLDs
// like .gg/.ai with no RDAP). A registered apex answers with SOA (Status 0);
// an unregistered name returns NXDOMAIN (Status 3). Cloudflare first, Google as
// a second edge-to-edge path so one provider hiccup doesn't fail the check.
async function dnsSignal(domain: string): Promise<{ taken: boolean | null; records: string[] }> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=SOA`,
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=SOA`,
  ];
  for (const url of endpoints) {
    const res = await fetchWithTimeout(url, { headers: { accept: 'application/dns-json' } }, 4000);
    if (!res || !res.ok) continue;
    const payload = (await res.json().catch(() => null)) as {
      Status?: number;
      Answer?: Array<{ data?: string }>;
      Authority?: Array<{ data?: string }>;
    } | null;
    if (!payload || typeof payload.Status !== 'number') continue;
    if (payload.Status === 3) return { taken: false, records: [] }; // NXDOMAIN
    const answers = [...(payload.Answer ?? []), ...(payload.Authority ?? [])]
      .map((a) => String(a.data ?? '').trim())
      .filter(Boolean)
      .slice(0, 2);
    if (payload.Status === 0) return { taken: answers.length > 0, records: answers };
    // Other statuses (SERVFAIL/REFUSED) are inconclusive; try next provider.
  }
  return { taken: null, records: [] };
}

async function checkDomain(domain: string): Promise<AvailabilityResult> {
  const base: Omit<
    AvailabilityResult,
    'verdict' | 'confidence' | 'source' | 'taken' | 'registrarConfirm' | 'summary' | 'records'
  > = {
    domain,
    priceTier: priceTier(domain),
  };

  if (!DOMAIN_RE.test(domain)) {
    return {
      ...base,
      verdict: 'invalid',
      confidence: 'none',
      source: 'none',
      taken: null,
      registrarConfirm: false,
      summary: 'Use a valid domain name.',
      records: [],
    };
  }

  const [rdap, dns] = await Promise.all([rdapStatus(domain), dnsSignal(domain)]);

  // RDAP is authoritative for registration status.
  if (rdap === 'taken') {
    return {
      ...base,
      verdict: 'taken',
      confidence: 'authoritative',
      source: dns.records.length ? 'rdap+dns' : 'rdap',
      taken: true,
      registrarConfirm: false,
      summary: 'Registered. This domain is taken.',
      records: dns.records,
    };
  }

  if (rdap === 'available') {
    // The registry's own RDAP says the name is not registered. This is
    // authoritative even if stale DNS lingers from a recently-dropped domain.
    return {
      ...base,
      verdict: 'available',
      confidence: 'authoritative',
      source: dns.taken === false ? 'rdap+dns' : 'rdap',
      taken: false,
      registrarConfirm: false,
      summary: 'Not registered — available.',
      records: [],
    };
  }

  // RDAP unavailable for this TLD (no endpoint or unreachable) → DNS signal only.
  if (dns.taken === true) {
    return {
      ...base,
      verdict: 'taken',
      confidence: 'signal',
      source: 'dns',
      taken: true,
      registrarConfirm: true,
      summary: 'DNS is configured — likely registered. Confirm at a registrar.',
      records: dns.records,
    };
  }
  if (dns.taken === false) {
    return {
      ...base,
      verdict: 'available',
      confidence: 'signal',
      source: 'dns',
      taken: false,
      registrarConfirm: true,
      summary: 'No DNS record — likely available. Confirm at a registrar.',
      records: [],
    };
  }
  // Genuine lookup failure — say so, never guess.
  return {
    ...base,
    verdict: 'unknown',
    confidence: 'none',
    source: 'none',
    taken: null,
    registrarConfirm: true,
    summary: "Couldn't check right now — verify at a registrar.",
    records: [],
  };
}

function parseDomains(url: URL): string[] {
  const single = url.searchParams.get('domain');
  const many = url.searchParams.get('domains');
  const raw = many ? many.split(',') : single ? [single] : [];
  return raw
    .map((d) =>
      d
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
    )
    .filter(Boolean)
    .slice(0, 16);
}

export const onRequestGet: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const domains = parseDomains(url);
  if (domains.length === 0) {
    return noStoreJson(
      {
        ok: false,
        error: 'missing_domain',
        detail: 'Pass ?domain=example.com or ?domains=a.com,b.io',
      },
      { status: 400 }
    );
  }
  const results = await Promise.all(domains.map(checkDomain));
  return noStoreJson({ ok: true, results });
};
