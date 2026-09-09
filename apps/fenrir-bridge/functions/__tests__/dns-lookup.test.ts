import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionPayload, signSession } from "../_lib/auth";
import { onRequestGet } from "../api/domains/lookup";
import { DNS_RECORD_TYPES, lookupDnsRecords, matchesExpectedDnsRecord, normalizeDnsName } from "../../shared/dns-lookup";
import { fetchDnsLookup } from "../../src/services/dnsLookup";

const codes = { A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, NS: 2, SOA: 6 };
function payload(url: string, additions: Record<string, unknown> = {}) {
  const query = new URL(url);
  return { Status: 0, Question: [{ name: `${query.searchParams.get("name")}.`, type: codes[query.searchParams.get("type") as keyof typeof codes] }], ...additions };
}
const answer = (name = "example.com.", type = 1, data = "192.0.2.1") => ({ name, type, TTL: 300, data });
const recorded = (name: string, type: number, data: string) => ({ name, type, ttl: 300, data });
function stubResolver(additions: Record<string, unknown>) {
  return vi.fn(async (url: string) => Response.json(payload(url, additions))) as unknown as typeof fetch;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("DNS lookup evidence", () => {
  it("normalizes owner names including underscores and IDN without accepting URLs or IPs", () => {
    expect(normalizeDnsName(" _FRISKY.Vip.Example.com. ")).toBe("_frisky.vip.example.com");
    expect(normalizeDnsName("bücher.de")).toBe("xn--bcher-kva.de");
    for (const input of ["", "https://example.com", "example.com/path", "user@example.com", "example.com:443", "127.0.0.1", "127.1", "localhost", "a..com", "a.com?token=abc", "*.example.com", "a b.com", `${"a".repeat(64)}.com`, "a%2eb.com"]) {
      expect(normalizeDnsName(input), input).toBeNull();
    }
  });

  it("uses only the two real resolvers with a bounded fourteen-query sweep", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(["cloudflare-dns.com", "dns.google"]).toContain(new URL(url).hostname);
      expect(init?.headers).toEqual({ accept: "application/dns-json" });
      expect(init?.redirect).toBe("error");
      return Response.json(payload(url));
    });
    const result = await lookupDnsRecords("example.com", DNS_RECORD_TYPES, { fetcher: fetcher as typeof fetch });
    expect(fetcher).toHaveBeenCalledTimes(14);
    expect(result.resolvers.map((resolver) => resolver.id)).toEqual(["cloudflare", "google"]);
    expect(result.resolvers.every((resolver) => resolver.queries.length === 7)).toBe(true);
  });

  it("separates requested-type records from the reachable CNAME chain and ignores unrelated answers", async () => {
    const result = await lookupDnsRecords("example.com", ["A"], { fetcher: stubResolver({ Answer: [
      answer("example.com.", 5, "edge.example.net."), answer("edge.example.net."), answer("unrelated.example.org."),
    ] }) });
    for (const resolver of result.resolvers) {
      expect(resolver.queries[0].records).toEqual([recorded("edge.example.net.", 1, "192.0.2.1")]);
      expect(resolver.queries[0].aliases).toEqual([recorded("example.com.", 5, "edge.example.net.")]);
    }
  });

  it.each([
    ["empty successful answer", { Status: 0 }, "no_records"],
    ["NXDOMAIN", { Status: 3 }, "nxdomain"],
    ["SERVFAIL with misleading Answer", { Status: 2, Answer: [answer()] }, "resolver_error"],
    ["REFUSED", { Status: 5 }, "resolver_error"],
    ["missing status", { Status: undefined }, "resolver_error"],
    ["string status", { Status: "0" }, "resolver_error"],
    ["truncated response", { TC: true, Answer: [answer()] }, "resolver_error"],
    ["malformed Answer", { Answer: null }, "resolver_error"],
    ["malformed record", { Answer: [{ type: 1, data: "192.0.2.1" }] }, "resolver_error"],
    ["wrong question", { Question: [{ type: 1, name: "elsewhere.com" }], Answer: [answer()] }, "resolver_error"],
    ["CNAME cycle", { Answer: [answer("example.com.", 5, "edge.example.net."), answer("edge.example.net.", 5, "example.com.")] }, "resolver_error"],
  ])("distinguishes %s", async (_name, addition, status) => {
    const result = await lookupDnsRecords("example.com", ["A"], { fetcher: stubResolver(addition) });
    expect(result.resolvers[0].queries[0].status).toBe(status);
    expect(result.resolvers[0].queries[0].records).toEqual([]);
  });

  it("keeps reachable alias evidence when the alias target is NXDOMAIN", async () => {
    const result = await lookupDnsRecords("example.com", ["A"], { fetcher: stubResolver({ Status: 3, Answer: [answer("example.com.", 5, "missing.example.net.")] }) });
    expect(result.resolvers[0].queries[0]).toMatchObject({ status: "nxdomain", records: [], aliases: [recorded("example.com.", 5, "missing.example.net.")] });
  });

  it("retains successful evidence when one resolver is unreachable", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (new URL(url).hostname === "dns.google") throw new Error("unreachable");
      return Response.json(payload(url, { Answer: [answer()] }));
    });
    const result = await lookupDnsRecords("example.com", ["A"], { fetcher: fetcher as typeof fetch });
    expect(result.resolvers.map((resolver) => resolver.queries[0].status)).toEqual(["records", "resolver_error"]);
  });

  it.each([null, "not json"])("marks malformed resolver JSON as invalid evidence: %s", async (value) => {
    const result = await lookupDnsRecords("example.com", ["A"], { fetcher: vi.fn(async () => new Response(value === null ? "null" : value)) as typeof fetch });
    expect(result.resolvers[0].queries[0]).toMatchObject({ status: "resolver_error", error: "invalid_response" });
  });

  it("keeps the timeout active through body consumption", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, text: () => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) }));
    const result = await lookupDnsRecords("example.com", ["A"], { fetcher: fetcher as unknown as typeof fetch, timeoutMs: 5 });
    expect(result.resolvers.every((resolver) => resolver.queries[0].error === "timeout")).toBe(true);
  });

  it("cancels in-flight requests and never starts subsequent batches after cancellation", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })));
    const pending = lookupDnsRecords("example.com", DNS_RECORD_TYPES, { fetcher: fetcher as unknown as typeof fetch, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("matches only the expected owner and record type, including multi-segment TXT without quote stripping", () => {
    const matches = (data: string) => matchesExpectedDnsRecord(recorded("_frisky.example.com.", 16, data), "TXT", "_frisky.example.com", "frisky-verification=CaseSensitive");
    expect(matches('"frisky-verification=" "CaseSensitive"')).toBe(true);
    expect(matches('"frisky-verification=casesensitive"')).toBe(false);
    expect(matches('"prefix-frisky-verification=CaseSensitive"')).toBe(false);
    expect(matches('"frisky-verification=\\\"CaseSensitive\\\""')).toBe(false);
    expect(matches('"frisky-verification=CaseSensitive')).toBe(false);
    expect(matches('"frisky-verification=\\067aseSensitive"')).toBe(true);
    expect([recorded("_frisky.example.com.", 16, '"frisky-verification="'), recorded("_frisky.example.com.", 16, '"CaseSensitive"')]
      .some((record) => matchesExpectedDnsRecord(record, "TXT", "_frisky.example.com", "frisky-verification=CaseSensitive"))).toBe(false);
    expect(matchesExpectedDnsRecord(recorded("wrong.example.com.", 16, '"frisky-verification=CaseSensitive"'), "TXT", "_frisky.example.com", "frisky-verification=CaseSensitive")).toBe(false);
    expect(matchesExpectedDnsRecord(recorded("vip.example.com.", 5, "TARGET.Example.com."), "CNAME", "vip.example.com", "target.example.com")).toBe(true);
    expect(matchesExpectedDnsRecord(recorded("vip.example.com.", 16, "target.example.com"), "CNAME", "vip.example.com", "target.example.com")).toBe(false);
  });
});

describe("authenticated DNS lookup route", () => {
  const env = { SESSION_SECRET: "dns-lookup-unit-test-secret-not-a-credential" };
  async function request(query: string, cookie?: string) {
    return onRequestGet({ request: new Request(`https://myfenrir.com/api/domains/lookup?${query}`, { headers: cookie ? { cookie: `fenrir_session=${cookie}` } : {} }), env } as never);
  }
  async function session(expired = false) {
    const payload = createSessionPayload({ email: "dns@example.com", name: "DNS test", provider: "google", identityId: "dns-test" });
    if (expired) payload.exp = 1;
    return signSession(payload, env);
  }

  it("rejects missing, invalid and expired sessions before making any resolver request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const cookie of [undefined, "malformed.cookie", await session(true)]) {
      const response = await request("domain=example.com", cookie);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    // Current auth may consult its own /auth/me before checking the legacy cookie.
    expect(fetcher.mock.calls.filter(([url]) => String(url) !== "https://myfenrir.com/auth/me")).toHaveLength(0);
  });

  it("rejects unsupported types and malformed input before outbound queries", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const query of ["domain=https://example.com", "domain=example.com&type=ANY", "domain=example.com&type=A,TXT"]) {
      expect((await request(query, await session())).status).toBe(400);
    }
    expect(fetcher.mock.calls.filter(([url]) => String(url) !== "https://myfenrir.com/auth/me")).toHaveLength(0);
  });

  it("returns real public evidence to an authenticated user without database or provider writes", async () => {
    const fetcher = stubResolver({ Answer: [answer("_frisky.example.com.", 16, '"public-token"')] }); vi.stubGlobal("fetch", fetcher);
    const response = await request("domain=_frisky.example.com&type=TXT", await session());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.domain).toBe("_frisky.example.com");
    expect(body.resolvers[0].queries[0].records[0].data).toBe('"public-token"');
    expect(vi.mocked(fetcher).mock.calls.filter(([url]) => String(url) !== "https://myfenrir.com/auth/me")).toHaveLength(2);
    expect(body).not.toHaveProperty("verified");
    expect(body).not.toHaveProperty("certificateStatus");
  });
});

describe("DNS browser service", () => {
  it.each([401, 403])("never bypasses HTTP %s with a browser DNS fallback", async (status) => {
    const fetcher = vi.fn(async () => Response.json({ ok: false, error: "authentication_required" }, { status })); vi.stubGlobal("fetch", fetcher);
    await expect(fetchDnsLookup("example.com", "TXT")).rejects.toThrow("authentication_required");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/domains/lookup?domain=example.com&type=TXT", expect.objectContaining({ credentials: "same-origin", method: "GET" }));
  });

  it.each([
    { ok: true, resolvers: [] },
    { ok: true, domain: "example.com", checkedAt: new Date().toISOString(), resolvers: [null, null] },
    { ok: true, domain: "example.com", checkedAt: new Date().toISOString(), resolvers: [{ id: "cloudflare", name: "Cloudflare", queries: [null] }, { id: "google", name: "Google", queries: [null] }] },
  ])("rejects malformed HTTP 200 evidence before rendering nested records", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    await expect(fetchDnsLookup("example.com", "ALL")).rejects.toThrow("lookup_unavailable");
  });
});
