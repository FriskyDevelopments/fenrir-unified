import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppleClientSecret, decodeJwtPayload } from "../src/apple.js";
import { b64urlDecodeToBytes } from "../src/crypto.js";

const enc = new TextEncoder();

function derToPem(der, label) {
  const b64 = Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

test("createAppleClientSecret produces a verifiable ES256 JWT", async () => {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const pem = derToPem(new Uint8Array(pkcs8), "PRIVATE KEY");

  const env = {
    APPLE_TEAM_ID: "TEAM123456",
    APPLE_KEY_ID: "KEY1234567",
    APPLE_CLIENT_ID: "com.myfenrir.signin",
    APPLE_PRIVATE_KEY: pem,
  };

  const jwt = await createAppleClientSecret(env, 300);
  const [h, p, s] = jwt.split(".");
  assert.ok(h && p && s, "jwt has three parts");

  const header = JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(h)));
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "KEY1234567");

  const payload = JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(p)));
  assert.equal(payload.iss, "TEAM123456");
  assert.equal(payload.sub, "com.myfenrir.signin");
  assert.equal(payload.aud, "https://appleid.apple.com");
  assert.ok(payload.exp > payload.iat);

  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    kp.publicKey,
    b64urlDecodeToBytes(s),
    enc.encode(`${h}.${p}`)
  );
  assert.equal(ok, true);
});

test("decodeJwtPayload extracts claims", () => {
  const payload = Buffer.from(JSON.stringify({ sub: "x", email: "a@b.com" }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const claims = decodeJwtPayload(`aaa.${payload}.bbb`);
  assert.equal(claims.sub, "x");
  assert.equal(claims.email, "a@b.com");
});

test("createAppleClientSecret rejects missing secret material", async () => {
  await assert.rejects(
    createAppleClientSecret({ APPLE_CLIENT_ID: "com.myfenrir.signin" }),
    /Apple secret material missing/,
  );
});

test("decodeJwtPayload returns null for malformed tokens", () => {
  assert.equal(decodeJwtPayload(null), null);
  assert.equal(decodeJwtPayload("not-a-jwt"), null);
  assert.equal(decodeJwtPayload("header.%%%.signature"), null);
  assert.equal(decodeJwtPayload("header.bm90LWpzb24.signature"), null);
});
