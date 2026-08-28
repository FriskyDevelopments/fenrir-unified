import { readSession } from "../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../_lib/billing-env";
import {
  accountId,
  attachPagesDomain,
  connectToken,
  findZoneOnAccount,
  isPublicHostname,
  isReservedFenrirHost,
  mapCertificateStatus,
  pagesProject
} from "../_lib/cloudflare-pages-domain";
import { addAudit, cleanDomain, createProductId, getDomainByHostname, insertDomain, updateDomainAttach } from "../_lib/product-db";
import { noStoreJson } from "../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const token = connectToken(context.env);
  if (!token) {
    return noStoreJson(
      {
        ok: false,
        error: "connect_not_configured",
        message: "Connect is not configured on this Worker yet."
      },
      { status: 503 }
    );
  }

  const body = await context.request.json<{ domain?: unknown }>().catch(() => null);
  const domain = cleanDomain(typeof body?.domain === "string" ? body.domain : "");
  if (!isPublicHostname(domain) || isReservedFenrirHost(domain)) {
    return noStoreJson(
      { ok: false, error: "invalid_domain", message: "Enter a domain like pupfrisky.com." },
      { status: 400 }
    );
  }

  const acct = accountId(context.env);
  const project = pagesProject(context.env);
  const zone = await findZoneOnAccount(token, acct, domain);
  if (!zone) {
    return noStoreJson(
      {
        ok: false,
        error: "zone_not_in_account",
        message: "That domain is not in this Cloudflare account. Add the zone, then click Connect."
      },
      { status: 409 }
    );
  }

  const attached = await attachPagesDomain(token, acct, project, domain);
  if (!attached.ok) {
    return noStoreJson(
      { ok: false, error: "pages_domain_attach_failed", message: attached.error },
      { status: 502 }
    );
  }

  const mapped = mapCertificateStatus(attached.domain);
  const nameservers = JSON.stringify(zone.name_servers ?? []);
  const hostnameId = attached.domain.id || zone.id;
  const now = new Date().toISOString();
  const verifiedAt = mapped.status === "verified" ? now : null;

  const existing = await getDomainByHostname(context.env.DB, session.frisky_org_id, domain);
  const row = existing
    ? await updateDomainAttach(context.env.DB, session.frisky_org_id, existing.id, {
        status: mapped.status,
        certificateStatus: mapped.certificateStatus,
        cloudflareHostnameId: hostnameId,
        cloudflareNameservers: nameservers,
        verifiedAt
      })
    : await insertDomain(context.env.DB, {
        id: createProductId("domain", domain),
        orgId: session.frisky_org_id,
        domain,
        status: mapped.status,
        certificateStatus: mapped.certificateStatus,
        cloudflareHostnameId: hostnameId,
        cloudflareNameservers: nameservers,
        createdAt: now,
        verifiedAt
      });

  await addAudit(
    context.env.DB,
    session,
    existing ? "domain_reconnected" : "domain_connected",
    "FriskyDomain",
    row.id,
    { domain, zone: zone.name, pages: project }
  );

  return noStoreJson({ ok: true, data: row });
};
