import { neonSql } from "./neon.server.ts";

const QUALITY_ORIGIN = "https://quality.communities.myfenrir.com";
const MAX_CLOCK_SKEW_SECONDS = 15;

export type NeonCommunityHandoff = {
  user_id: string;
  email: string;
  community_slug: string | null;
  community_org_id: string | null;
  destination: string;
  nonce: string;
  exp: number;
};

function secret(): string {
  const value = process.env["FENRIR_COMMUNITY_AUTH_SECRET"]?.trim();
  if (!value) throw new Error("neon_handoff_not_configured");
  return value;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`community-quality-handoff-v1:${secret()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

function safeDestination(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.origin !== QUALITY_ORIGIN) return null;
    if (!url.pathname.startsWith("/g/") && url.pathname !== "/dashboard") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function verifyNeonCommunityHandoff(
  token: string,
  options: { consume?: (tokenHash: string, exp: number) => Promise<boolean> } = {},
): Promise<NeonCommunityHandoff> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) throw new Error("neon_handoff_invalid");
  const body = token.slice(0, dot);
  const supplied = token.slice(dot + 1);
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    base64UrlToBytes(supplied),
    new TextEncoder().encode(body),
  ).catch(() => false);
  if (!valid) throw new Error("neon_handoff_invalid");

  let payload: NeonCommunityHandoff;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as NeonCommunityHandoff;
  } catch {
    throw new Error("neon_handoff_invalid");
  }
  if (!payload.user_id || !payload.email || !payload.nonce || typeof payload.exp !== "number"
    || payload.exp + MAX_CLOCK_SKEW_SECONDS < Math.floor(Date.now() / 1000)
    || !safeDestination(payload.destination)) throw new Error("neon_handoff_invalid");

  const tokenHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const consume = options.consume ?? consumeHandoff;
  if (!await consume(tokenHash, payload.exp)) throw new Error("neon_handoff_replayed");
  return { ...payload, destination: safeDestination(payload.destination)! };
}

async function consumeHandoff(tokenHash: string, exp: number): Promise<boolean> {
  const sql = neonSql();
  await sql`create table if not exists cb_auth_handoffs (
    token_hash text primary key,
    expires_at timestamptz not null,
    consumed_at timestamptz not null default now()
  )`;
  await sql`delete from cb_auth_handoffs where expires_at < now() - interval '1 day'`;
  const inserted = await sql`
    insert into cb_auth_handoffs (token_hash, expires_at)
    values (${tokenHash}, to_timestamp(${exp}))
    on conflict (token_hash) do nothing
    returning token_hash
  `;
  return Boolean(inserted[0]);
}

export function qualityDestinationPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/dashboard";
  if (!raw.startsWith("/g/") && raw !== "/dashboard") return "/dashboard";
  return raw;
}

export const NEON_COMMUNITY_ORIGIN = "https://myfenrir.com";
export const QUALITY_COMMUNITY_ORIGIN = QUALITY_ORIGIN;
