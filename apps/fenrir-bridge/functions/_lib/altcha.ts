import type { BillingEnv } from "./billing-env";

const encoder = new TextEncoder();
const algorithm = "SHA-256" as const;
const maxNumber = 120_000;
const lifetimeSeconds = 5 * 60;

export type AltchaChallenge = {
  algorithm: typeof algorithm;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
};

type AltchaPayload = AltchaChallenge & { number: number };

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sha256(value: string) {
  return toHex(await crypto.subtle.digest(algorithm, encoder.encode(value)));
}

async function signingKey(env: BillingEnv) {
  const baseSecret = env.ALTCHA_HMAC_SECRET?.trim() || env.SESSION_SECRET?.trim();
  if (!baseSecret) throw new Error("missing_env:ALTCHA_HMAC_SECRET_or_SESSION_SECRET");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`myfenrir-altcha-v1:${baseSecret}`),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  );
}

async function signChallenge(challenge: string, env: BillingEnv) {
  return toHex(await crypto.subtle.sign("HMAC", await signingKey(env), encoder.encode(challenge)));
}

export async function createAltchaChallenge(env: BillingEnv, now = Date.now()): Promise<AltchaChallenge> {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const number = random[0]! % (maxNumber + 1);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const expires = Math.floor(now / 1000) + lifetimeSeconds;
  const salt = `${nonce}?expires=${expires}&`;
  const challenge = await sha256(`${salt}${number}`);

  return {
    algorithm,
    challenge,
    maxnumber: maxNumber,
    salt,
    signature: await signChallenge(challenge, env)
  };
}

function decodePayload(payload: string): AltchaPayload | null {
  try {
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const parsed = JSON.parse(decoded) as Partial<AltchaPayload>;
    if (
      parsed.algorithm !== algorithm ||
      typeof parsed.challenge !== "string" ||
      typeof parsed.maxnumber !== "number" ||
      typeof parsed.number !== "number" ||
      typeof parsed.salt !== "string" ||
      typeof parsed.signature !== "string"
    ) return null;
    return parsed as AltchaPayload;
  } catch {
    return null;
  }
}

export async function verifyAltchaPayload(payload: string, env: BillingEnv, now = Date.now()) {
  const parsed = decodePayload(payload);
  if (!parsed || parsed.maxnumber !== maxNumber || !Number.isInteger(parsed.number)) return false;
  if (parsed.number < 0 || parsed.number > maxNumber) return false;

  const expires = Number(new URLSearchParams(parsed.salt.split("?", 2)[1] || "").get("expires"));
  if (!Number.isFinite(expires) || expires * 1000 < now) return false;
  if (expires * 1000 > now + (lifetimeSeconds + 30) * 1000) return false;

  const expectedChallenge = await sha256(`${parsed.salt}${parsed.number}`);
  if (!timingSafeEqual(parsed.challenge, expectedChallenge)) return false;

  const expectedSignature = await signChallenge(parsed.challenge, env);
  return timingSafeEqual(parsed.signature, expectedSignature);
}
