import type { BillingEnv } from "./billing-env";

type VerificationMode = "slider" | "puzzle";
type Risk = "low" | "medium" | "high";

type VerificationToken = {
  mode: VerificationMode;
  exp: number;
  target?: number;
  sequence?: string[];
  risk?: Risk;
  tolerance?: number;
};

const encoder = new TextEncoder();
const tokenLifetimeSeconds = 5 * 60;
const runes = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ"];

export function riskLevel(request: Request): Risk {
  const score = (request as Request & { cf?: { botManagement?: { score?: number } } }).cf?.botManagement?.score;
  if (typeof score === "number" && score < 20) return "high";
  if (typeof score === "number" && score < 50) return "medium";
  return request.headers.get("user-agent") ? "low" : "medium";
}

function base64Url(value: string) {
  const binary = String.fromCharCode(...encoder.encode(value));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function signingKey(env: BillingEnv) {
  const secret = env.HUMAN_VERIFICATION_HMAC_SECRET?.trim() || env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("missing_env:HUMAN_VERIFICATION_HMAC_SECRET_or_SESSION_SECRET");
  return crypto.subtle.importKey("raw", encoder.encode(`myfenrir-verification-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(value: string, env: BillingEnv) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(env), encoder.encode(value));
  return base64Url(String.fromCharCode(...new Uint8Array(signature)));
}

async function createToken(payload: VerificationToken, env: BillingEnv) {
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded, env)}`;
}

async function readToken(token: unknown, mode: VerificationMode, env: BillingEnv): Promise<VerificationToken | null> {
  if (typeof token !== "string") return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !constantTimeEqual(signature, await sign(encoded, env))) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as VerificationToken;
    return payload.mode === mode && Number.isFinite(payload.exp) && payload.exp >= Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

export async function createFallbackChallenge(mode: VerificationMode, env: BillingEnv, risk: Risk) {
  const exp = Math.floor(Date.now() / 1000) + tokenLifetimeSeconds;
  if (mode === "slider") {
    const target = 28 + Math.floor(Math.random() * 45);
    const tolerance = risk === "high" ? 2 : risk === "medium" ? 4 : 7;
    return { token: await createToken({ mode, exp, target, risk, tolerance }, env), target, risk };
  }
  const length = risk === "high" ? 3 : risk === "medium" ? 2 : 1;
  const sequence = Array.from({ length }, () => runes[Math.floor(Math.random() * runes.length)]!);
  return { token: await createToken({ mode, exp, sequence, risk }, env), sequence, choices: runes, risk };
}

export async function verifyFallbackChallenge(input: { mode: VerificationMode; token?: unknown; value?: unknown; answer?: unknown }, env: BillingEnv) {
  const payload = await readToken(input.token, input.mode, env);
  if (!payload) return false;
  if (input.mode === "slider") return typeof input.value === "number" && Number.isInteger(input.value) && typeof payload.target === "number" && Math.abs(input.value - payload.target) <= (payload.tolerance ?? 4);
  return Array.isArray(input.answer) && Array.isArray(payload.sequence) && input.answer.length === payload.sequence.length && input.answer.every((value, index) => value === payload.sequence![index]);
}

export async function createVerificationGrant(env: BillingEnv) {
  return createToken({ mode: "slider", exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds }, env);
}
