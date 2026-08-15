import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const env = { VERIFICATION_SECRET: "test-only-secret-with-sufficient-entropy" };
const origin = "https://friskydev-human-verification.zainxantoine.workers.dev";
const audience = "https://quality.communities.myfenrir.com";
const authentikAudience = "https://authentik.friskydev.com";
const loreAudiences = [
  "https://lore.myfenrir.com",
  "https://codex-lore-mvp.lore-the-pack.pages.dev",
];
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

test("accepts the browser's multipart ALTCHA submission", async () => {
  const loreAudience = loreAudiences[1];
  const query = new URLSearchParams({ audience: loreAudience, context });
  const challengeResponse = await worker.fetch(
    new Request(`${origin}/api/altcha/challenge?${query}`),
    env,
  );
  assert.equal(challengeResponse.status, 200);
  const challenge = await challengeResponse.json();

  let number = -1;
  for (let candidate = 0; candidate <= challenge.maxnumber; candidate += 1) {
    const digest = createHash("sha256").update(`${challenge.salt}${candidate}`).digest("hex");
    if (digest === challenge.challenge) {
      number = candidate;
      break;
    }
  }
  assert.notEqual(number, -1, "expected to solve the issued proof-of-work");

  const { maxnumber: _omittedByOfficialWidget, ...widgetChallenge } = challenge;
  const payload = Buffer.from(JSON.stringify({ ...widgetChallenge, number, took: 1 })).toString("base64url");
  const form = new FormData();
  form.set("altcha", payload);
  form.set("fallbackGrant", "");
  const verifyResponse = await worker.fetch(new Request(`${origin}/api/verify`, {
    method: "POST",
    body: form,
  }), env);
  const proof = await verifyResponse.json();
  assert.equal(verifyResponse.status, 200);
  assert.equal(proof.verified, true);
  assert.equal(proof.method, "altcha");
  assert.ok(proof.grant);
});

test("accepts Authentik only as a consuming audience", async () => {
  const query = new URLSearchParams({ audience: authentikAudience, context });
  const response = await worker.fetch(new Request(`${origin}/api/slider?${query}`), env);
  assert.equal(response.status, 200);
  const challenge = await response.json();
  assert.equal(challenge.risk, "medium");
  assert.equal(decodeBody(challenge.token).audience, authentikAudience);
});

test("accepts LORE production and isolated preview as consuming audiences", async () => {
  for (const loreAudience of loreAudiences) {
    const query = new URLSearchParams({ audience: loreAudience, context });
    const response = await worker.fetch(new Request(`${origin}/api/puzzle?${query}`), env);
    assert.equal(response.status, 200);
    const challenge = await response.json();
    assert.equal(decodeBody(challenge.token).audience, loreAudience);
  }
});

test("ships an audience-specific LORE presentation without making Authentik canonical", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(app, /LORE · SIGNAL CHECK/);
  assert.match(app, /Prove the signal is yours/);
  assert.doesNotMatch(app, /loreAudiences[\s\S]*authentik\.friskydev\.com/);
  assert.match(page, /id="show-altcha"/);
  assert.match(page, /ALTCHA · PRIVATE PROOF/);
  assert.doesNotMatch(app, /signalFallbackTimer/);
});
