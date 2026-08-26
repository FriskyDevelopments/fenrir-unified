import {
  betterAuthEnabled,
  configuredBetterAuthProviders,
  type FriskyBetterAuthEnv,
} from "../../_lib/better-auth";
import { isDirectOAuthAvailable, type OAuthProvider } from "../../_lib/oauth";
import { noStoreJson } from "../../_lib/responses";

export async function onRequestGet(context: { env: FriskyBetterAuthEnv }) {
  const legacyProviders = ["apple", "google", "microsoft"] as const satisfies readonly OAuthProvider[];
  const enabled = betterAuthEnabled(context.env);
  return noStoreJson(
    {
      ok: true,
      ...(enabled ? { engine: "better-auth" } : {}),
      providers: enabled
        ? configuredBetterAuthProviders(context.env)
        : legacyProviders.filter((provider) => isDirectOAuthAvailable(provider, context.env)),
    },
    {
      headers: {
        // Public capability metadata only: white-label community hosts need
        // the same truthful provider list without receiving any credential.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
