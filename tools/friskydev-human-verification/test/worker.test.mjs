import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import worker from "../src/worker.js";

const env = { VERIFICATION_SECRET: "test-only-secret-with-sufficient-entropy" };
const origin = "https://friskydev-human-verification.hrgrrtks2p.workers.dev";
const audience = "https://quality.communities.myfenrir.com";
const authentikAudience = "https://authentik.friskydev.com";
const context = "a".repeat(32);

for (const payload of ["{", "null", "[]", '"invalid"', "42"]) {
  test(`rejects malformed verification input ${payload} with a client error`, async () => {
    const response = await worker.fetch(new Request(`${origin}/api/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    }), env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { verified: false, error: "invalid_verification_input" });
  });
}

test("rejects malformed multipart verification input with a client error", async () => {
  const response = await worker.fetch(new Request(`${origin}/api/verify`, {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=missing" },
    body: "malformed multipart",
  }), env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { verified: false, error: "invalid_verification_input" });
});

function decodeBody(token) {
  const [body] = token.split(".");
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}

test("rejects challenges that are not bound to an approved application", async () => {
  const response = await worker.fetch(new Request(`${origin}/api/puzzle`), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_verification_binding");
});

test("issues a grant bound to the Quality origin and per-attempt context", async () => {
  const query = new URLSearchParams({ audience, context });
  const challengeResponse = await worker.fetch(new Request(`${origin}/api/puzzle?${query}`), env);
  assert.equal(challengeResponse.status, 200);
  const challenge = await challengeResponse.json();
  const answer = decodeBody(challenge.token).answer;

  const verifyResponse = await worker.fetch(new Request(`${origin}/api/puzzle/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: challenge.token, answer }),
  }), env);
  assert.equal(verifyResponse.status, 200);
  const proof = await verifyResponse.json();
  assert.equal(proof.verified, true);

  const consume = (candidateContext) => worker.fetch(new Request(`${origin}/api/grant/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant: proof.grant, audience, context: candidateContext }),
  }), env);

  assert.equal((await consume(context)).status, 200);
  assert.equal((await consume("b".repeat(32))).status, 400);
});

test("accepts leftover Authentik hostname as audience for already-issued tokens only", async () => {
  const query = new URLSearchParams({ audience: authentikAudience, context });
  const response = await worker.fetch(new Request(`${origin}/api/slider?${query}`), env);
  assert.equal(response.status, 200);
  const challenge = await response.json();
  assert.equal(challenge.risk, "medium");
  assert.equal(decodeBody(challenge.token).audience, authentikAudience);
});

test("accepts a browser ALTCHA proof-of-work round-trip (multipart + JSON)", async () => {
  const query = new URLSearchParams({ audience, context });
  const challengeResponse = await worker.fetch(
    new Request(`${origin}/api/altcha/challenge?${query}`),
    env,
  );
  assert.equal(challengeResponse.status, 200);
  const challenge = await challengeResponse.json();
  assert.equal(challenge.algorithm, "SHA-256");
  assert.equal(challenge.maxnumber, 120000);
  assert.ok(challenge.salt);
  assert.ok(challenge.signature);

  let number = -1;
  for (let candidate = 0; candidate <= challenge.maxnumber; candidate += 1) {
    const digest = createHash("sha256").update(`${challenge.salt}${candidate}`).digest("hex");
    if (digest === challenge.challenge) {
      number = candidate;
      break;
    }
  }
  assert.notEqual(number, -1, "expected to solve the issued proof-of-work");

  // The official widget returns the challenge without `maxnumber`, plus number/took.
  const { maxnumber: _omittedByOfficialWidget, ...widgetChallenge } = challenge;
  const payload = Buffer.from(JSON.stringify({ ...widgetChallenge, number, took: 1 })).toString("base64url");

  const form = new FormData();
  form.set("altcha", payload);
  form.set("fallbackGrant", "");
  const multipart = await worker.fetch(new Request(`${origin}/api/verify`, {
    method: "POST",
    body: form,
  }), env);
  assert.equal(multipart.status, 200);
  const proof = await multipart.json();
  assert.equal(proof.verified, true);
  assert.equal(proof.method, "altcha");
  assert.ok(proof.grant);

  const jsonResponse = await worker.fetch(new Request(`${origin}/api/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ altcha: payload, fallbackGrant: "" }),
  }), env);
  assert.equal(jsonResponse.status, 200);
  assert.equal((await jsonResponse.json()).verified, true);

  // The issued grant consumes only against its bound audience + context.
  const consume = await worker.fetch(new Request(`${origin}/api/grant/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant: proof.grant, audience, context }),
  }), env);
  assert.equal(consume.status, 200);
});

test("rejects an ALTCHA proof with a tampered number", async () => {
  const query = new URLSearchParams({ audience, context });
  const challengeResponse = await worker.fetch(
    new Request(`${origin}/api/altcha/challenge?${query}`),
    env,
  );
  const challenge = await challengeResponse.json();

  let number = -1;
  for (let candidate = 0; candidate <= challenge.maxnumber; candidate += 1) {
    const digest = createHash("sha256").update(`${challenge.salt}${candidate}`).digest("hex");
    if (digest === challenge.challenge) {
      number = candidate;
      break;
    }
  }
  const payload = Buffer.from(JSON.stringify({ ...challenge, number: number + 1, took: 1 })).toString("base64url");
  const response = await worker.fetch(new Request(`${origin}/api/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ altcha: payload }),
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).verified, false);
});
