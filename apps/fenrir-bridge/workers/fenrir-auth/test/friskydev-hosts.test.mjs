import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { bindRequest, cfg, cookieDomainForHost, isAllowedAuthHost } from "../src/config.js";
import { createSession } from "../src/identity.js";

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
    ...extra,
  };
}

test("forge and paperclip are allowed auth hosts; folios.works is not", () => {
  assert.equal(isAllowedAuthHost("forge.friskydev.com"), true);
  assert.equal(isAllowedAuthHost("paperclip.friskydev.com"), true);
  assert.equal(isAllowedAuthHost("mcp.friskydev.com"), true);
  assert.equal(isAllowedAuthHost("myfenrir.com"), true);
  assert.equal(isAllowedAuthHost("www.myfenrir.com"), true);
  assert.equal(isAllowedAuthHost("folios.works"), false);
  assert.equal(isAllowedAuthHost("www.folios.works"), false);
});

test("cookie domain is friskydev.com on Forge/Paperclip and myfenrir.com on Fenrir", () => {
  assert.equal(cookieDomainForHost("forge.friskydev.com"), "friskydev.com");
  assert.equal(cookieDomainForHost("paperclip.friskydev.com"), "friskydev.com");
  assert.equal(cookieDomainForHost("myfenrir.com"), "myfenrir.com");
  assert.equal(cookieDomainForHost("www.myfenrir.com"), "myfenrir.com");
});

test("folios.works is rejected by the Worker", async () => {
  const response = await worker.fetch(new Request("https://folios.works/auth/health"), configuredEnv());
  assert.equal(response.status, 404);
});

test("forge /auth/providers reports host-local start and callback URLs", async () => {
  const response = await worker.fetch(new Request("https://forge.friskydev.com/auth/providers"), configuredEnv());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.identity, "better-auth");
  assert.equal(body.providers.google.can_start, true);
  assert.equal(body.providers.microsoft.can_start, true);
  assert.equal(body.providers.apple.can_start, true);
  assert.equal(body.providers.google.start, "https://forge.friskydev.com/auth/google");
  assert.equal(body.providers.microsoft.callback, "https://forge.friskydev.com/auth/microsoft/callback");
  assert.equal(body.providers.apple.callback, "https://forge.friskydev.com/auth/apple/callback");
});

test("forge Microsoft start 302s to Entra with the forge callback", async () => {
  const response = await worker.fetch(new Request("https://forge.friskydev.com/auth/microsoft?redirect=/"), configuredEnv());
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin + location.pathname, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  assert.equal(location.searchParams.get("redirect_uri"), "https://forge.friskydev.com/auth/microsoft/callback");
  assert.equal(location.searchParams.get("prompt"), "select_account");
});

test("paperclip Apple start 302s with form_post and paperclip callback", async () => {
  const response = await worker.fetch(new Request("https://paperclip.friskydev.com/auth/apple"), configuredEnv());
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin + location.pathname, "https://appleid.apple.com/auth/authorize");
  assert.equal(location.searchParams.get("redirect_uri"), "https://paperclip.friskydev.com/auth/apple/callback");
  assert.equal(location.searchParams.get("response_mode"), "form_post");
});

test("forge login page includes all three provider buttons", async () => {
  const response = await worker.fetch(new Request("https://forge.friskydev.com/login", {
    headers: { Accept: "text/html" },
  }), configuredEnv());
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Continue with Google/);
  assert.match(body, /Continue with Microsoft/);
  assert.match(body, /Continue with Apple/);
  assert.match(body, /\/auth\/microsoft\?redirect=%2F/);
});

test("forge session cookie is scoped to friskydev.com, not myfenrir.com", async () => {
  const env = bindRequest(configuredEnv(), new Request("https://forge.friskydev.com/auth/me"));
  assert.equal(cfg(env).cookieDomain, "friskydev.com");
  assert.equal(cfg(env).baseUrl, "https://forge.friskydev.com");
  const { cookie } = await createSession(env, {
    id: "microsoft:abc",
    provider: "microsoft",
    sub: "abc",
    email: "ada@frisky.dev",
  });
  assert.match(cookie, /Domain=friskydev.com/);
  assert.doesNotMatch(cookie, /Domain=myfenrir.com/);
});
