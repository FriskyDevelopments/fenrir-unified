import { isDnsLookupResult, type DnsLookupResult, type DnsRecordType } from "../../shared/dns-lookup";

/** A lookup failure must never bypass session checks via a browser resolver fallback. */
export async function fetchDnsLookup(domain: string, type: DnsRecordType | "ALL", signal?: AbortSignal): Promise<DnsLookupResult> {
  const query = new URLSearchParams({ domain, type });
  const response = await fetch(`/api/domains/lookup?${query}`, {
    method: "GET", credentials: "same-origin", headers: { accept: "application/json" }, signal,
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) throw new Error("authentication_required");
  if (response.status === 400) throw new Error("invalid_dns_query");
  if (!response.ok || body?.ok !== true || !isDnsLookupResult(body)) throw new Error("lookup_unavailable");
  return body as DnsLookupResult;
}
