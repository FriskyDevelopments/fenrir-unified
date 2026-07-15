import { readSession } from '../../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../../_lib/billing-env';
import { addAudit, getDomainForOrg, mapDomain } from '../../_lib/product-db';
import { noStoreJson } from '../../_lib/responses';

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request.json<{ domainId?: unknown }>().catch(() => null);
  const domainId = typeof body?.domainId === 'string' ? body.domainId : '';
  const domain = await getDomainForOrg(context.env.DB, session.frisky_org_id, domainId);
  if (!domain)
    return noStoreJson(
      { ok: false, error: 'domain_not_found', message: 'Domain not found.' },
      { status: 404 }
    );

  const verified = await verifyDomainTxtRecord(domain.txtRecordName, domain.txtRecordValue);
  if (!verified) {
    await context.env.DB.prepare(
      `UPDATE frisky_domains SET status = 'failed' WHERE id = ? AND org_id = ?`
    )
      .bind(domain.id, session.frisky_org_id)
      .run();
    await addAudit(context.env.DB, session, 'dns_check_failed', 'FriskyDomain', domain.id, {
      domain: domain.domain,
    });
    return noStoreJson(
      {
        ok: false,
        error: 'dns_txt_not_verified',
        message: 'Required Fenrir TXT ownership record was not found.',
      },
      { status: 400 }
    );
  }

  const verifiedAt = new Date().toISOString();
  await context.env.DB.prepare(
    `UPDATE frisky_domains SET status = 'verified', certificate_status = 'active', verified_at = ? WHERE id = ? AND org_id = ?`
  )
    .bind(verifiedAt, domain.id, session.frisky_org_id)
    .run();
  await addAudit(context.env.DB, session, 'domain_verified', 'FriskyDomain', domain.id, {
    domain: domain.domain,
  });

  const row = await context.env.DB.prepare(`SELECT * FROM frisky_domains WHERE id = ?`)
    .bind(domain.id)
    .first<any>();
  return noStoreJson({ ok: true, data: mapDomain(row) });
};

async function verifyDomainTxtRecord(name: string, expectedValue: string) {
  const recordName = name.trim().replace(/\.$/, '');
  const expected = expectedValue.trim();
  if (!recordName || !expected) return false;

  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(recordName)}&type=TXT`,
    {
      headers: { accept: 'application/dns-json' },
    }
  );
  if (!response.ok) return false;

  const payload = await response.json<{ Answer?: Array<{ data?: string }> }>().catch(() => null);
  return Boolean(payload?.Answer?.some((answer) => cleanTxtValue(answer.data ?? '') === expected));
}

function cleanTxtValue(value: string) {
  return value
    .split(/"\s+"/)
    .map((part) => part.replace(/^"|"$/g, ''))
    .join('')
    .trim();
}
