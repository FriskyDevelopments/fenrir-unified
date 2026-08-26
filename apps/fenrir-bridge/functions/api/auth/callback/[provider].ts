import {
  betterAuthEnabled,
  handleBetterAuth,
  type FriskyBetterAuthEnv,
} from "../../../_lib/better-auth";
import { handleLegacyAuthCallback } from "../../../_lib/legacy-auth-callback";
import type { OAuthEnv } from "../../../_lib/oauth";

const handleCallback: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  if (!betterAuthEnabled(context.env)) {
    return handleLegacyAuthCallback(
      context as EventContext<OAuthEnv, "provider", unknown>,
    );
  }
  return handleBetterAuth(context.request, context.env);
};

export const onRequestGet = handleCallback;
export const onRequestPost = handleCallback;
