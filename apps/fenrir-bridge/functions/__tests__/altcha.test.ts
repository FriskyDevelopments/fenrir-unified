import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";

import { createAltchaChallenge, verifyAltchaPayload } from "../_lib/altcha.ts";

const env = { SESSION_SECRET: "test-session-secret" };
const now = Date.UTC(2026, 7, 12, 12, 0, 0);

function encodePayload(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

async function solve(challenge: Awaited<ReturnType<typeof createAltchaChallenge>>) {
  for (let number = 0; number <= challenge.maxnumber; number += 1) {
    // The browser widget uses Web Crypto. Node's synchronous hashing keeps this
    // exhaustive test deterministic even when a challenge lands near maxnumber.
    const hex = createHash("sha256").update(`${challenge.salt}${number}`).digest("hex");
    if (hex === challenge.challenge) return encodePayload({ ...challenge, number });
  }
  throw new Error("test challenge was not solvable");
}

test("ALTCHA challenge round-trips through server verification", async () => {
  const challenge = await createAltchaChallenge(env, now);
  const payload = await solve(challenge);
  assert.equal(await verifyAltchaPayload(payload, env, now + 1_000), true);
});

test("ALTCHA rejects tampering, the wrong secret, and expired proofs", async () => {
  const challenge = await createAltchaChallenge(env, now);
  const payload = await solve(challenge);
  const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));

  assert.equal(await verifyAltchaPayload(encodePayload({ ...parsed, number: parsed.number + 1 }), env, now), false);
  assert.equal(await verifyAltchaPayload(payload, { SESSION_SECRET: "different" }, now), false);
  assert.equal(await verifyAltchaPayload(payload, env, now + 6 * 60_000), false);
});
