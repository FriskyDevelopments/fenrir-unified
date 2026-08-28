import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import {
  accountId,
  connectToken,
  getPagesDomain,
  mapCertificateStatus,
  pagesProject
} from "../../_lib/cloudflare-pages-domain";
import { addAudit, getDomainForOrg, updateDomainAttach } from "../../_lib/product-db";
import { noStoreJson } from "../../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const token = connectToken(context.env);
  if (!token) {
    return noStoreJson(
      { ok: false, error: "connect_not_configured", message: "Connect is not configured on this Worker yet." },
      { status: 503 }
    );
  }

  const body = await context.request.json<{ domainId?: unknown }>().catch(() => null);
  const domainId = typeof body?.domainId === "string" ? body.domainId : "";
  const domain = await getDomainForOrg(context.env.DB, session.frisky_org_id, domainId);
  if (!domain) return noStoreJson({ ok: false, error: "domain_not_found" }, { status: 404 });

  const pagesDomain = await getPagesDomain(token, accountId(context.env), pagesProject(context.env), domain.domain);
  if (!pagesDomain) {
    return noStoreJson(
      {
        ok: false,
        error: "pages_domain_missing",
        message: "This hostname is not attached yet. Click Connect again."
      },
      { status: 409 }
    );
  }

  const mapped = mapCertificateStatus(pagesDomain);
  const verifiedAt = mapped.status === "verified" ? new Date().toISOString() : domain.verifiedAt ?? null;
  const row = await updateDomainAttach(context.env.DB, session.frisky_org_id, domain.id, {
    status: mapped.status,
    certificateStatus: mapped.certificateStatus,
    cloudflareHostnameId: pagesDomain.id || domain.cloudflareHostnameId || "",
    verifiedAt
  });

  await addAudit(context.env.DB, session, "domain_ssl_checked", "FriskyDomain", row.id, {
    domain: domain.domain,
    certificate: mapped.certificateStatus
  });

  return noStoreJson({ ok: true, data: row });
};
