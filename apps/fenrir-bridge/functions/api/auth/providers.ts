import { isDirectOAuthAvailable, type OAuthEnv, type OAuthProvider } from "../../_lib/oauth";
import { friskyAuthEnabled } from "../../_lib/frisky-auth";
import { noStoreJson } from "../../_lib/responses";
import { appleConfigured, enabledSocialProviders } from "@frisky/auth";

// Legacy app login supports Google and Microsoft. Apple uses Better Auth;
// the community OAuth flow has its own provider list. Authentik is retired.
const CLIENT_AUTH_PROVIDERS = [
  "google",
  "microsoft",
] as const satisfies readonly OAuthProvider[];

/**
 * Reports the authentication capabilities available for the current environment.
 *
 * @returns Authentication engine, identity mode, Authentik status, Apple OAuth availability, and supported providers.
 */
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
      appleLive: betterAuthOn && appleConfigured(context.env),
      providers,
    },
    {
      headers: {
        // Public capability metadata only: white-label community hosts need
        // the same truthful provider list without receiving any credential.
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
