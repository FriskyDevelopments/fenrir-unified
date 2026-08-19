import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const env = { VERIFICATION_SECRET: "test-only-secret-with-sufficient-entropy" };
const origin = "https://friskydev-human-verification.zainxantoine.workers.dev";
const audience = "https://quality.communities.myfenrir.com";
const authentikAudience = "https://authentik.friskydev.com";
const context = "a".repeat(32);

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

test("accepts the canonical FriskyDEV Authentik gateway as an audience", async () => {
  const query = new URLSearchParams({ audience: authentikAudience, context });
  const response = await worker.fetch(new Request(`${origin}/api/slider?${query}`), env);
  assert.equal(response.status, 200);
  const challenge = await response.json();
  assert.equal(challenge.risk, "medium");
  assert.equal(decodeBody(challenge.token).audience, authentikAudience);
});
