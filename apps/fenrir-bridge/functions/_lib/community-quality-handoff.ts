import type { CommunityAuthEnv, CommunitySessionPayload } from "./community-auth";

const HANDOFF_TTL_SECONDS = 90;
const QUALITY_ORIGIN = "https://quality.communities.myfenrir.com";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signature(body: string, env: CommunityAuthEnv): Promise<string> {
  const value = env.FENRIR_COMMUNITY_AUTH_SECRET?.trim();
  if (!value) throw new Error("missing_env:FENRIR_COMMUNITY_AUTH_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`community-quality-handoff-v1:${value}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}

export function safeQualityDestination(raw: string | null | undefined): string {
  try {
    const url = new URL(raw || "/", QUALITY_ORIGIN);
    if (url.origin !== QUALITY_ORIGIN) return `${QUALITY_ORIGIN}/`;
    if (!url.pathname.startsWith("/g/") && url.pathname !== "/dashboard") return `${QUALITY_ORIGIN}/`;
    return url.toString();
  } catch {
    return `${QUALITY_ORIGIN}/`;
  }
}

export async function signCommunityQualityHandoff(session: CommunitySessionPayload, destination: string, env: CommunityAuthEnv): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    user_id: session.user_id,
    email: session.email,
    community_slug: session.community_slug ?? null,
    community_org_id: session.community_org_id ?? null,
    destination: safeQualityDestination(destination),
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + HANDOFF_TTL_SECONDS,
  })));
  return `${body}.${await signature(body, env)}`;
}

export const COMMUNITY_QUALITY_ORIGIN = QUALITY_ORIGIN;
