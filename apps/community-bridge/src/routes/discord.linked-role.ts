import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Discord Linked Roles — verification URL (start).
 *
 * Discord sends a member here to prove they satisfy the Gate. We kick off the
 * OAuth2 authorization with the app's PUBLIC client id and the minimal scopes
 * needed to write a role connection. The code→token exchange (which needs the
 * SECRET client secret) happens at `/discord/linked-role/callback`.
 *
 * Public inputs only in this file. No Bot Token, no Client Secret.
 */

const DISCORD_APPLICATION_ID = "1538155959464235078";
const REDIRECT_URI = "https://quality.communities.myfenrir.com/discord/linked-role/callback";
const SCOPES = "identify role_connections.write";
const STATE_COOKIE = "discord_lr_state";

function clientId(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env?.["DISCORD_CLIENT_ID"]?.trim() : undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DISCORD_APPLICATION_ID;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function startLinkedRole(): Response {
  const state = randomState();
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId());
  authorize.searchParams.set("redirect_uri", REDIRECT_URI);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "consent");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/discord; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export const Route = createFileRoute("/discord/linked-role")({
  server: {
    handlers: {
      GET: async () => startLinkedRole(),
    },
  },
});
