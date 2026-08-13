import { createAltchaChallenge } from "../../_lib/altcha";
import type { BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";

type PagesContext = { env: BillingEnv };

export async function onRequestGet(context: PagesContext) {
  try {
    return noStoreJson(await createAltchaChallenge(context.env));
  } catch (error) {
    console.error("ALTCHA challenge generation failed", error);
    return noStoreJson({ error: "altcha_unavailable" }, { status: 503 });
  }
}
