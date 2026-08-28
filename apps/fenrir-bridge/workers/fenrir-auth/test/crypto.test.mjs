import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signValue,
  verifySignedValue,
  createPkce,
  sha256b64url,
  timingSafeEqual,
  b64urlEncode,
  b64urlDecodeToString,
  validPkceValue,
  validPkceChallenge,
  verifyPkceS256,
} from "../src/crypto.js";

const SECRET = "unit-test-secret-value";

test("signValue / verifySignedValue round-trips", async () => {
  const signed = await signValue(SECRET, "session-abc123");
  assert.match(signed, /^session-abc123\.[A-Za-z0-9_-]+$/);
  assert.equal(await verifySignedValue(SECRET, signed), "session-abc123");
});

test("tampered value fails verification", async () => {
  const signed = await signValue(SECRET, "session-abc123");
  const tampered = signed.replace("abc123", "abc124");
  assert.equal(await verifySignedValue(SECRET, tampered), null);
});

test("wrong secret fails verification", async () => {
  const signed = await signValue(SECRET, "session-abc123");
  assert.equal(await verifySignedValue("other-secret", signed), null);
});

test("PKCE challenge is S256 of verifier", async () => {
  const { verifier, challenge } = await createPkce();
  assert.equal(challenge, await sha256b64url(verifier));
});

test("PKCE rejects an intercepted code without its verifier", async () => {
  const { verifier, challenge } = await createPkce();
  assert.equal(validPkceValue(verifier), true);
  assert.equal(validPkceChallenge(challenge), true);
  assert.equal(await verifyPkceS256(verifier, challenge), true);
  const replacement = verifier.endsWith("A") ? "B" : "A";
  assert.equal(await verifyPkceS256(`${verifier.slice(0, -1)}${replacement}`, challenge), false);
  assert.equal(await verifyPkceS256("short", challenge), false);
});

test("base64url round-trip", () => {
  const s = "héllo+/=world";
  assert.equal(b64urlDecodeToString(b64urlEncode(s)), s);
});

test("timingSafeEqual basic behavior", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
});
