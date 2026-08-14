import assert from "node:assert/strict";
import { test } from "vitest";
import { safeCommunityReturnPath } from "../_lib/oauth.ts";
import { safeQualityDestination, signCommunityQualityHandoff } from "../_lib/community-quality-handoff.ts";

const env = { FENRIR_COMMUNITY_AUTH_SECRET: "test-only-community-secret" };

test("the only non-page Community return is the fixed Quality handoff", () => {
  assert.equal(
    safeCommunityReturnPath("/api/community-auth/quality-handoff?destination=%2Fg%2Fabc"),
    "/api/community-auth/quality-handoff?destination=%2Fg%2Fabc",
  );
  assert.equal(safeCommunityReturnPath("/api/community-auth/quality-handoff-evil"), "/");
  assert.equal(safeCommunityReturnPath("https://evil.example/g/abc"), "/");
});

test("Quality handoff pins destinations to the Quality Gate origin", () => {
  assert.equal(safeQualityDestination("https://quality.communities.myfenrir.com/g/abc"), "https://quality.communities.myfenrir.com/g/abc");
  assert.equal(safeQualityDestination("https://evil.example/g/abc"), "https://quality.communities.myfenrir.com/");
});

test("Quality handoff is signed and contains no provider secret", async () => {
  const token = await signCommunityQualityHandoff({
    user_id: "6f261f82-563c-45b9-982b-00dc16c8bcbf",
    email: "member@example.com",
    role: "member",
    access_status: "active",
    community_slug: "fenrir",
    community_org_id: "5f98349e-17a4-4bfb-b820-0b8d7c5bd54c",
    iat: 1,
    exp: 2,
  }, "https://quality.communities.myfenrir.com/g/abc", env);
  const [body, signature] = token.split(".");
  assert.ok(body && signature);
  const payload = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
  assert.equal(payload.destination, "https://quality.communities.myfenrir.com/g/abc");
  assert.equal(JSON.stringify(payload).includes("test-only-community-secret"), false);
});
