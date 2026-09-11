import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cfg,
  getProvider,
  missingSecrets,
  providerConfigured,
  readSecret,
  redirectUri,
} from "../src/config.js";

test("readSecret prefers canonical values and falls back through supported aliases", () => {
  assert.equal(readSecret({ SESSION_SECRET: "primary", BETTER_AUTH_SECRET: "alias" }, "SESSION_SECRET"), "primary");
  assert.equal(readSecret({ SESSION_SECRET: "   ", BETTER_AUTH_SECRET: "alias" }, "SESSION_SECRET"), "alias");
  assert.equal(readSecret({ NEON_DATABASE_URL: "postgres://alias" }, "DATABASE_URL"), "postgres://alias");
  assert.equal(readSecret({ MICROSOFT_CLIENT_ID: "microsoft-id" }, "MS_CLIENT_ID"), "microsoft-id");
  assert.equal(readSecret({ GOOGLE_CLIENT_ID: 123 }, "GOOGLE_CLIENT_ID"), "");
});

test("cfg applies production-safe defaults and normalizes list configuration", () => {
  const defaults = cfg({});
  assert.equal(defaults.baseUrl, "https://myfenrir.com");
  assert.equal(defaults.cookieName, "fenrir_session");
  assert.equal(defaults.cookieDomain, "myfenrir.com");
  assert.equal(defaults.sessionTtl, 604800);
  assert.deepEqual(defaults.allowedRedirectHosts, ["myfenrir.com", "www.myfenrir.com"]);

  const configured = cfg({
    BASE_URL: "https://preview.myfenrir.com/",
    SESSION_COOKIE_NAME: "preview_session",
    COOKIE_DOMAIN: "preview.myfenrir.com",
    SESSION_TTL_SECONDS: "90",
    BETTER_AUTH_SECRET: "better-secret",
    NEON_DATABASE_URL: "postgres://neon",
    ALLOWED_REDIRECT_HOSTS: " preview.myfenrir.com, ,myfenrir.com ",
    TRUSTED_ORIGINS: " https://preview.myfenrir.com,https://myfenrir.com ",
  });
  assert.equal(configured.baseUrl, "https://preview.myfenrir.com");
  assert.equal(configured.cookieName, "preview_session");
  assert.equal(configured.cookieDomain, "preview.myfenrir.com");
  assert.equal(configured.sessionTtl, 90);
  assert.equal(configured.sessionSecret, "better-secret");
  assert.equal(configured.databaseUrl, "postgres://neon");
  assert.deepEqual(configured.allowedRedirectHosts, ["preview.myfenrir.com", "myfenrir.com"]);
  assert.deepEqual(configured.trustedOrigins, ["https://preview.myfenrir.com", "https://myfenrir.com"]);
  assert.equal(redirectUri({ BASE_URL: "https://preview.myfenrir.com/" }, "google"), "https://preview.myfenrir.com/auth/google/callback");
});

test("providerConfigured requires callback credentials while client IDs alone can only start auth", () => {
  const google = getProvider("google");
  const microsoft = getProvider("microsoft");
  const apple = getProvider("apple");

  assert.equal(providerConfigured(google, { GOOGLE_CLIENT_ID: "gid" }), false);
  assert.equal(providerConfigured(google, { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "secret" }), true);
  assert.equal(providerConfigured(microsoft, {
    MICROSOFT_CLIENT_ID: "mid",
    MICROSOFT_CLIENT_SECRET: "secret",
  }), true);
  assert.equal(providerConfigured(apple, {
    APPLE_CLIENT_ID: "aid",
    APPLE_TEAM_ID: "team",
    APPLE_KEY_ID: "key",
  }), false);
  assert.equal(providerConfigured(apple, {
    APPLE_CLIENT_ID: "aid",
    APPLE_TEAM_ID: "team",
    APPLE_KEY_ID: "key",
    APPLE_PRIVATE_KEY: "private",
  }), true);
  assert.equal(getProvider("github"), null);
});

test("missingSecrets reports every callback credential that must be configured", () => {
  assert.deepEqual(missingSecrets(getProvider("google"), {}), ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  assert.deepEqual(missingSecrets(getProvider("microsoft"), { MICROSOFT_CLIENT_ID: "mid" }), ["MS_CLIENT_SECRET"]);
  assert.deepEqual(missingSecrets(getProvider("apple"), { APPLE_CLIENT_ID: "aid", APPLE_KEY_ID: "key" }), [
    "APPLE_TEAM_ID",
    "APPLE_PRIVATE_KEY",
  ]);
});
