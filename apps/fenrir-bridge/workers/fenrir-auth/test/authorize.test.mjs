import { test } from "node:test";
import assert from "node:assert/strict";
import { getProvider } from "../src/config.js";
import { buildAuthorizeUrl } from "../src/oauth.js";

const env = {
  BASE_URL: "https://myfenrir.com",
  GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
  MS_CLIENT_ID: "ms-client-id-guid",
  APPLE_CLIENT_ID: "com.myfenrir.signin",
};

test("google authorize URL structure uses PKCE S256 and myfenrir callback", () => {
  const p = getProvider("google");
  const u = new URL(buildAuthorizeUrl(p, "google", env, { state: "S1", codeChallenge: "C1", nonce: "N1" }));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("client_id"), env.GOOGLE_CLIENT_ID);
  assert.equal(u.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/google/callback");
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.equal(u.searchParams.get("state"), "S1");
  assert.equal(u.searchParams.get("code_challenge"), "C1");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
});

test("microsoft authorize URL structure (v2 common) with MICROSOFT_* alias", () => {
  const p = getProvider("microsoft");
  const aliased = { BASE_URL: "https://myfenrir.com", MICROSOFT_CLIENT_ID: "ms-alias-guid" };
  const u = new URL(buildAuthorizeUrl(p, "microsoft", aliased, { state: "S2", codeChallenge: "C2", nonce: "N2" }));
  assert.equal(u.origin + u.pathname, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  assert.equal(u.searchParams.get("client_id"), "ms-alias-guid");
  assert.equal(u.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/microsoft/callback");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
});

test("apple authorize URL uses form_post and no PKCE", () => {
  const p = getProvider("apple");
  const u = new URL(buildAuthorizeUrl(p, "apple", env, { state: "S3", codeChallenge: null, nonce: "N3" }));
  assert.equal(u.origin + u.pathname, "https://appleid.apple.com/auth/authorize");
  assert.equal(u.searchParams.get("client_id"), env.APPLE_CLIENT_ID);
  assert.equal(u.searchParams.get("response_mode"), "form_post");
  assert.equal(u.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/apple/callback");
  assert.equal(u.searchParams.get("scope"), "name email");
  assert.equal(u.searchParams.get("code_challenge"), null);
});

test("provider extras cannot override authorization security parameters", () => {
  const provider = {
    ...getProvider("google"),
    extraAuthParams: {
      client_id: "attacker",
      redirect_uri: "https://evil.example/callback",
      state: "attacker-state",
      nonce: "attacker-nonce",
      code_challenge: "attacker-challenge",
      code_challenge_method: "plain",
    },
  };
  const u = new URL(buildAuthorizeUrl(provider, "google", env, {
    state: "trusted-state",
    codeChallenge: "trusted-challenge",
    nonce: "trusted-nonce",
  }));
  assert.equal(u.searchParams.get("client_id"), env.GOOGLE_CLIENT_ID);
  assert.equal(u.searchParams.get("redirect_uri"), "https://myfenrir.com/auth/google/callback");
  assert.equal(u.searchParams.get("state"), "trusted-state");
  assert.equal(u.searchParams.get("nonce"), "trusted-nonce");
  assert.equal(u.searchParams.get("code_challenge"), "trusted-challenge");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
});
