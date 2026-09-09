import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { accountId, attachPagesDomain, connectToken, findZoneOnAccount, isReservedFenrirHost, mapCertificateStatus, pagesProject } from "../../_lib/cloudflare-pages-domain";
import { finishDomainCheck, hasDomainChallenge, reserveProvenDomain, sameOriginMutation, verifyDomainDns } from "../../_lib/domain-lifecycle";
import { addAudit, getDomainForOrg } from "../../_lib/product-db";
import { noStoreJson } from "../../_lib/responses";
export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env).catch(() => null);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!sameOriginMutation(context.request)) return noStoreJson({ ok: false, error: "origin_not_allowed" }, { status: 403 });
  if (!context.env.DB) return dbNotConfiguredResponse();
  const token = connectToken(context.env);
  if (!token) return noStoreJson({ ok: false, error: "connect_not_configured" }, { status: 503 });
  const body = await context.request.json<{ domainId?: unknown }>().catch(() => null);
  let domain = await getDomainForOrg(context.env.DB, session.frisky_org_id, typeof body?.domainId === "string" ? body.domainId : "");
  if (!domain) return noStoreJson({ ok: false, error: "domain_not_found" }, { status: 404 });
  if (isReservedFenrirHost(domain.domain) || !hasDomainChallenge(domain) || domain.cnameTarget !== `${pagesProject(context.env)}.pages.dev`) return noStoreJson({ ok: false, error: "domain_proof_required" }, { status: 409 });
  const pending = () => finishDomainCheck(context.env.DB!, domain!, { status: "pending", certificateStatus: "dns_pending" });
  try {
    const proof = await verifyDomainDns(domain, context.request.signal);
    if (proof.failed || !proof.ownership || !proof.routing) {
      await pending();
      return noStoreJson({ ok: false, error: proof.failed ? "dns_lookup_unavailable" : "dns_records_pending" }, { status: proof.failed ? 503 : 409 });
    }
    const acct = accountId(context.env), project = pagesProject(context.env);
    const zone = await findZoneOnAccount(token, acct, domain.domain);
    if (!zone || zone.name === domain.domain) {
      await pending();
      return noStoreJson({ ok: false, error: !zone ? "zone_not_in_account" : "dedicated_subdomain_required" }, { status: 409 });
    }
    const reserved = await reserveProvenDomain(context.env.DB, domain);
    if (!reserved) return noStoreJson({ ok: false, error: "domain_claim_conflict" }, { status: 409 });
    domain = reserved;
    const attached = await attachPagesDomain(token, acct, project, domain.domain);
    if (!attached.ok) throw new Error("cloudflare_unavailable");
    const mapped = mapCertificateStatus(attached.domain);
    const data = await finishDomainCheck(context.env.DB, domain, { ...mapped, hostnameId: attached.domain.id!, nameservers: zone.name_servers });
    await addAudit(context.env.DB, session, "domain_checked", "FriskyDomain", domain.id, { domain: domain.domain, status: data.status, certificateStatus: data.certificateStatus }).catch(() => undefined);
    return noStoreJson({ ok: true, data });
  } catch (cause) {
    const stale = cause instanceof Error && cause.message === "domain_claim_changed";
    if (!stale) await pending().catch(() => undefined);
    return noStoreJson({ ok: false, error: stale ? "domain_claim_changed" : "domain_check_unavailable" }, { status: stale ? 409 : 503 });
  }
};
