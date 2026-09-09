import { readSession } from "../../_lib/auth";
import type { BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";
import { DNS_RECORD_TYPES, isDnsRecordType, lookupDnsRecords, normalizeDnsName } from "../../../shared/dns-lookup";

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env).catch(() => null);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  const url = new URL(context.request.url);
  const domain = normalizeDnsName(url.searchParams.get("domain"));
  const type = url.searchParams.get("type") ?? "ALL";
  if (!domain || (type !== "ALL" && !isDnsRecordType(type))) {
    return noStoreJson({ ok: false, error: "invalid_dns_query" }, { status: 400 });
  }
  // No tenant records, ownership status, certificates, or provider settings are written.
  const result = await lookupDnsRecords(domain, type === "ALL" ? DNS_RECORD_TYPES : [type], { signal: context.request.signal });
  return noStoreJson({ ok: true, ...result });
};
