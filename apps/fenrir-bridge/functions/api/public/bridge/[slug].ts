import { type BillingEnv } from "../../../_lib/billing-env";
import { noStoreJson } from "../../../_lib/responses";

export const onRequestGet: PagesFunction<BillingEnv> = async () => {
  // Retire direct invitation retrieval. Public admission is only through a
  // Community Gate, its verified destination, and the signed bot handoff.
  return noStoreJson(
    {
      ok: false,
      error: "legacy_bridge_retired",
      message: "This legacy link has been retired. Use the community's managed MyFenrir Gate."
    },
    { status: 410 }
  );
};
