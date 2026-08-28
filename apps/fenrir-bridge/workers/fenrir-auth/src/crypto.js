// Low-level crypto helpers. Pure Web Crypto — Workers runtime and Node >=20.

const enc = new TextEncoder();

export function b64urlEncode(bytes) {
  if (typeof bytes === "string") bytes = enc.encode(bytes);
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecodeToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlDecodeToString(str) {
  return new TextDecoder().decode(b64urlDecodeToBytes(str));
}

export function randomToken(nBytes = 32) {
  const buf = new Uint8Array(nBytes);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function hmacSign(secret, message) {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncode(new Uint8Array(sig));
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function signValue(secret, value) {
  const sig = await hmacSign(secret, value);
  return `${value}.${sig}`;
}

export async function verifySignedValue(secret, signed) {
  if (typeof signed !== "string") return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = await hmacSign(secret, value);
  return timingSafeEqual(sig, expected) ? value : null;
}

export async function sha256b64url(input) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return b64urlEncode(new Uint8Array(digest));
}

export async function createPkce() {
  const verifier = randomToken(32);
  const challenge = await sha256b64url(verifier);
  return { verifier, challenge };
}

export function validPkceValue(value) {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export function validPkceChallenge(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export async function verifyPkceS256(verifier, challenge) {
  if (!validPkceValue(verifier) || !validPkceChallenge(challenge)) return false;
  return timingSafeEqual(await sha256b64url(verifier), challenge);
}
