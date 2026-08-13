import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createFallbackChallenge,
  createVerificationGrant,
  hasHumanVerification,
  verificationSetCookie,
  verifyFallbackChallenge,
} from "../_lib/verification.ts";
import { cookieDomain } from "../_lib/billing-env.ts";
import { onRequestGet as startDirectOAuth } from "../api/auth/login/[provider].ts";
import { onRequestPost as createSupabaseSession } from "../api/auth/supabase-session.ts";
import { onRequest as verificationApi } from "../api/[[path]].ts";

const env = { SESSION_SECRET: "test-session-secret" };
const now = Math.floor(Date.UTC(2026, 7, 13, 12, 0, 0) / 1000);

test("Signal Slider accepts the signed target and rejects a forged value", async () => {
  const challenge = await createFallbackChallenge("slider", env, "medium");
  assert.equal(await verifyFallbackChallenge({ mode: "slider", token: challenge.token, value: challenge.target }, env), true);
  assert.equal(await verifyFallbackChallenge({ mode: "slider", token: challenge.token, value: 101 }, env), false);
});

test("human-verification grants are signed, cookie-bound, and expire", async () => {
  const grant = await createVerificationGrant(env, now);
  const cookie = verificationSetCookie(grant).split(";", 1)[0];
  const request = new Request("https://myfenrir.com/api/auth/supabase-session", { headers: { Cookie: cookie } });

  assert.equal(await hasHumanVerification(request, env, now + 1), true);
  assert.equal(await hasHumanVerification(request, env, now + 301), false);
  assert.equal(await hasHumanVerification(new Request(request.url), env, now + 1), false);
  assert.equal(await hasHumanVerification(new Request(request.url, { headers: { Cookie: `${cookie}x` } }), env, now + 1), false);
});

test("authentication entry points reject requests without human verification", async () => {
  const direct = await startDirectOAuth({
    params: { provider: "google" },
    request: new Request("https://myfenrir.com/api/auth/login/google"),
    env,
  } as never);
  assert.equal(direct.status, 403);
  assert.equal((await direct.json()).error, "human_verification_required");

  const supabase = await createSupabaseSession({
    request: new Request("https://myfenrir.com/api/auth/supabase-session", { method: "POST" }),
    env,
  });
  assert.equal(supabase.status, 403);
  assert.equal((await supabase.json()).error, "human_verification_required");
});

test("Pages previews use host-only verification cookies", () => {
  assert.equal(cookieDomain(new Request("https://fenrir-bridge.pages.dev/api/verification/verify"), { PUBLIC_SITE_URL: "https://myfenrir.com" }), undefined);
  assert.equal(cookieDomain(new Request("https://www.myfenrir.com/api/verification/verify"), { PUBLIC_SITE_URL: "https://myfenrir.com" }), "myfenrir.com");
});

test("verification endpoint installs an HttpOnly grant accepted by auth", async () => {
  const challengeResponse = await verificationApi({
    request: new Request("https://myfenrir.com/api/verification/challenge?mode=slider", { headers: { "user-agent": "vitest" } }),
    env,
  });
  const challenge = await challengeResponse.json() as { token: string; target: number };

  const verifiedResponse = await verificationApi({
    request: new Request("https://myfenrir.com/api/verification/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "slider", token: challenge.token, value: challenge.target }),
    }),
    env,
  });
  assert.equal(verifiedResponse.status, 200);
  assert.deepEqual(await verifiedResponse.json(), { verified: true });
  const setCookie = verifiedResponse.headers.get("Set-Cookie") ?? "";
  assert.match(setCookie, /fenrir_human_verification=/);
  assert.match(setCookie, /HttpOnly/);

  const authResponse = await createSupabaseSession({
    request: new Request("https://myfenrir.com/api/auth/supabase-session", {
      method: "POST",
      headers: { Cookie: setCookie.split(";", 1)[0] },
    }),
    env,
  });
  assert.equal(authResponse.status, 400);
  assert.equal((await authResponse.json()).error, "missing_supabase_access_token");
});
