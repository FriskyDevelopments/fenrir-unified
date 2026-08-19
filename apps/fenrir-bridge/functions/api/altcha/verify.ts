import { verifyAltchaPayload } from "../../_lib/altcha";
import type { BillingEnv } from "../../_lib/billing-env";
import { noStoreJson } from "../../_lib/responses";

type PagesContext = { request: Request; env: BillingEnv };

export async function onRequestPost(context: PagesContext) {
  let payload = "";
  try {
    const body = await context.request.json() as { payload?: unknown };
    payload = typeof body.payload === "string" ? body.payload : "";
  } catch {
    return noStoreJson({ verified: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const verified = payload ? await verifyAltchaPayload(payload, context.env) : false;
    return noStoreJson({ verified }, { status: verified ? 200 : 400 });
  } catch (error) {
    console.error("ALTCHA verification failed", error);
    return noStoreJson({ verified: false, error: "altcha_unavailable" }, { status: 503 });
  }
}
