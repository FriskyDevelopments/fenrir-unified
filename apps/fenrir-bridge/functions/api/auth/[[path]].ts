import {
  betterAuthEnabled,
  handleBetterAuth,
  type FriskyBetterAuthEnv,
} from "../../_lib/better-auth";
import { noStoreJson } from "../../_lib/responses";

export const onRequest: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  if (!betterAuthEnabled(context.env)) {
    return noStoreJson({ ok: false, error: "not_found" }, { status: 404 });
  }
  return handleBetterAuth(context.request, context.env);
};
