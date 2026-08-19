import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Discord Interactions Endpoint (Community Bridge Quality).
 *
 * Discord will not save an Interactions Endpoint URL unless this route:
 *   1. verifies the Ed25519 signature of every request against the app's
 *      PUBLIC key (headers `X-Signature-Ed25519` + `X-Signature-Timestamp`
 *      over `timestamp + rawBody`), and
 *   2. answers a PING (type 1) with a PONG (type 1).
 *
 * The public key is NOT a secret — it only verifies inbound signatures. It is
 * read from `DISCORD_PUBLIC_KEY` when present, else falls back to the Fenrir
 * Community Bridge application's published key so the handshake works out of
 * the box on Quality. The Bot Token and Client Secret are NEVER used here.
 */

const FALLBACK_PUBLIC_KEY =
  "e52709d77ef99c87d2b439d3bb9fe8c0a5d21071f88dd8f62d51e9e7df2b740f";

function publicKeyHex(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env?.["DISCORD_PUBLIC_KEY"]?.trim() : undefined;
  return fromEnv && fromEnv.length >= 64 ? fromEnv : FALLBACK_PUBLIC_KEY;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Ed25519 verify via WebCrypto (Cloudflare Workers native). */
async function verifySignature(
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): Promise<boolean> {
  const keyBytes = hexToBytes(publicKeyHex());
  const sigBytes = hexToBytes(signatureHex);
  if (keyBytes.length !== 32 || sigBytes.length !== 64) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes as unknown as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, sigBytes as unknown as ArrayBuffer, message);
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handleInteraction(request: Request): Promise<Response> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const rawBody = await request.text();

  // Reject anything we cannot cryptographically attribute to Discord. Discord
  // itself sends a deliberately bad signature during setup to confirm this.
  if (!signature || !timestamp || !(await verifySignature(signature, timestamp, rawBody))) {
    return json({ error: "invalid request signature" }, 401);
  }

  let payload: { type?: number; data?: { name?: string } } | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // PING → PONG (the handshake Discord requires before saving the URL).
  if (payload?.type === 1) {
    return json({ type: 1 });
  }

  // APPLICATION_COMMAND → minimal channel-message ack so slash commands do not
  // error while the full command surface is still being wired.
  if (payload?.type === 2) {
    return json({
      type: 4,
      data: { content: "Fenrir Community Bridge is connected. Verify through your Gate to get access." },
    });
  }

  // Unknown interaction types: acknowledge without side effects.
  return json({ type: 1 });
}

export const Route = createFileRoute("/discord/interactions")({
  server: {
    handlers: {
      POST: async ({ request }) => handleInteraction(request),
    },
  },
});
