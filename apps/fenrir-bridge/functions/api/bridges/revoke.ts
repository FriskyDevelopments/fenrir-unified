import { readSession } from "../../_lib/auth";
import { type BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  return noStoreJson(
    {
      ok: false,
      error: "legacy_bridge_retired",
      message: "Fenrir manages Telegram access through the verified Community Gate flow."
    },
    { status: 410 }
  );
};
