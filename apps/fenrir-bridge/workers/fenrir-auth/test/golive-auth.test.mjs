import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { createSession, getSession } from "../src/identity.js";

function kv(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key, type) {
      const value = values.get(key) ?? null;
      return type === "json" && value ? JSON.parse(value) : value;
    },
    async put(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
  };
}

function configuredEnv(extra = {}) {
  return {
    SESSION_SECRET: "test-secret",
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
    MS_CLIENT_ID: "mid",
    MS_CLIENT_SECRET: "msecret",
    APPLE_CLIENT_ID: "aid",
    APPLE_TEAM_ID: "team",
    APPLE_KEY_ID: "key",
    APPLE_PRIVATE_KEY: "private",
    SESSIONS: kv(),
    OAUTH_STATE: oauthState(),
    ...extra,
  };
}

function oauthState() {
  const records = new Map();
  return {
    idFromName: (name) => name,
    get: (id) => ({
      fetch: async (_input, init = {}) => {
        if (init.method === "PUT") {
          records.set(id, JSON.parse(init.body));
          return new Response(null, { status: 204 });
        }
        const record = records.get(id);
        records.delete(id);
        if (!record || record.expiresAt <= Date.now()) return new Response(null, { status: 404 });
        return Response.json(record.payload);
      },
    }),
  };
}

test("readiness stays login-ready on KV when Neon is not configured", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/ready"), configuredEnv());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ready, true);
  assert.equal(body.database, false);
  assert.equal(body.session_backend, "kv");
  assert.equal(body.oauth_state_backend, "durable_object");
  assert.equal(body.degraded, true);
  assert.equal(body.session_secret, true);
  assert.equal(body.data_api, undefined);
  assert.deepEqual(body.providers, { google: true, microsoft: true, apple: true });
});

test("OAuth callback failures redirect browsers to /login instead of raw JSON", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/google/callback?error=access_denied", {
    headers: { Accept: "text/html,application/xhtml+xml" },
  }), configuredEnv());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://myfenrir.com/login?error=provider_error");
});

test("OAuth callback failures remain JSON for API clients", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/google/callback?error=access_denied", {
    headers: { Accept: "application/json" },
  }), configuredEnv());
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "provider_error");
});

test("KV sessions mint and resolve without DATABASE_URL", async () => {
  const env = configuredEnv();
  const user = { id: "google:abc", provider: "google", sub: "abc", email: "ada@myfenrir.com", name: "Ada" };
  const { cookie, token } = await createSession(env, user);
  assert.match(cookie, /^fenrir_session=/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /folios\.works/);
  assert.equal(typeof token, "string");
  const request = new Request("https://myfenrir.com/auth/me", { headers: { Cookie: cookie } });
  const session = await getSession(env, request);
  assert.equal(session.user.id, "google:abc");
  const me = await worker.fetch(request, env);
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.user.email, "ada@myfenrir.com");
});

test("KV sessions resolve a Bearer token without DATABASE_URL", async () => {
  const env = configuredEnv();
  const user = { id: "google:abc", provider: "google", sub: "abc", email: "ada@myfenrir.com", name: "Ada" };
  const { token } = await createSession(env, user);
  const request = new Request("https://myfenrir.com/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const session = await getSession(env, request);
  assert.equal(session.user.id, "google:abc");
  const me = await worker.fetch(request, env);
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.user.email, "ada@myfenrir.com");
});

test("www origin can read /auth/me with CORS credentials", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/me", {
    headers: { Origin: "https://www.myfenrir.com", Accept: "application/json" },
  }), configuredEnv());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://www.myfenrir.com");
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
});

test("folios.works origin does not receive Fenrir CORS credentials", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/me", {
    headers: { Origin: "https://folios.works", Accept: "application/json" },
  }), configuredEnv());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("OPTIONS preflight from www is allowed with credentials", async () => {
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/me", {
    method: "OPTIONS",
    headers: { Origin: "https://www.myfenrir.com" },
  }), configuredEnv());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://www.myfenrir.com");
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
});

test("www.myfenrir.com /auth/health is served by the same Worker", async () => {
  const response = await worker.fetch(new Request("https://www.myfenrir.com/auth/health"), configuredEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "fenrir-auth-worker" });
});

test("/auth/api stays 404 on Fenrir even with a KV session", async () => {
  const env = configuredEnv();
  const { cookie } = await createSession(env, { id: "google:abc", provider: "google", sub: "abc" });
  const response = await worker.fetch(new Request("https://myfenrir.com/auth/api/clients", {
    headers: { Cookie: cookie, Accept: "application/json" },
  }), env);
  assert.equal(response.status, 404);
});
