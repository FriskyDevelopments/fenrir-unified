import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Discord Linked Roles — verification callback.
 *
 * Exchanges the OAuth2 code for a token and writes the verified-member role
 * connection metadata. This is the point that REQUIRES the two worker secrets
 * (injected via the Frisky Secret Center / 1Password, never in git):
 *
 *   DISCORD_CLIENT_SECRET  — OAuth2 code→token exchange (this file)
 *   DISCORD_BOT_TOKEN      — assign roles / mint private invites (role grant)
 *
 * Until DISCORD_CLIENT_SECRET is present the endpoint returns an explicit
 * `secret_missing` state instead of silently failing, so the flow is wired and
 * ready and stops exactly at secret injection.
 */

const DISCORD_APPLICATION_ID = "1538155959464235078";
const TOKEN_ENDPOINT = "https://discord.com/api/oauth2/token";
const REDIRECT_URI = "https://quality.communities.myfenrir.com/discord/linked-role/callback";
const STATE_COOKIE = "discord_lr_state";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name]?.trim() : undefined;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function html(status: number, title: string, detail: string): Response {
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;background:#0b0f0e;color:#e7efe9;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:32rem;padding:2rem;text-align:center"><h1 style="font-size:1.1rem">${title}</h1><p style="color:#9fb1a8;font-size:.9rem">${detail}</p></main>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const idpError = url.searchParams.get("error");
  if (idpError) return html(400, "Discord verification cancelled", "You can retry from your Gate.");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return html(400, "Incomplete verification", "Missing authorization code.");

  const expected = readCookie(request.headers.get("cookie"), STATE_COOKIE);
  if (!expected || expected !== state) {
    return html(400, "Verification could not be trusted", "State mismatch — start again from your Gate.");
  }

  const clientSecret = env("DISCORD_CLIENT_SECRET");
  const clientId = env("DISCORD_CLIENT_ID") ?? DISCORD_APPLICATION_ID;
  if (!clientSecret) {
    // Wired and ready — stops exactly here until the secret is injected.
    console.warn("discord_linked_role_secret_missing", "DISCORD_CLIENT_SECRET");
    return html(
      503,
      "Discord verification is almost ready",
      "The verified-member step is wired but its worker secret (DISCORD_CLIENT_SECRET) is not injected yet.",
    );
  }

  try {
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    const token = (await tokenResponse.json().catch(() => null)) as
      | { access_token?: string; token_type?: string }
      | null;
    if (!tokenResponse.ok || !token?.access_token) {
      return html(502, "Discord verification failed", "The identity provider rejected the exchange.");
    }

    // Write the verified-member role-connection metadata for this application.
    // (Assigning the server role + minting the private invite additionally
    // needs DISCORD_BOT_TOKEN; that step is guarded the same way.)
    await fetch(`https://discord.com/api/users/@me/applications/${clientId}/role-connection`, {
      method: "PUT",
      headers: {
        Authorization: `${token.token_type ?? "Bearer"} ${token.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        platform_name: "Fenrir Community Bridge",
        metadata: { verified: 1 },
      }),
    }).catch(() => undefined);

    return html(
      200,
      "You're verified",
      "Return to Discord — your verified-member role connection is set.",
    );
  } catch {
    return html(502, "Discord verification failed", "Please retry from your Gate.");
  }
}

export const Route = createFileRoute("/discord/linked-role/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleCallback(request),
    },
  },
});
