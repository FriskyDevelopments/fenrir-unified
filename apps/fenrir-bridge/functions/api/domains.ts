import { readSession } from "../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../_lib/billing-env";
import { connectToken, isPublicHostname, isReservedFenrirHost, pagesProject } from "../_lib/cloudflare-pages-domain";
import { prepareDomainChallenge, sameOriginMutation } from "../_lib/domain-lifecycle";
import { addAudit } from "../_lib/product-db";
import { noStoreJson } from "../_lib/responses";
import { normalizeDnsName } from "../../shared/dns-lookup";
export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env).catch(() => null);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!sameOriginMutation(context.request)) return noStoreJson({ ok: false, error: "origin_not_allowed" }, { status: 403 });
  if (!context.env.DB) return dbNotConfiguredResponse();
  if (!connectToken(context.env)) return noStoreJson({ ok: false, error: "connect_not_configured" }, { status: 503 });
  const body = await context.request.json<{ domain?: unknown }>().catch(() => null);
  const domain = normalizeDnsName(body?.domain);
  if (!domain || !isPublicHostname(domain) || isReservedFenrirHost(domain) || domain.split(".").length < 3) return noStoreJson({ ok: false, error: "dedicated_subdomain_required" }, { status: 400 });
  try {
    const data = await prepareDomainChallenge(context.env.DB, session, domain, `${pagesProject(context.env)}.pages.dev`);
    await addAudit(context.env.DB, session, "domain_challenge_prepared", "FriskyDomain", data.id, { domain }).catch(() => undefined);
    return noStoreJson({ ok: true, data });
  } catch (cause) {
    const conflict = cause instanceof Error && cause.message === "domain_unavailable";
    return noStoreJson({ ok: false, error: conflict ? "domain_unavailable" : "domain_setup_unavailable" }, { status: conflict ? 409 : 503 });
  }
};
