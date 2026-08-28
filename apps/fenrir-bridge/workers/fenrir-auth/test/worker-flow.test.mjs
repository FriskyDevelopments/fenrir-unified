import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function memoryKv() {
  const records = new Map();
  return {
    records,
    async put(key, value) { records.set(key, value); },
    async get(key) { return records.get(key) ?? null; },
    async delete(key) { records.delete(key); },
  };
}

function configuredEnv(extra = {}) {
  return {
    BASE_URL: "https://myfenrir.com",
    SESSION_SECRET: "worker-flow-secret",
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    SESSIONS: memoryKv(),
    ...extra,
  };
}

async function startGoogle(env, redirect = "/main") {
  const response = await worker.fetch(new Request(
    `https://myfenrir.com/auth/google?redirect=${encodeURIComponent(redirect)}`,
  ), env);
  assert.equal(response.status, 302);
  return new URL(response.headers.get("Location"));
}

test("a complete Google flow consumes state, creates a session, and exposes the signed-in identity", async () => {
  const env = configuredEnv();
  const authorize = await startGoogle(env, "/main/settings?tab=security");
  const state = authorize.searchParams.get("state");
  assert.ok(state);
  assert.equal(authorize.searchParams.get("nonce")?.length > 0, true);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(env.SESSIONS.records.has(`oauthstate:${state}`), true);

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "access-token", token_type: "Bearer" });
    }
    if (String(url) === "https://openidconnect.googleapis.com/v1/userinfo") {
      return Response.json({
        sub: "subject-1",
        email: "ada@myfenrir.com",
        email_verified: true,
        given_name: "Ada",
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const callback = await worker.fetch(new Request(
    `https://myfenrir.com/auth/google/callback?code=oauth-code&state=${encodeURIComponent(state)}`,
    { headers: { "User-Agent": "unit-test", "CF-Connecting-IP": "192.0.2.10" } },
  ), env);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("Location"), "https://myfenrir.com/main/settings?tab=security");
  assert.equal(env.SESSIONS.records.has(`oauthstate:${state}`), false);
  const tokenBody = new URLSearchParams(calls[0].options.body);
  assert.equal(tokenBody.get("code"), "oauth-code");
  assert.equal(tokenBody.get("client_secret"), "google-secret");
  assert.ok(tokenBody.get("code_verifier"));
  assert.equal(calls[1].options.headers.Authorization, "Bearer access-token");

  const cookie = callback.headers.get("Set-Cookie").split(";", 1)[0];
  const me = await worker.fetch(new Request("https://myfenrir.com/auth/me", {
    headers: { Cookie: cookie },
  }), env);
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.authenticated, true);
  assert.deepEqual(body.user, {
    id: "google:subject-1",
    provider: "google",
    sub: "subject-1",
    email: "ada@myfenrir.com",
    email_verified: true,
    name: "Ada",
    picture: null,
  });
  assert.equal(typeof body.expiresAt, "number");
  assert.ok(body.expiresAt > Date.now());
});

test("callback state is single-use and bound to the provider that initiated it", async () => {
  const env = configuredEnv();
  const authorize = await startGoogle(env);
  const state = authorize.searchParams.get("state");

  const mismatch = await worker.fetch(new Request(
    `https://myfenrir.com/auth/microsoft/callback?code=code&state=${encodeURIComponent(state)}`,
  ), env);
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).error, "state_provider_mismatch");
  assert.equal(env.SESSIONS.records.has(`oauthstate:${state}`), false);

  const replay = await worker.fetch(new Request(
    `https://myfenrir.com/auth/google/callback?code=code&state=${encodeURIComponent(state)}`,
  ), env);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, "invalid_or_expired_state");
});

test("token and profile failures are translated into stable 502 responses", async () => {
  const tokenEnv = configuredEnv();
  const tokenState = (await startGoogle(tokenEnv)).searchParams.get("state");
  globalThis.fetch = async () => new Response("provider rejected code", { status: 401 });
  const tokenFailure = await worker.fetch(new Request(
    `https://myfenrir.com/auth/google/callback?code=bad&state=${encodeURIComponent(tokenState)}`,
  ), tokenEnv);
  assert.equal(tokenFailure.status, 502);
  assert.equal((await tokenFailure.json()).error, "token_exchange_failed");

  const profileEnv = configuredEnv();
  const profileState = (await startGoogle(profileEnv)).searchParams.get("state");
  globalThis.fetch = async (url) => String(url).includes("/token")
    ? Response.json({ access_token: "access-token" })
    : new Response("userinfo unavailable", { status: 503 });
  const profileFailure = await worker.fetch(new Request(
    `https://myfenrir.com/auth/google/callback?code=good&state=${encodeURIComponent(profileState)}`,
  ), profileEnv);
  assert.equal(profileFailure.status, 502);
  assert.equal((await profileFailure.json()).error, "profile_fetch_failed");
});

test("callback rejects profiles without a stable subject and reports session-store failures", async () => {
  const noSubjectEnv = configuredEnv();
  const noSubjectState = (await startGoogle(noSubjectEnv)).searchParams.get("state");
  globalThis.fetch = async (url) => String(url).includes("/token")
    ? Response.json({ access_token: "access-token" })
    : Response.json({ email: "missing-sub@example.com" });
  const noSubject = await worker.fetch(new Request(
    `https://myfenrir.com/auth/google/callback?code=good&state=${encodeURIComponent(noSubjectState)}`,
  ), noSubjectEnv);
  assert.equal(noSubject.status, 502);
  assert.equal((await noSubject.json()).error, "no_subject_in_profile");

  const failingKv = memoryKv();
  const originalPut = failingKv.put.bind(failingKv);
  failingKv.put = async (key, value) => {
    if (key.startsWith("session:")) throw new Error("KV unavailable");
    return originalPut(key, value);
  };
  const sessionEnv = configuredEnv({ SESSIONS: failingKv });
  const sessionState = (await startGoogle(sessionEnv)).searchParams.get("state");
  globalThis.fetch = async (url) => String(url).includes("/token")
    ? Response.json({ access_token: "access-token" })
    : Response.json({ sub: "subject-2" });
  const sessionFailure = await worker.fetch(new Request(
    `https://myfenrir.com/auth/google/callback?code=good&state=${encodeURIComponent(sessionState)}`,
  ), sessionEnv);
  assert.equal(sessionFailure.status, 503);
  assert.equal((await sessionFailure.json()).error, "session_create_failed");
});

test("routing rejects unsupported methods and refuses permissive CORS for sibling-domain attacks", async () => {
  const env = configuredEnv();
  const start = await worker.fetch(new Request("https://myfenrir.com/auth/google", { method: "POST" }), env);
  assert.equal(start.status, 405);
  const callback = await worker.fetch(new Request("https://myfenrir.com/auth/google/callback", { method: "DELETE" }), env);
  assert.equal(callback.status, 405);

  const cors = await worker.fetch(new Request("https://myfenrir.com/auth/me", {
    headers: { Origin: "https://myfenrir.com.evil.example" },
  }), env);
  assert.equal(cors.status, 200);
  assert.equal(cors.headers.get("Access-Control-Allow-Origin"), null);
});
