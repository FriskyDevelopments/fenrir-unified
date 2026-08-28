// Apple Sign in with Apple client_secret is a short-lived ES256 JWT signed
// with the .p8 private key. Built per request; the key never leaves the Worker.
import { b64urlEncode, b64urlDecodeToBytes } from "./crypto.js";

const enc = new TextEncoder();

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

// Decodes claims only; it does not verify the JWT signature. Callers must use a
// trusted token source, such as Apple's token endpoint.
export function decodeJwtPayload(jwt) {
  try {
    if (typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(parts[1])));
  } catch {
    return null;
  }
}
