import { readSession } from "../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../_lib/billing-env";
import { addAudit, cleanDomain, createProductId, mapDomain } from "../_lib/product-db";
import { noStoreJson } from "../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request.json<{ domain?: unknown }>().catch(() => null);
  const domain = cleanDomain(typeof body?.domain === "string" ? body.domain : "");
  if (!domain || !domain.includes(".")) {
    return noStoreJson({ ok: false, error: "invalid_domain" }, { status: 400 });
  }

  const id = createProductId("domain", domain);
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  const host = domain.split(".")[0] || "join";
  const ts = new Date().toISOString();

  await context.env.DB
    .prepare(
      `INSERT INTO frisky_domains (
        id, org_id, domain, verification_token, txt_record_name, txt_record_value,
        cname_host, cname_target, status, dns_provider, certificate_status,
        cloudflare_hostname_id, cloudflare_nameservers, created_at
      ) VALUES (?, ?, ?, ?, '_fenrir', ?, ?, 'bridge.myfenrir.com', 'pending', 'cloudflare', 'dns_pending', NULL, NULL, ?)`
    )
    .bind(id, session.frisky_org_id, domain, token, `fenrir-verify=${token}`, host, ts)
    .run();

  await addAudit(context.env.DB, session, "domain_added", "FriskyDomain", id, { domain });
  const row = await context.env.DB.prepare(`SELECT * FROM frisky_domains WHERE id = ?`).bind(id).first<any>();
  return noStoreJson({ ok: true, data: mapDomain(row) });
};
