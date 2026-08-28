import { isDirectOAuthAvailable, type OAuthEnv, type OAuthProvider } from "../../_lib/oauth";
import { friskyAuthEnabled } from "../../_lib/frisky-auth";
import { noStoreJson } from "../../_lib/responses";
import { appleConfigured, enabledSocialProviders } from "@frisky/auth";

const CLIENT_AUTH_PROVIDERS = ["apple", "google", "microsoft"] as const satisfies readonly OAuthProvider[];

export async function onRequestGet(context: { env: OAuthEnv & { FRISKY_AUTH_ENABLED?: string } }) {
  const betterAuthOn = friskyAuthEnabled(context.env);
  const providers = betterAuthOn
    ? enabledSocialProviders(context.env)
    : CLIENT_AUTH_PROVIDERS.filter((provider) => isDirectOAuthAvailable(provider, context.env));

  return noStoreJson(
    {
      ok: true,
      engine: betterAuthOn ? "better-auth" : "legacy-direct-oauth",
      identity: betterAuthOn ? "better-auth+neon-app_auth" : "legacy-direct-oauth",
      authentik: "retired",
      appleLive: appleConfigured(context.env),
      providers,
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
