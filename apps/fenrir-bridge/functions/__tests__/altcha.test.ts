import assert from "node:assert/strict";
import { test } from "vitest";

import { createAltchaChallenge, verifyAltchaPayload } from "../_lib/altcha.ts";

const env = { SESSION_SECRET: "test-session-secret" };
const now = Date.UTC(2026, 7, 12, 12, 0, 0);

function encodePayload(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

test("ALTCHA challenge round-trips through server verification", async () => {
  const number = 42;
  const challenge = await createAltchaChallenge(env, now, () => number);
  const payload = encodePayload({ ...challenge, number });
  assert.equal(await verifyAltchaPayload(payload, env, now + 1_000), true);
});

test("ALTCHA rejects tampering, the wrong secret, and expired proofs", async () => {
  const number = 42;
  const challenge = await createAltchaChallenge(env, now, () => number);
  const payload = encodePayload({ ...challenge, number });
  const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));

  assert.equal(await verifyAltchaPayload(encodePayload({ ...parsed, number: parsed.number + 1 }), env, now), false);
  assert.equal(await verifyAltchaPayload(payload, { SESSION_SECRET: "different" }, now), false);
  assert.equal(await verifyAltchaPayload(payload, env, now + 6 * 60_000), false);
});
