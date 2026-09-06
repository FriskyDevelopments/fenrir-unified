import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { createSession } from "../src/identity.js";
import { memorySessionAuthority } from "./session-authority.mock.mjs";

function kv(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key, type) {
      const value = values.get(key) ?? null;
      return type === "json" && value ? JSON.parse(value) : value;
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function d1() {
  const rows = [];
  return {
    rows,
    prepare() {
      return {
        bind(...values) {
          return {
            async run() {
              rows.push(values);
              return { success: true };
            },
          };
        },
      };
    },
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
    FENRIR_TELEGRAM_BOT_USERNAME: "Myfenrir_bot",
    SESSIONS: kv(),
    SESSION_AUTHORITY: memorySessionAuthority(),
    DB: d1(),
    ...extra,
  };
}

test("GET /auth/callback is not a provider", async () => {
  const response = await worker.fetch(
    new Request("https://myfenrir.com/auth/callback"),
    configuredEnv(),
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, "unknown_provider");
  assert.equal(body.provider, "callback");
});

test("GET /auth/google/callback without code is missing_code_or_state", async () => {
  const response = await worker.fetch(
    new Request("https://myfenrir.com/auth/google/callback"),
    configuredEnv(),
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "missing_code_or_state");
});

test("unauthenticated GET /api/telegram/link/start 302s to apex login next", async () => {
  const response = await worker.fetch(
    new Request("https://myfenrir.com/api/telegram/link/start"),
    configuredEnv(),
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://myfenrir.com/login?next=%2Fapi%2Ftelegram%2Flink%2Fstart",
  );
});

test("authenticated GET /api/telegram/link/start 302s to @Myfenrir_bot deep-link", async () => {
  const env = configuredEnv();
  const { cookie } = await createSession(env, {
    id: "google:sub-1",
    provider: "google",
    sub: "sub-1",
    email: "ada@myfenrir.com",
    name: "Ada",
  });
  const response = await worker.fetch(
    new Request("https://myfenrir.com/api/telegram/link/start", {
      headers: { Cookie: cookie },
    }),
    env,
  );
  assert.equal(response.status, 302);
  const location = response.headers.get("location") || "";
  assert.match(location, /^https:\/\/t\.me\/Myfenrir_bot\?start=link_[a-z0-9]+$/i);
  assert.equal(env.DB.rows.length, 1);
});

test("unauthenticated POST /api/telegram/link stays authentication_required", async () => {
  const response = await worker.fetch(
    new Request("https://myfenrir.com/api/telegram/link", { method: "POST" }),
    configuredEnv(),
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "authentication_required");
});

test("authenticated POST /api/telegram/link mints a Myfenrir_bot start URL", async () => {
  const env = configuredEnv();
  const { cookie } = await createSession(env, {
    id: "google:sub-1",
    provider: "google",
    sub: "sub-1",
    email: "ada@myfenrir.com",
    name: "Ada",
  });
  const response = await worker.fetch(
    new Request("https://myfenrir.com/api/telegram/link", {
      method: "POST",
      headers: { Cookie: cookie },
    }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.url, /^https:\/\/t\.me\/Myfenrir_bot\?start=link_/);
  assert.equal(typeof body.code, "string");
});

test("login readiness is /auth/ready, not /auth/health liveness", async () => {
  const health = await worker.fetch(new Request("https://myfenrir.com/auth/health"), {});
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.service, "fenrir-auth-worker");
  assert.equal(healthBody.ready, undefined);

  const ready = await worker.fetch(new Request("https://myfenrir.com/auth/ready"), configuredEnv());
  assert.equal(ready.status, 200);
  const readyBody = await ready.json();
  assert.equal(readyBody.ready, true);
});
