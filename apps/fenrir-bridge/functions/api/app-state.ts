import { readSession } from "../_lib/auth";
import { dbNotConfiguredResponse } from "../_lib/billing-env";
import { loadAppState } from "../_lib/product-db";
import { noStoreJson } from "../_lib/responses";

export async function onRequestGet(context: any) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!context.env.DB) return dbNotConfiguredResponse();
  const state = await loadAppState(context.env.DB, session);
  return noStoreJson({ ok: true, data: state });
}
