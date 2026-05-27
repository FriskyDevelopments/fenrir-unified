import type { BillingEnv } from "./billing-env";

const cookieName = "fenrir_webauthn_challenge";
const maxAgeSec = 300;

function requireSessionSecret(env: BillingEnv): string {
  const s = env.SESSION_SECRET?.trim();
  if (!s) throw new Error("missing_SESSION_SECRET");
  return s;
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let binary = "";
  for (const b of sig) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeUtf8(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function createChallengeCookie(env: BillingEnv, challenge: string, flow: "registration" | "authentication"): Promise<string> {
  const secret = requireSessionSecret(env);
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const encoded = base64UrlEncodeUtf8(JSON.stringify({ c: challenge, exp, flow }));
  const sig = await hmacSign(secret, encoded);
  return `${cookieName}=${encoded}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export async function readChallengePayload(request: Request, env: BillingEnv): Promise<{ challenge: string; flow: string } | null> {
  const secret = requireSessionSecret(env);
  const raw = request.headers.get("Cookie") ?? "";
  const cookie = raw
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!cookie) return null;
  const [encoded, sig] = cookie.split(".");
  if (!encoded || !sig) return null;
  const expectedSig = await hmacSign(secret, encoded);
  if (!timingSafeEqual(sig, expectedSig)) return null;
  let binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { c?: string; exp?: number; flow?: string };
  if (!parsed.c || !parsed.exp || !parsed.flow) return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return { challenge: parsed.c, flow: parsed.flow };
}

export function clearChallengeCookieHeader(): string {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
