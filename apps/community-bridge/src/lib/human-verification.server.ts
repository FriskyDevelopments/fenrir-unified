import { getCookie, setCookie } from "@tanstack/react-start/server";
import { CANONICAL_VERIFICATION_ORIGIN } from "@/lib/human-verification";

const TRANSACTION_COOKIE = "cb_human_transaction";
const VERIFIED_COOKIE = "cb_human_verified";
const MAX_AGE = 5 * 60;
const encoder = new TextEncoder();

interface VerificationTransaction {
  context: string;
  slug?: string;
  brand_id?: string;
  exp: number;
}

function sessionSecret(): string {
  const value = process.env["SESSION_SECRET"]?.trim();
  if (!value) throw new Error("human_verification_not_configured: set SESSION_SECRET");
  return value;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToText(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

async function signature(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`community-human-v1:${sessionSecret()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function encodeTransaction(transaction: VerificationTransaction): Promise<string> {
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(transaction)));
  return `${body}.${await signature(body)}`;
}

async function decodeTransaction(value?: string): Promise<VerificationTransaction | null> {
  try {
    if (!value) return null;
    const [body, supplied] = value.split(".");
    if (!body || !supplied || !equal(supplied, await signature(body))) return null;
    const parsed = JSON.parse(base64UrlToText(body)) as VerificationTransaction;
    return parsed.exp > Date.now() && /^[A-Za-z0-9_-]{32,128}$/.test(parsed.context) ? parsed : null;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}

export async function beginHumanTransaction(input: { slug?: string; brandId?: string }) {
  const transaction: VerificationTransaction = {
    context: crypto.randomUUID().replace(/-/g, ""),
    slug: input.slug,
    brand_id: input.brandId,
    exp: Date.now() + MAX_AGE * 1000,
  };
  setCookie(TRANSACTION_COOKIE, await encodeTransaction(transaction), cookieOptions(MAX_AGE));
  setCookie(VERIFIED_COOKIE, "", cookieOptions(0));
  return transaction.context;
}

export async function completeHumanTransaction(input: { grant: string; context: string }) {
  const transaction = await decodeTransaction(getCookie(TRANSACTION_COOKIE));
  if (!transaction || transaction.context !== input.context) throw new Error("human_verification_state_mismatch");

  const response = await fetch(`${CANONICAL_VERIFICATION_ORIGIN}/api/grant/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant: input.grant,
      audience: "https://quality.communities.myfenrir.com",
      context: transaction.context,
    }),
  });
  const result = await response.json() as { verified?: boolean };
  if (!response.ok || result.verified !== true) throw new Error("human_verification_rejected");

  setCookie(VERIFIED_COOKIE, await encodeTransaction(transaction), cookieOptions(MAX_AGE));
  return { verified: true as const };
}

export async function consumeHumanVerification(expected: { slug?: string; brandId?: string }) {
  const verified = await decodeTransaction(getCookie(VERIFIED_COOKIE));
  const valid = Boolean(
    verified
      && (!expected.slug || verified.slug === expected.slug)
      && (!expected.brandId || verified.brand_id === expected.brandId),
  );
  if (!valid) throw new Error("human_verification_required");
  // Keep the short-lived proof available for the remainder of its five-minute
  // lifetime. A double click, a slow IdP redirect, or a retry after an IdP
  // error must not strand a verified person at a generic login error. The
  // proof remains scoped to this Gate/brand and expires normally.
}
