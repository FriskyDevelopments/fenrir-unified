import { isDirectOAuthAvailable, type OAuthEnv, type OAuthProvider } from "../../_lib/oauth";
import { noStoreJson } from "../../_lib/responses";

const CLIENT_AUTH_PROVIDERS = ["apple", "google", "microsoft"] as const satisfies readonly OAuthProvider[];

export async function onRequestGet(context: { env: OAuthEnv }) {
  return noStoreJson(
    {
      ok: true,
      providers: CLIENT_AUTH_PROVIDERS.filter((provider) =>
        isDirectOAuthAvailable(provider, context.env),
      ),
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
