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
      message: "Telegram group verification is performed by Fenrir Bot in Community Bridge."
    },
    { status: 410 }
  );
};
