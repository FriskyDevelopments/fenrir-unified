// Low-level crypto helpers. Pure Web Crypto — Workers runtime and Node >=20.

const enc = new TextEncoder();

/**
 * Encodes text or bytes as an unpadded Base64URL string.
 * @param {string|ArrayBuffer|ArrayLike<number>} bytes - The text or byte sequence to encode.
 * @return {string} The unpadded Base64URL representation.
 */
export function b64urlEncode(bytes) {
  if (typeof bytes === "string") bytes = enc.encode(bytes);
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode Base64URL text into bytes.
 * @param {string} str - The Base64URL-encoded text.
 * @return {Uint8Array} The decoded bytes.
 */
export function b64urlDecodeToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Decode Base64URL text as a UTF-8 string.
 * @param {string} str - The Base64URL-encoded text.
 * @return {string} The decoded UTF-8 string.
 */
export function b64urlDecodeToString(str) {
  return new TextDecoder().decode(b64urlDecodeToBytes(str));
}

/**
 * Generates a cryptographically random token.
 * @param {number} nBytes - The number of random bytes to generate.
 * @returns {string} An unpadded Base64URL-encoded token.
 */
export function randomToken(nBytes = 32) {
  const buf = new Uint8Array(nBytes);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

/**
 * Creates a non-exportable HMAC-SHA-256 key from a secret.
 * @param {string} secret - The secret used to create the key.
 * @return {Promise<CryptoKey>} The imported HMAC key.
 */
async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Creates a Base64URL-encoded HMAC-SHA-256 signature for a message.
 * @param {string} secret - The secret used to sign the message.
 * @param {string} message - The message to sign.
 * @returns {string} The Base64URL-encoded HMAC signature.
 */
export async function hmacSign(secret, message) {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncode(new Uint8Array(sig));
}

/**
 * Compares two strings for equality using a constant-time mismatch check.
 * @param {string} a - The first string.
 * @param {string} b - The second string.
 * @returns {boolean} `true` if both strings have the same characters, `false` otherwise.
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Signs a value and appends its HMAC signature.
 * @param {string} secret - The secret used to generate the signature.
 * @param {string} value - The value to sign.
 * @return {Promise<string>} The value followed by its signature, separated by a period.
 */
export async function signValue(secret, value) {
  const sig = await hmacSign(secret, value);
  return `${value}.${sig}`;
}

/**
 * Verifies a signed value and extracts its original content.
 * @param {string} secret - The secret used to create the signature.
 * @param {string} signed - The value and signature separated by a period.
 * @return {Promise<string|null>} The original value when the signature is valid, or `null` otherwise.
 */
export async function verifySignedValue(secret, signed) {
  if (typeof signed !== "string") return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = await hmacSign(secret, value);
  return timingSafeEqual(sig, expected) ? value : null;
}

/**
 * Computes a SHA-256 digest and encodes it as unpadded Base64URL text.
 * @param {string} input - The text to hash.
 * @returns {Promise<string>} The Base64URL-encoded SHA-256 digest.
 */
export async function sha256b64url(input) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return b64urlEncode(new Uint8Array(digest));
}

/**
 * Creates a PKCE verifier and its corresponding S256 challenge.
 * @returns {{verifier: string, challenge: string}} The generated verifier and challenge.
 */
export async function createPkce() {
  const verifier = randomToken(32);
  const challenge = await sha256b64url(verifier);
  return { verifier, challenge };
}

/**
 * Determines whether a value meets the PKCE verifier format requirements.
 * @param {*} value - The value to validate.
 * @return {boolean} `true` if the value is a string containing 43 to 128 permitted PKCE characters, `false` otherwise.
 */
export function validPkceValue(value) {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

/**
 * Determines whether a value is a valid 43-character PKCE challenge.
 * @param {*} value - The value to validate.
 * @returns {boolean} `true` if the value contains only permitted PKCE characters, `false` otherwise.
 */
export function validPkceChallenge(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Verifies that a PKCE verifier produces the expected S256 challenge.
 * @param {string} verifier - The PKCE code verifier.
 * @param {string} challenge - The expected Base64URL-encoded SHA-256 challenge.
 * @return {boolean} `true` if the verifier matches the challenge, `false` otherwise.
 */
export async function verifyPkceS256(verifier, challenge) {
  if (!validPkceValue(verifier) || !validPkceChallenge(challenge)) return false;
  return timingSafeEqual(await sha256b64url(verifier), challenge);
}
