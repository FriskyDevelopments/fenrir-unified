// Apple Sign in with Apple client_secret is a short-lived ES256 JWT signed
// with the .p8 private key. Built per request; the key never leaves the Worker.
import { b64urlEncode, b64urlDecodeToBytes } from "./crypto.js";

const enc = new TextEncoder();

/**
 * Converts a PEM-encoded value to DER-encoded bytes.
 * @param {string} pem - The PEM-encoded value.
 * @return {Uint8Array} The decoded DER bytes.
 */
function pemToDer(pem) {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

/**
 * Imports a PEM-encoded PKCS#8 Apple private key for ECDSA signing.
 * @param {string} pem - The PEM-encoded private key.
 * @returns {Promise<CryptoKey>} The non-extractable P-256 signing key.
 */
async function importApplePrivateKey(pem) {
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

/**
 * Creates a signed ES256 client-secret JWT for Apple authentication.
 * @param {Object} env - Environment values containing the Apple team, key, client, and private-key credentials.
 * @param {number} [ttlSeconds=300] - Token lifetime in seconds.
 * @return {Promise<string>} The compact signed JWT.
 * @throws {Error} If required Apple credential values are missing.
 */
export async function createAppleClientSecret(env, ttlSeconds = 300) {
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  const clientId = env.APPLE_CLIENT_ID;
  const privateKeyPem = env.APPLE_PRIVATE_KEY;
  if (!teamId || !keyId || !clientId || !privateKeyPem) {
    throw new Error("Apple secret material missing (APPLE_TEAM_ID/KEY_ID/CLIENT_ID/PRIVATE_KEY)");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + ttlSeconds,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(
    JSON.stringify(payload)
  )}`;
  const key = await importApplePrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput)
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * Decodes the payload from a JSON Web Token.
 * @param {string} jwt - The compact JSON Web Token to decode.
 * @return {Object|null} The decoded payload, or `null` when the token payload is missing or invalid.
 */
export function decodeJwtPayload(jwt) {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(parts[1])));
  } catch {
    return null;
  }
}
