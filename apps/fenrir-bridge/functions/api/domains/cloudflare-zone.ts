import { readSession } from '../../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../../_lib/billing-env';
import {
  cfErrorMessage,
  cloudflareConfigured,
  createZone,
  findZone,
  registrableApex,
} from '../../_lib/cloudflare-dns';
import { addAudit, getDomainForOrg, mapDomain } from '../../_lib/product-db';
import { noStoreJson } from '../../_lib/responses';

// POST /api/domains/cloudflare-zone  { domainId }
//
// "Switch DNS to Cloudflare": create (or identify) the real Cloudflare zone for a
// domain the org already added, persist the two assigned nameservers + zone id, and
// hand them back so the wizard can show exactly what to paste at the registrar.
export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  if (!cloudflareConfigured(context.env)) {
    // Honest dark-gate: without the token the wizard stays in manual mode. The UI
    // still shows the TXT/CNAME records and the generic "point DNS to Cloudflare"
    // guidance — it just can't auto-create the zone or fetch real nameservers yet.
    return noStoreJson(
      {
        ok: false,
        error: 'cloudflare_not_configured',
        message:
          'Automatic Cloudflare zone creation is not enabled yet. Add the domain to Cloudflare manually, or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.',
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

  const apex = registrableApex(domain.domain);
  if (!apex || !apex.includes('.')) {
    return noStoreJson(
      { ok: false, error: 'invalid_domain', message: 'Could not derive a registrable domain.' },
      { status: 400 }
    );
  }

  // Idempotent: reuse an existing zone (re-running the wizard must not duplicate).
  let zone = await findZone(context.env, apex);
  if (!zone) {
    const created = await createZone(context.env, apex);
    if (!created.ok || !created.result) {
      return noStoreJson(
        {
          ok: false,
          error: 'cloudflare_zone_create_failed',
          message: cfErrorMessage(created.errors),
        },
        { status: 502 }
      );
    }
    zone = created.result;
  }

  const nameservers = zone.name_servers ?? [];
  // The zone is 'active' only once the registrar's nameservers point at Cloudflare.
  // Until then the cert can't issue, so we mark it dns_pending; the status poll
  // promotes it to issuing/active.
  const certificateStatus = zone.status === 'active' ? 'issuing' : 'dns_pending';

  await context.env.DB.prepare(
    `UPDATE frisky_domains
       SET dns_provider = 'cloudflare',
           cloudflare_hostname_id = ?,
           cloudflare_nameservers = ?,
           certificate_status = ?
     WHERE id = ? AND org_id = ?`
  )
    .bind(
      zone.id,
      nameservers.length ? JSON.stringify(nameservers) : null,
      certificateStatus,
      domain.id,
      session.frisky_org_id
    )
    .run();

  await addAudit(context.env.DB, session, 'cloudflare_zone_created', 'FriskyDomain', domain.id, {
    domain: domain.domain,
    apex,
    zoneId: zone.id,
    zoneStatus: zone.status,
  });

  const row = await context.env.DB.prepare(`SELECT * FROM frisky_domains WHERE id = ?`)
    .bind(domain.id)
    .first<any>();
  return noStoreJson({
    ok: true,
    data: mapDomain(row),
    zone: { id: zone.id, apex, status: zone.status, nameservers },
  });
};
