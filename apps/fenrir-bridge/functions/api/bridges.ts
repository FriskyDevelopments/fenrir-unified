import { readSession } from "../_lib/auth";
import { type BillingEnv } from "../_lib/billing-env";
import { noStoreJson } from "../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  // This legacy surface accepted browser-supplied chat IDs and persisted a
  // synthetic invite URL. Community Gates are now created only through the
  // bot-verified selector in communities.myfenrir.com.
  return noStoreJson(
    {
      ok: false,
      error: "legacy_bridge_retired",
      message: "Create a managed Community Gate and select a Telegram group verified by Fenrir Bot."
    },
    { status: 410 }
  );
};
