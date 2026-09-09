import type { SessionPayload } from "./auth";
import { createProductId, getDomainForOrg } from "./product-db";
import { lookupDnsRecords, matchesExpectedDnsRecord } from "../../shared/dns-lookup";

type Domain = NonNullable<Awaited<ReturnType<typeof getDomainForOrg>>>;

/** Pending challenges are per organization; they never reserve another tenant's hostname. */
export async function uniqueDomainClaim(db: D1Database, domain: string, orgId: string): Promise<{ id: string } | null> {
  const rows = await db.prepare("SELECT id, org_id FROM frisky_domains WHERE lower(domain) = ? AND org_id = ? LIMIT 2").bind(domain, orgId).all<{ id: string; org_id: string }>();
  if ((rows.results?.length ?? 0) > 1) throw new Error("domain_unavailable");
  return rows.results?.[0] ?? null;
}

/** Prepare a tenant-specific challenge; exclusivity starts only after DNS proof. */
export async function prepareDomainChallenge(db: D1Database, session: SessionPayload, domain: string, target: string): Promise<Domain> {
  const existing = await uniqueDomainClaim(db, domain, session.frisky_org_id);
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const name = `_fenrir.${domain}`, value = `fenrir-verify=${token}`;
  if (!existing) {
    await db.prepare(`INSERT INTO frisky_domains (
      id, org_id, domain, verification_token, txt_record_name, txt_record_value,
      cname_host, cname_target, status, dns_provider, certificate_status,
      cloudflare_hostname_id, cloudflare_nameservers, created_at, verified_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'cloudflare', 'not_requested', NULL, NULL, ?, NULL
      WHERE NOT EXISTS (SELECT 1 FROM frisky_domains WHERE lower(domain) = ? AND org_id = ?)`)
      .bind(createProductId("domain", domain), session.frisky_org_id, domain, token, name, value, domain, target, new Date().toISOString(), domain, session.frisky_org_id).run();
  }
  const claim = await uniqueDomainClaim(db, domain, session.frisky_org_id);
  if (!claim) throw new Error("domain_unavailable");
  const record = await getDomainForOrg(db, session.frisky_org_id, claim.id);
  if (!record) throw new Error("domain_unavailable");
  if (!hasDomainChallenge(record) || record.cnameTarget !== target) {
    await db.prepare(`UPDATE frisky_domains SET verification_token = ?, txt_record_name = ?, txt_record_value = ?,
      cname_host = ?, cname_target = ?, status = 'pending', certificate_status = 'not_requested', verified_at = NULL
      WHERE id = ? AND org_id = ? AND verification_token = ?
        AND (status != 'provisioning' OR coalesce(julianday(verified_at), 0) < julianday('now', '-2 minutes'))`).bind(token, name, value, domain, target, record.id, session.frisky_org_id, record.verificationToken).run();
  }
  const prepared = await getDomainForOrg(db, session.frisky_org_id, claim.id);
  if (!prepared || !hasDomainChallenge(prepared) || prepared.cnameTarget !== target) throw new Error("domain_unavailable");
  return prepared;
}

/** The first proven owner reserves atomically. Unverified rows cannot squat a host. */
export async function reserveProvenDomain(db: D1Database, record: Domain): Promise<Domain | null> {
  const lease = new Date().toISOString();
  const result = await db.prepare(`UPDATE frisky_domains SET status = 'provisioning', certificate_status = 'issuing', verified_at = ?
    WHERE id = ? AND org_id = ? AND verification_token = ? AND cname_target = ?
      AND (status != 'provisioning' OR coalesce(julianday(verified_at), 0) < julianday('now', '-2 minutes'))
      AND NOT EXISTS (SELECT 1 FROM frisky_domains other WHERE lower(other.domain) = ? AND other.id != ?
        AND (other.status = 'verified' OR (other.status = 'provisioning' AND julianday(other.verified_at) >= julianday('now', '-2 minutes'))))`)
    .bind(lease, record.id, record.orgId, record.verificationToken, record.cnameTarget, record.domain, record.id).run();
  return result.meta.changes === 1 ? { ...record, status: "provisioning", certificateStatus: "issuing", verifiedAt: lease } : null;
}

/** A late check must not activate a changed challenge or a different tenant. */
export async function finishDomainCheck(db: D1Database, record: Domain, result: { status: string; certificateStatus: string; hostnameId?: string; nameservers?: string[] }): Promise<Domain> {
  const updated = await db.prepare(`UPDATE frisky_domains SET status = ?, certificate_status = ?, cloudflare_hostname_id = ?,
    cloudflare_nameservers = ?, verified_at = ? WHERE id = ? AND org_id = ? AND verification_token = ? AND cname_target = ?
      AND status = ? AND coalesce(verified_at, '') = ?
      AND NOT EXISTS (SELECT 1 FROM frisky_domains other WHERE lower(other.domain) = ? AND other.id != ?
        AND (other.status = 'verified' OR (other.status = 'provisioning' AND julianday(other.verified_at) >= julianday('now', '-2 minutes'))))`)
    .bind(result.status, result.certificateStatus, result.hostnameId ?? record.cloudflareHostnameId ?? null,
      JSON.stringify(result.nameservers ?? record.cloudflareNameservers ?? []), result.status === "verified" ? new Date().toISOString() : null,
      record.id, record.orgId, record.verificationToken, record.cnameTarget, record.status, record.verifiedAt ?? "", record.domain, record.id).run();
  if (updated.meta.changes !== 1) throw new Error("domain_claim_changed");
  const row = await getDomainForOrg(db, record.orgId, record.id);
  if (!row) throw new Error("domain_claim_changed");
  return row;
}

export async function verifyDomainDns(record: Domain, signal?: AbortSignal): Promise<{ ownership: boolean; routing: boolean; failed: boolean }> {
  const [txt, cname] = await Promise.all([
    lookupDnsRecords(record.txtRecordName, ["TXT"], { signal }),
    lookupDnsRecords(record.domain, ["CNAME"], { signal })
  ]);
  const matches = (result: typeof txt, type: "TXT" | "CNAME", name: string, value: string) => result.resolvers.every((resolver) =>
    resolver.queries[0].status === "records" && resolver.queries[0].records.some((row) => matchesExpectedDnsRecord(row, type, name, value)));
  return {
    ownership: matches(txt, "TXT", record.txtRecordName, record.txtRecordValue),
    routing: matches(cname, "CNAME", record.domain, record.cnameTarget),
    failed: [...txt.resolvers, ...cname.resolvers].some((resolver) => resolver.queries[0].status === "resolver_error")
  };
}

export function hasDomainChallenge(record: Domain): boolean {
  return /^[a-f0-9]{64}$/.test(record.verificationToken) && record.txtRecordName === `_fenrir.${record.domain}` &&
    record.txtRecordValue === `fenrir-verify=${record.verificationToken}` && record.cnameHost === record.domain && !!record.cnameTarget;
}

export function sameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}
