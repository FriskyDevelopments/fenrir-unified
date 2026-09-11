/** Read-only DNS-WIZARD adaptation. Provenance: docs/dns-wizard-integration.md. */
export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA"] as const;
export type DnsRecordType = typeof DNS_RECORD_TYPES[number];
export type DnsLookupStatus = "records" | "no_records" | "nxdomain" | "resolver_error";
export type DnsLookupRecord = { name: string; type: number; ttl: number; data: string };
export type DnsLookupQuery = {
  type: DnsRecordType;
  status: DnsLookupStatus;
  rcode: number | null;
  records: DnsLookupRecord[];
  aliases: DnsLookupRecord[];
  error?: "timeout" | "network_error" | "http_error" | "invalid_response" | "truncated" | "dns_error";
};
export type DnsLookupResult = {
  domain: string;
  checkedAt: string;
  resolvers: { id: string; name: string; queries: DnsLookupQuery[] }[];
};

const TYPE_CODES: Record<DnsRecordType, number> = { A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, NS: 2, SOA: 6 };
const RESOLVERS = [
  { id: "cloudflare", name: "Cloudflare · 1.1.1.1", url: "https://cloudflare-dns.com/dns-query" },
  { id: "google", name: "Google · 8.8.8.8", url: "https://dns.google/resolve" },
] as const;

/** Accept a DNS name (including TXT/service labels and IDN), never a URL or IP. */
export function normalizeDnsName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  const input = value.trim().toLowerCase().replace(/\.$/, "");
  if (!input || /[\s/:?#@%\\*\[\]]/.test(input)) return null;
  let domain: string;
  try { domain = new URL(`https://${input}`).hostname; } catch { return null; }
  if (domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels.at(-1)!)) return null;
  if (labels.some((label) => !/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label))) return null;
  return domain;
}

export function isDnsRecordType(value: unknown): value is DnsRecordType {
  return typeof value === "string" && DNS_RECORD_TYPES.includes(value as DnsRecordType);
}

/** Validate the authenticated edge response before the UI renders nested evidence. */
export function isDnsLookupResult(value: unknown): value is DnsLookupResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (typeof result.domain !== "string" || normalizeDnsName(result.domain) !== result.domain ||
      typeof result.checkedAt !== "string" || !Number.isFinite(Date.parse(result.checkedAt)) ||
      !Array.isArray(result.resolvers) || result.resolvers.length !== 2) return false;
  const validRecord = (record: unknown): boolean => {
    if (!record || typeof record !== "object") return false;
    const row = record as Record<string, unknown>;
    return typeof row.name === "string" && row.name.length <= 254 && typeof row.type === "number" && Number.isInteger(row.type) &&
      typeof row.ttl === "number" && Number.isInteger(row.ttl) && row.ttl >= 0 && typeof row.data === "string" && row.data.length <= 8192;
  };
  return result.resolvers.every((rawResolver: unknown, index) => {
    if (!rawResolver || typeof rawResolver !== "object") return false;
    const resolver = rawResolver as Record<string, unknown>;
    if (resolver.id !== RESOLVERS[index].id || typeof resolver.name !== "string" ||
        !Array.isArray(resolver.queries) || !resolver.queries.length || resolver.queries.length > 7) return false;
    return resolver.queries.every((rawQuery: unknown) => {
      if (!rawQuery || typeof rawQuery !== "object") return false;
      const query = rawQuery as Record<string, unknown>;
      return isDnsRecordType(query.type) && ["records", "no_records", "nxdomain", "resolver_error"].includes(String(query.status)) &&
        (query.rcode === null || (typeof query.rcode === "number" && Number.isInteger(query.rcode) && query.rcode >= 0 && query.rcode <= 15)) &&
        Array.isArray(query.records) && query.records.every(validRecord) && Array.isArray(query.aliases) && query.aliases.every(validRecord) &&
        (query.error === undefined || ["timeout", "network_error", "http_error", "invalid_response", "truncated", "dns_error"].includes(String(query.error)));
    });
  });
}

type LookupOptions = { fetcher?: typeof fetch; timeoutMs?: number; now?: () => Date; signal?: AbortSignal };

export async function lookupDnsRecords(domainInput: string, types: readonly DnsRecordType[] = DNS_RECORD_TYPES, options: LookupOptions = {}): Promise<DnsLookupResult> {
  const domain = normalizeDnsName(domainInput);
  if (!domain || !types.length || types.length > DNS_RECORD_TYPES.length || types.some((type) => !isDnsRecordType(type))) {
    throw new Error("invalid_dns_query");
  }
  const uniqueTypes = [...new Set(types)];
  options.signal?.throwIfAborted();
  // At most four simultaneous requests, bounded to fourteen fixed-provider GETs.
  const resolvers = await Promise.all(RESOLVERS.map(async (resolver) => {
    const queries: DnsLookupQuery[] = [];
    for (let index = 0; index < uniqueTypes.length; index += 2) {
      options.signal?.throwIfAborted();
      queries.push(...await Promise.all(uniqueTypes.slice(index, index + 2).map((type) => queryResolver(resolver.url, domain, type, options))));
    }
    return { id: resolver.id, name: resolver.name, queries };
  }));
  return { domain, checkedAt: (options.now?.() ?? new Date()).toISOString(), resolvers };
}

async function queryResolver(endpoint: string, domain: string, type: DnsRecordType, options: LookupOptions): Promise<DnsLookupQuery> {
  const base = { type, rcode: null, records: [], aliases: [] };
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);
  try {
    const url = new URL(endpoint);
    url.searchParams.set("name", domain);
    url.searchParams.set("type", type);
    const response = await (options.fetcher ?? fetch)(url.toString(), {
      headers: { accept: "application/dns-json" }, signal: controller.signal, redirect: "manual",
    });
    if (!response.ok) return { ...base, status: "resolver_error", error: "http_error" };
    const raw = await response.text();
    if (raw.length > 131072) return { ...base, status: "resolver_error", error: "invalid_response" };
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return { ...base, status: "resolver_error", error: "invalid_response" }; }
    if (!data || typeof data !== "object") return { ...base, status: "resolver_error", error: "invalid_response" };
    const payload = data as Record<string, unknown>;
    const rcode = payload.Status;
    if (typeof rcode !== "number" || !Number.isInteger(rcode) || rcode < 0 || rcode > 15 ||
        !Array.isArray(payload.Question) || !payload.Question.some((question: unknown) => {
          if (!question || typeof question !== "object") return false;
          const q = question as Record<string, unknown>;
          return q.type === TYPE_CODES[type] && normalizeDnsName(q.name) === domain;
        })) return { ...base, status: "resolver_error", error: "invalid_response" };
    if (payload.TC === true) return { ...base, rcode, status: "resolver_error", error: "truncated" };
    if (rcode !== 0 && rcode !== 3) return { ...base, rcode, status: "resolver_error", error: "dns_error" };
    if (payload.Answer !== undefined && !Array.isArray(payload.Answer)) return { ...base, rcode, status: "resolver_error", error: "invalid_response" };
    const answer = (payload.Answer ?? []) as unknown[];
    const records: DnsLookupRecord[] = [];
    for (const rawRecord of answer) {
      if (!rawRecord || typeof rawRecord !== "object") return { ...base, rcode, status: "resolver_error", error: "invalid_response" };
      const record = rawRecord as Record<string, unknown>;
      if (typeof record.name !== "string" || typeof record.type !== "number" || !Number.isInteger(record.type) ||
          typeof record.TTL !== "number" || !Number.isInteger(record.TTL) || record.TTL < 0 ||
          typeof record.data !== "string" || record.data.length > 8192) return { ...base, rcode, status: "resolver_error", error: "invalid_response" };
      records.push({ name: record.name, type: record.type, ttl: record.TTL, data: record.data });
    }
    // Only accept requested records at the queried owner or along its bounded
    // CNAME chain. An unrelated record in an answer is not evidence for this name.
    const owners = new Set([domain]);
    const chain: DnsLookupRecord[] = [];
    let owner = domain;
    for (let hop = 0; hop <= 16; hop++) {
      const links = records.filter((record) => record.type === TYPE_CODES.CNAME && normalizeDnsName(record.name) === owner);
      if (!links.length) break;
      const targets = new Set(links.map((record) => normalizeDnsName(record.data)));
      const target = [...targets][0];
      if (targets.size !== 1 || !target || owners.has(target) || hop === 16) return { ...base, rcode, status: "resolver_error", error: "invalid_response" };
      chain.push(...links);
      owners.add(target); owner = target;
    }
    const requested = records.filter((record) => record.type === TYPE_CODES[type] && owners.has(normalizeDnsName(record.name) ?? ""));
    const aliases = type === "CNAME" ? [] : chain;
    if (rcode === 3) return { ...base, rcode, aliases, status: "nxdomain" };
    return { type, rcode, records: requested, aliases, status: requested.length ? "records" : "no_records" };
  } catch {
    options.signal?.throwIfAborted();
    return { ...base, status: "resolver_error", error: controller.signal.aborted ? "timeout" : "network_error" };
  } finally { clearTimeout(timeout); options.signal?.removeEventListener("abort", cancel); }
}

/** Decode DNS TXT presentation strings without deleting literal embedded quotes. */
function txtValue(raw: string): string | null {
  if (!raw.startsWith('"')) return raw;
  let index = 0;
  let value = "";
  while (index < raw.length) {
    while (/\s/.test(raw[index] ?? "") && index < raw.length) index++;
    if (index === raw.length) break;
    if (raw[index++] !== '"') return null;
    let closed = false;
    while (index < raw.length) {
      const char = raw[index++];
      if (char === '"') { closed = true; break; }
      if (char !== "\\") { value += char; continue; }
      if (index >= raw.length) return null;
      const digits = raw.slice(index, index + 3);
      if (/^\d{3}$/.test(digits)) {
        const code = Number(digits);
        if (code > 255) return null;
        value += String.fromCharCode(code); index += 3;
      } else { value += raw[index++]; }
    }
    if (!closed) return null;
  }
  return value;
}

export function matchesExpectedDnsRecord(record: DnsLookupRecord, type: "CNAME" | "TXT", name: string, expected: string): boolean {
  const owner = normalizeDnsName(name);
  if (!owner || normalizeDnsName(record.name) !== owner || record.type !== TYPE_CODES[type]) return false;
  return type === "CNAME"
    ? normalizeDnsName(record.data) !== null && normalizeDnsName(record.data) === normalizeDnsName(expected)
    : txtValue(record.data) === expected;
}
