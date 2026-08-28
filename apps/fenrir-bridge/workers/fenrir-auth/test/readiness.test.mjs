import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { safeReturnTo } from "../src/index.js";

function b64url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function derToPem(der) {
  const encoded = Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----\n`;
}

const env = {
  BASE_URL: "https://myfenrir.com",
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
    records,
    put: async (key, value) => { records.set(key, value); },
    get: async (key) => records.get(key) ?? null,
    delete: async (key) => { records.delete(key); },
  };
}

function memoryOAuthState() {
  const records = new Map();
  return {
    records,
    idFromName: (name) => name,
    get: (id) => ({
      async fetch(_url, init = {}) {
        if (init.method === "PUT") {
          records.set(id, JSON.parse(init.body));
          return new Response(null, { status: 204 });
        }
        if (init.method === "DELETE") {
          const record = records.get(id);
          records.delete(id);
          return record && record.expiresAt > Date.now()
            ? Response.json(record.payload)
            : new Response(null, { status: 404 });
        }
        return new Response(null, { status: 405 });
      },
    }),
  };
}

test("GET /auth/google 302s to Google with Fenrir callback", async () => {
  const stateStore = memoryOAuthState();
  const startEnv = { ...env, SESSIONS: memoryKv(), OAUTH_STATE: stateStore };
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/google?redirect=/main"), startEnv);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(location.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/google/callback");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  const state = location.searchParams.get("state");
  assert.ok(state);
  assert.equal(stateStore.records.get(state).payload.returnTo, "https://myfenrir.com/main");
});

test("GET /auth/microsoft 302s to Entra with Fenrir callback and PKCE S256", async () => {
  const startEnv = { ...env, MICROSOFT_CLIENT_ID: "ms-alias-guid", SESSIONS: memoryKv(), OAUTH_STATE: memoryOAuthState() };
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/microsoft?redirect=/main"), startEnv);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin + location.pathname, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  assert.equal(location.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/microsoft/callback");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
});

test("GET /auth/apple 302s with form_post and Fenrir callback", async () => {
  const startEnv = { ...env, APPLE_CLIENT_ID: "com.myfenrir.signin", SESSIONS: memoryKv(), OAUTH_STATE: memoryOAuthState() };
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/apple"), startEnv);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin + location.pathname, "https://appleid.apple.com/auth/authorize");
  assert.equal(location.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/apple/callback");
  assert.equal(location.searchParams.get("response_mode"), "form_post");
  assert.equal(location.searchParams.get("code_challenge_method"), null);
});

test("login and callback requests canonicalize www before a cookie can be issued", async () => {
  const start = await worker.fetch(
    new Request("https://www.myfenrir.com/auth/google?redirect=/main"),
    { ...env, OAUTH_STATE: memoryOAuthState() },
  );
  assert.equal(start.status, 302);
  assert.equal(start.headers.get("Location"), "https://myfenrir.com/auth/google?redirect=/main");

  const callback = await worker.fetch(
    new Request("https://www.myfenrir.com/auth/apple/callback", { method: "POST", body: "code=x&state=y" }),
    { ...env, OAUTH_STATE: memoryOAuthState() },
  );
  assert.equal(callback.status, 307);
  assert.equal(callback.headers.get("Location"), "https://myfenrir.com/auth/apple/callback");
  assert.equal(callback.headers.get("Set-Cookie"), null);
});

test("Apple callbacks reject missing or mismatched OIDC nonces", async (t) => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const stateStore = memoryOAuthState();
  const appleEnv = {
    ...env,
    APPLE_CLIENT_ID: "com.myfenrir.signin",
    APPLE_TEAM_ID: "TEAM123456",
    APPLE_KEY_ID: "KEY1234567",
    APPLE_PRIVATE_KEY: derToPem(new Uint8Array(privateKey)),
    SESSIONS: memoryKv(),
    OAUTH_STATE: stateStore,
  };
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  for (const claims of [{ sub: "apple-user" }, { sub: "apple-user", nonce: "wrong" }]) {
    const start = await worker.fetch(new Request("https://myfenrir.com/auth/apple"), appleEnv);
    const state = new URL(start.headers.get("Location")).searchParams.get("state");
    globalThis.fetch = async () => Response.json({
      access_token: "token",
      id_token: `${b64url({ alg: "RS256" })}.${b64url(claims)}.signature`,
    });
    const callback = await worker.fetch(
      new Request(`https://myfenrir.com/auth/apple/callback?code=CODE&state=${state}`),
      appleEnv,
    );
    assert.equal(callback.status, 400);
    assert.equal((await callback.json()).error, "invalid_oidc_nonce");
  }
});

test("callbacks reject missing and provider-mismatched state", async () => {
  const startEnv = {
    ...env,
    MICROSOFT_CLIENT_ID: "mid",
    SESSIONS: memoryKv(),
    OAUTH_STATE: memoryOAuthState(),
  };
  const missing = await worker.fetch(
    new Request("https://myfenrir.com/auth/google/callback?code=CODE&state=missing"),
    startEnv,
  );
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error, "invalid_or_expired_state");

  const start = await worker.fetch(new Request("https://myfenrir.com/auth/google?redirect=/main"), startEnv);
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  const mismatch = await worker.fetch(
    new Request(`https://myfenrir.com/auth/microsoft/callback?code=CODE&state=${state}`),
    startEnv,
  );
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).error, "state_provider_mismatch");
});

test("logout clears the host-only Fenrir HMAC cookie", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/logout"), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://myfenrir.com/login");
  const cookie = response.headers.get("Set-Cookie");
  assert.match(cookie, /fenrir_session=/);
  assert.doesNotMatch(cookie, /Domain=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=0/);
});
