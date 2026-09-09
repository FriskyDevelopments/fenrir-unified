import { readSession } from "../../_lib/auth";
import type { BillingEnv } from "../../_lib/billing-env";
import { connectToken, pagesProject } from "../../_lib/cloudflare-pages-domain";
import { noStoreJson } from "../../_lib/responses";

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env).catch(() => null);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  return noStoreJson({ ok: true, canConnect: !!context.env.DB && !!connectToken(context.env), mode: "cloudflare-pages", target: `${pagesProject(context.env)}.pages.dev`, requiresOwnershipProof: true, dedicatedSubdomainsOnly: true, requiresDnsOnlyCname: true });
};
