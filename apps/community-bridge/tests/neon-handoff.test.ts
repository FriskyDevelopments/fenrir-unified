import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { signCommunityQualityHandoff } from "../../fenrir-bridge/functions/_lib/community-quality-handoff.ts";
import { verifyNeonCommunityHandoff } from "../src/lib/neon-handoff.server.ts";

const sharedSecret = "test-only-community-secret";
const sourceEnv = { FENRIR_COMMUNITY_AUTH_SECRET: sharedSecret };

afterEach(() => delete process.env.FENRIR_COMMUNITY_AUTH_SECRET);

async function token() {
  return signCommunityQualityHandoff({
    user_id: "6f261f82-563c-45b9-982b-00dc16c8bcbf",
    email: "member@example.com",
    role: "member",
    access_status: "active",
    community_slug: "fenrir",
    community_org_id: "5f98349e-17a4-4bfb-b820-0b8d7c5bd54c",
    iat: 1,
    exp: 2,
  }, "https://quality.communities.myfenrir.com/g/abc", sourceEnv);
}

test("Quality accepts a handoff signed by the canonical Neon bridge", async () => {
  process.env.FENRIR_COMMUNITY_AUTH_SECRET = sharedSecret;
  const payload = await verifyNeonCommunityHandoff(await token(), { consume: async () => true });
  assert.equal(payload.email, "member@example.com");
  assert.equal(payload.destination, "https://quality.communities.myfenrir.com/g/abc");
});

test("Quality rejects tampering and replay", async () => {
  process.env.FENRIR_COMMUNITY_AUTH_SECRET = sharedSecret;
  const signed = await token();
  const tampered = `${signed[0] === "a" ? "b" : "a"}${signed.slice(1)}`;
  await assert.rejects(
    () => verifyNeonCommunityHandoff(tampered, { consume: async () => true }),
    /neon_handoff_invalid/,
  );
  await assert.rejects(
    () => verifyNeonCommunityHandoff(signed, { consume: async () => false }),
    /neon_handoff_replayed/,
  );
});
