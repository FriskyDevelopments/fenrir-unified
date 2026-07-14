import { readSession } from '../../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../../_lib/billing-env';
import {
  cfErrorMessage,
  cloudflareConfigured,
  getZone,
  universalSslActive,
} from '../../_lib/cloudflare-dns';
import { addAudit, getDomainForOrg, mapDomain } from '../../_lib/product-db';
import { noStoreJson } from '../../_lib/responses';

// POST /api/domains/cloudflare-status  { domainId }
//
// Poll the Cloudflare zone the wizard created: has DNS propagated (zone active =
// the registrar's nameservers now point at Cloudflare) and has Universal SSL
// issued? A zone can only go active once the customer controls the registrar and
// switches nameservers, so an active zone is itself proof of domain ownership — we
// mark the domain verified and, when the certificate is live, active.
export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  if (!cloudflareConfigured(context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: 'cloudflare_not_configured',
        message: 'Cloudflare automation is not enabled. Set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.',
      },
      { status: 503 }
    );
  }

  const body = await context.request.json<{ domainId?: unknown }>().catch(() => null);
  const domainId = typeof body?.domainId === 'string' ? body.domainId : '';
  const domain = await getDomainForOrg(context.env.DB, session.frisky_org_id, domainId);
  if (!domain)
    return noStoreJson(
      { ok: false, error: 'domain_not_found', message: 'Domain not found.' },
      { status: 404 }
    );

  const zoneId = domain.cloudflareHostnameId;
  if (!zoneId)
    return noStoreJson(
      {
        ok: false,
        error: 'zone_not_created',
        message: 'No Cloudflare zone yet — run "Switch DNS to Cloudflare" first.',
      },
      { status: 409 }
    );

  const zoneRes = await getZone(context.env, zoneId);
  if (!zoneRes.ok || !zoneRes.result) {
    return noStoreJson(
      { ok: false, error: 'cloudflare_zone_lookup_failed', message: cfErrorMessage(zoneRes.errors) },
      { status: 502 }
    );
  }
  const zone = zoneRes.result;
  const nameservers = zone.name_servers ?? domain.cloudflareNameservers ?? [];
  const active = zone.status === 'active';

  // Certificate status: only meaningful once the zone is active. Prefer the real
  // Universal SSL verification; fall back to the zone's active state if the SSL
  // endpoint is unavailable (permissions / plan).
  let certificateStatus: 'dns_pending' | 'issuing' | 'active';
  if (!active) {
    certificateStatus = 'dns_pending';
  } else {
    const ssl = await universalSslActive(context.env, zoneId);
    certificateStatus = ssl === 'active' ? 'active' : ssl === 'issuing' ? 'issuing' : 'active';
  }

  const nowVerified = active;
  const verifiedAt = nowVerified ? (domain.verifiedAt ?? new Date().toISOString()) : null;

  await context.env.DB.prepare(
    `UPDATE frisky_domains
       SET cloudflare_nameservers = ?,
           certificate_status = ?,
           status = ?,
           verified_at = ?
     WHERE id = ? AND org_id = ?`
  )
    .bind(
      nameservers.length ? JSON.stringify(nameservers) : null,
      certificateStatus,
      nowVerified ? 'verified' : domain.status,
      verifiedAt,
      domain.id,
      session.frisky_org_id
    )
    .run();

  await addAudit(
    context.env.DB,
    session,
    active ? 'cloudflare_zone_active' : 'cloudflare_zone_pending',
    'FriskyDomain',
    domain.id,
    { domain: domain.domain, zoneStatus: zone.status, certificateStatus }
  );

  const row = await context.env.DB.prepare(`SELECT * FROM frisky_domains WHERE id = ?`)
    .bind(domain.id)
    .first<any>();
  return noStoreJson({
    ok: true,
    data: mapDomain(row),
    zone: { id: zoneId, status: zone.status, active, nameservers, certificateStatus },
  });
};
