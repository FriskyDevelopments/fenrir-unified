import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { safeReturnTo } from "../src/index.js";

const env = {
  BASE_URL: "https://myfenrir.com",
  COOKIE_DOMAIN: "myfenrir.com",
  POST_LOGIN_REDIRECT: "https://myfenrir.com/main",
  LOGOUT_REDIRECT: "https://myfenrir.com/login",
  ALLOWED_REDIRECT_HOSTS: "myfenrir.com,www.myfenrir.com",
  SESSION_SECRET: "test-secret",
  GOOGLE_CLIENT_ID: "gid",
};

test("health remains a liveness endpoint", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "fenrir-auth-worker" });
});

test("readiness fails closed when neither Neon nor KV can hold a session", async () => {
  const readyEnv = {
    SESSION_SECRET: "test-secret",
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
    MICROSOFT_CLIENT_ID: "mid",
    MICROSOFT_CLIENT_SECRET: "msecret",
    APPLE_CLIENT_ID: "aid",
    APPLE_TEAM_ID: "team",
    APPLE_KEY_ID: "key",
    APPLE_PRIVATE_KEY: "private",
  };
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/ready"), readyEnv);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ready, false);
  assert.equal(body.database, false);
  assert.equal(body.session_backend, "kv");
  assert.equal(body.degraded, true);
});

test("me without cookie is unauthenticated", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/me"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("providers advertise Better Auth identity and Fenrir callbacks", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/providers"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.identity, "better-auth");
  assert.equal(body.providers.google.can_start, true);
  assert.equal(body.providers.google.start, "https://myfenrir.com/auth/google");
  assert.equal(body.providers.google.callback, "https://myfenrir.com/auth/google/callback");
  assert.equal(body.providers.microsoft.can_start, false);
  assert.equal(body.providers.apple.can_start, false);
});

test("unknown extra providers are rejected", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/github"), env);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, "unknown_provider");
});

test("stale SPA /auth/callback is not a provider", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/callback"), env);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, "unknown_provider");
  assert.equal(body.provider, "callback");
});

test("provider callback without code is missing_code_or_state, not unknown_provider", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/google/callback"), env);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "missing_code_or_state");
});

test("/auth/api is out of Fenrir identity", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/api/clients"), env);
  assert.equal(response.status, 404);
});

test("folios.works host is rejected", async () => {
  const response = await worker.fetch(new Request("https://folios.works/auth/health"), env);
  assert.equal(response.status, 404);
});

test("open-redirect protection falls back to POST_LOGIN_REDIRECT", () => {
  assert.equal(safeReturnTo(env, "https://evil.example/phish"), "https://myfenrir.com/main");
  assert.equal(safeReturnTo(env, "//evil.example"), "https://myfenrir.com/main");
  assert.equal(safeReturnTo(env, "https://folios.works/app"), "https://myfenrir.com/main");
  assert.equal(safeReturnTo(env, "/main"), "https://myfenrir.com/main");
  assert.equal(safeReturnTo(env, "https://www.myfenrir.com/main"), "https://www.myfenrir.com/main");
});

function memoryKv() {
  const records = new Map();
  return {
    put: async (key, value) => { records.set(key, value); },
    get: async (key) => records.get(key) ?? null,
    delete: async (key) => { records.delete(key); },
  };
}

test("GET /auth/google 302s to Google with Fenrir callback", async () => {
  const startEnv = { ...env, SESSIONS: memoryKv() };
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/google?redirect=/main"), startEnv);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(location.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/google/callback");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.ok(location.searchParams.get("state"));
});

test("GET /auth/microsoft 302s to Entra with Fenrir callback and PKCE S256", async () => {
  const startEnv = { ...env, MICROSOFT_CLIENT_ID: "ms-alias-guid", SESSIONS: memoryKv() };
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/microsoft?redirect=/main"), startEnv);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin + location.pathname, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  assert.equal(location.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/microsoft/callback");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
});

test("GET /auth/apple 302s with form_post and Fenrir callback", async () => {
  const startEnv = { ...env, APPLE_CLIENT_ID: "com.myfenrir.signin", SESSIONS: memoryKv() };
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/apple"), startEnv);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin + location.pathname, "https://appleid.apple.com/auth/authorize");
  assert.equal(location.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/apple/callback");
  assert.equal(location.searchParams.get("response_mode"), "form_post");
  assert.equal(location.searchParams.get("code_challenge_method"), null);
});

test("logout clears the Fenrir HMAC cookie domain", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/logout"), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://myfenrir.com/login");
  const cookie = response.headers.get("Set-Cookie");
  assert.match(cookie, /fenrir_session=/);
  assert.match(cookie, /Domain=myfenrir.com/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Max-Age=0/);
});
