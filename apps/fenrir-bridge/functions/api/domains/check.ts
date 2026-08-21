import { readSession } from "../../_lib/auth";
import { type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  // Custom Hostnames has not been provisioned. TXT ownership alone never
  // proves that Cloudflare has issued TLS or can route this customer hostname.
  return noStoreJson(
    {
      ok: false,
      error: "custom_domains_not_available",
      message: "Custom domains are not available yet. Use your managed MyFenrir Gate instead."
    },
    { status: 503 }
  );

};
