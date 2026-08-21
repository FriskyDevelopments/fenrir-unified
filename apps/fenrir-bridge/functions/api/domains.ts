import { readSession } from "../_lib/auth";
import { type BillingEnv } from "../_lib/billing-env";
import { noStoreJson } from "../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  // Do not accept domains until Cloudflare Custom Hostnames is provisioned.
  // A plain CNAME to a Worker cannot issue TLS for a customer's hostname.
  return noStoreJson(
    {
      ok: false,
      error: "custom_domains_not_available",
      message: "Custom domains are not available yet. Use your managed MyFenrir Gate instead."
    },
    { status: 503 }
  );

};
