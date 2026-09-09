import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSession } from "../_lib/auth";
import { prepareDomainChallenge, reserveProvenDomain, finishDomainCheck } from "../_lib/domain-lifecycle";
import { getDomainForOrg, resolvePublicRoom, mapRoom } from "../_lib/product-db";
import { mapCertificateStatus } from "../_lib/cloudflare-pages-domain";
import { onRequestPost as prepare } from "../api/domains";
import { onRequestPost as check } from "../api/domains/check";
import { onRequestPost as createRoom } from "../api/rooms";
import { onRequestGet as capabilities } from "../api/domains/capabilities";

vi.mock("../_lib/auth", () => ({ readSession: vi.fn() }));
const session = (org: string) => ({ email: "operator@example.com", name: "Operator", provider: "google" as const, frisky_user_id: `user-${org}`, frisky_org_id: org, iat: 1, exp: 9999999999 });
const host = "vip.example.com", target = "fenrir-bridge.pages.dev";
let sqlite: DatabaseSync;
let db: any;
let env: any;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../../docs/product-d1-schema.sql", import.meta.url), "utf8"));
  db = { prepare(sql: string) {
    const statement = sqlite.prepare(sql);
    const query = (parameters: unknown[] = []) => ({ bind: (...values: unknown[]) => query(values),
      first: async () => statement.get(...parameters as any[]) ?? null,
      all: async () => ({ results: statement.all(...parameters as any[]) }),
      run: async () => ({ meta: { changes: Number(statement.run(...parameters as any[]).changes) } }) });
    return query();
  } };
  env = { DB: db, CLOUDFLARE_API_TOKEN: "unit-test-provider-token", CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_PAGES_PROJECT: "fenrir-bridge" };
  vi.mocked(readSession).mockResolvedValue(session("org-a"));
});
afterEach(() => { sqlite.close(); vi.unstubAllGlobals(); });
const request = (body: object, extra: Record<string, string> = {}) => new Request("https://myfenrir.com/api/domains", { method: "POST", headers: { "content-type": "application/json", origin: "https://myfenrir.com", ...extra }, body: JSON.stringify(body) });
const context = (body: object) => ({ request: request(body), env } as never);

function fakeProviders(record: any, status = "active", dnsMatched = true) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "cloudflare-dns.com" || url.hostname === "dns.google") {
      const type = url.searchParams.get("type") === "TXT" ? 16 : 5;
      const name = url.searchParams.get("name")!;
      return Response.json({ Status: 0, Question: [{ name: `${name}.`, type }], Answer: dnsMatched ? [{ name: `${name}.`, type, TTL: 60, data: type === 16 ? `"${record.txtRecordValue}"` : `${target}.` }] : [] });
    }
    if (url.pathname === "/client/v4/zones") return Response.json({ success: true, result: url.searchParams.get("name") === "example.com" ? [{ id: "zone", name: "example.com", status: "active", account: { id: "account" }, name_servers: [] }] : [] });
    if (url.pathname.endsWith(`/domains/${host}`)) return Response.json({ success: false, errors: [{ code: 404 }] }, { status: 404 });
    if (url.pathname.endsWith("/domains") && init?.method === "POST") {
      expect(sqlite.prepare("SELECT status FROM frisky_domains WHERE id = ?").get(record.id)?.status).toBe("provisioning");
      return Response.json({ success: true, result: { id: "hostname", name: host, status } });
    }
    throw new Error(`Unexpected test request path ${url.pathname}`);
  });
}

describe("SQLite-backed ownership lifecycle", () => {
  it("allows independent pending challenges and only reserves the first proven owner", async () => {
    const a = await prepareDomainChallenge(db, session("org-a"), host, target);
    const b = await prepareDomainChallenge(db, session("org-b"), host, target);
    expect(a.txtRecordValue).not.toBe(b.txtRecordValue);
    expect(sqlite.prepare("SELECT count(*) AS count FROM frisky_domains").get()?.count).toBe(2);
    const [first, second] = await Promise.all([reserveProvenDomain(db, a), reserveProvenDomain(db, b)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((await prepareDomainChallenge(db, session("org-a"), host, target)).txtRecordValue).toBe(a.txtRecordValue);
  });

  it("expires a failed provisioning lease, permits the new proven owner, and resolves its exact public room", async () => {
    const a = await prepareDomainChallenge(db, session("org-a"), host, target);
    const b = await prepareDomainChallenge(db, session("org-b"), host, target);
    const old = await reserveProvenDomain(db, a);
    sqlite.prepare("UPDATE frisky_domains SET verified_at = ? WHERE id = ?").run(new Date(Date.now() - 180000).toISOString(), a.id);
    const lease = await reserveProvenDomain(db, b);
    expect(lease).not.toBeNull();
    await finishDomainCheck(db, lease!, { status: "verified", certificateStatus: "active", hostnameId: "hostname" });
    await expect(finishDomainCheck(db, old!, { status: "verified", certificateStatus: "active" })).rejects.toThrow("domain_claim_changed");
    sqlite.prepare("INSERT INTO frisky_live_rooms VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("room", "org-b", b.id, "meet", "Meet", "zoom", "https://zoom.us/j/test", `https://${host}/meet`, "", "active", new Date().toISOString(), null);
    expect((await resolvePublicRoom(db, host, "meet"))?.publicUrl).toBe(`https://${host}/room/meet`);
    expect(await resolvePublicRoom(db, `www.${host}`, "meet")).toBeNull();
    expect(await resolvePublicRoom(db, "example.com", "meet")).toBeNull();
    sqlite.prepare("UPDATE frisky_live_rooms SET org_id = 'org-a' WHERE id = 'room'").run();
    expect(await resolvePublicRoom(db, host, "meet")).toBeNull();
    sqlite.prepare("UPDATE frisky_live_rooms SET org_id = 'org-b' WHERE id = 'room'").run();
    sqlite.prepare("UPDATE frisky_domains SET certificate_status = 'issuing' WHERE id = ?").run(b.id);
    expect(await resolvePublicRoom(db, host, "meet")).toBeNull();
  });

  it("rejects stale token and stale lease finalization", async () => {
    const a = await prepareDomainChallenge(db, session("org-a"), host, target);
    const lease = await reserveProvenDomain(db, a);
    sqlite.prepare("UPDATE frisky_domains SET verification_token = ? WHERE id = ?").run("0".repeat(64), a.id);
    await expect(finishDomainCheck(db, lease!, { status: "verified", certificateStatus: "active" })).rejects.toThrow("domain_claim_changed");
    expect(await reserveProvenDomain(db, a)).toBeNull();
  });

  it("allows challenge repair after an abandoned lease but never rotates a live attachment", async () => {
    const record = await prepareDomainChallenge(db, session("org-a"), host, target);
    const lease = await reserveProvenDomain(db, record);
    await expect(prepareDomainChallenge(db, session("org-a"), host, "new-project.pages.dev")).rejects.toThrow("domain_unavailable");
    sqlite.prepare("UPDATE frisky_domains SET verified_at = ? WHERE id = ?").run(new Date(Date.now() - 180000).toISOString(), record.id);
    const repaired = await prepareDomainChallenge(db, session("org-a"), host, "new-project.pages.dev");
    expect(repaired.status).toBe("pending");
    expect(repaired.cnameTarget).toBe("new-project.pages.dev");
    expect(repaired.verificationToken).not.toBe(record.verificationToken);
    await expect(finishDomainCheck(db, lease!, { status: "verified", certificateStatus: "active" })).rejects.toThrow("domain_claim_changed");
  });

  it("prepares proof without any DNS/provider access, including another tenant's pending hostname", async () => {
    await prepareDomainChallenge(db, session("org-b"), host, target);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await prepare(context({ domain: host }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("pending"); expect(body.data.certificateStatus).toBe("not_requested");
    expect(body.data.verificationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires authentication and rejects managed hosts, apex, URL input, and cross-origin mutation", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.mocked(readSession).mockResolvedValueOnce(null);
    expect((await prepare(context({ domain: host }))).status).toBe(401);
    for (const domain of ["another.myfenrir.com", "foo.pages.dev", "foo.workers.dev", "example.com", "https://vip.example.com", "127.0.0.1"]) expect((await prepare(context({ domain }))).status).toBe(400);
    expect((await prepare({ request: request({ domain: host }, { origin: "https://foreign.example" }), env } as never)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects another tenant's domain ID and legacy unproven Pages attachment", async () => {
    const record = await prepareDomainChallenge(db, session("org-b"), host, target);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await check(context({ domainId: record.id }))).status).toBe(404);
    sqlite.prepare("UPDATE frisky_domains SET org_id = 'org-a', verification_token = '', txt_record_value = '', status = 'verified', certificate_status = 'active'").run();
    expect((await check(context({ domainId: record.id }))).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("will not attach after missing DNS evidence", async () => {
    const record = await prepareDomainChallenge(db, session("org-a"), host, target);
    const fetcher = fakeProviders(record, "active", false); vi.stubGlobal("fetch", fetcher);
    expect((await check(context({ domainId: record.id }))).status).toBe(409);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes("api.cloudflare.com"))).toBe(true);
    expect((await getDomainForOrg(db, "org-a", record.id))?.status).toBe("pending");
  });

  it.each(["pending", "active"])("uses the provider top-level %s state after real-shaped DNS evidence and atomic reservation", async (status) => {
    const record = await prepareDomainChallenge(db, session("org-a"), host, target);
    vi.stubGlobal("fetch", fakeProviders(record, status));
    const response = await check(context({ domainId: record.id }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ status: status === "active" ? "verified" : "pending", certificateStatus: status === "active" ? "active" : "issuing", txtRecordValue: record.txtRecordValue });
  });

  it("does not mistake provider read failure or nested validation for an active certificate", async () => {
    expect(mapCertificateStatus({ validation_data: { status: "active" } }).status).toBe("pending");
    expect(mapCertificateStatus({ status: "blocked" }).certificateStatus).toBe("failed");
    const record = await prepareDomainChallenge(db, session("org-a"), host, target);
    const good = fakeProviders(record);
    const fetcher = vi.fn(async (input: any, init?: RequestInit) => String(input).includes(`/domains/${host}`) ? Response.json({ success: false }, { status: 500 }) : good(input, init));
    vi.stubGlobal("fetch", fetcher);
    expect((await check(context({ domainId: record.id }))).status).toBe(503);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect((await getDomainForOrg(db, "org-a", record.id))?.status).toBe("pending");
  });

  it("disables setup capability without provider config and never returns credentials", async () => {
    const response = await capabilities({ request: new Request("https://myfenrir.com/api/domains/capabilities"), env: { DB: db } } as never);
    expect(await response.json()).toMatchObject({ canConnect: false, requiresOwnershipProof: true });
  });

  it("creates only ready-domain rooms with the mounted /room/:slug URL and preserves old links at read time", async () => {
    const record = await prepareDomainChallenge(db, session("org-a"), host, target);
    const body = { domainId: record.id, slug: "meet", title: "Meet", provider: "zoom", targetUrl: "https://zoom.us/j/test" };
    expect((await createRoom(context(body))).status).toBe(409);
    const lease = await reserveProvenDomain(db, record);
    await finishDomainCheck(db, lease!, { status: "verified", certificateStatus: "active" });
    const response = await createRoom(context(body));
    expect(response.status).toBe(200);
    expect((await response.json()).data.publicUrl).toBe(`https://${host}/room/meet`);
    const stored = sqlite.prepare("SELECT * FROM frisky_live_rooms").get() as any;
    expect(mapRoom({ ...stored, public_url: `https://${host}/meet` }).publicUrl).toBe(`https://${host}/room/meet`);
  });
});
