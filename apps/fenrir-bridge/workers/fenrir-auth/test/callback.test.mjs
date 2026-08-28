import { test } from "node:test";
import assert from "node:assert/strict";
import { getProvider } from "../src/config.js";
import { exchangeCode, fetchProfile } from "../src/oauth.js";

const enc = new TextEncoder();
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const handler = routes[String(url)];
    if (!handler) throw new Error(`unexpected fetch ${url}`);
    return handler(opts);
  };
  return calls;
}

test("google: exchangeCode posts PKCE verifier + Fenrir callback", async () => {
  const p = getProvider("google");
  const env = {
    BASE_URL: "https://myfenrir.com",
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
  };

  const calls = stubFetch({
    "https://oauth2.googleapis.com/token": () =>
      new Response(JSON.stringify({ access_token: "AT", id_token: "IT", token_type: "Bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    "https://openidconnect.googleapis.com/v1/userinfo": () =>
      new Response(
        JSON.stringify({ sub: "google-sub-1", email: "u@myfenrir.com", email_verified: true, name: "U", picture: "pic" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  });

  const tokens = await exchangeCode(p, "google", env, { code: "CODE", codeVerifier: "VER" });
  assert.equal(tokens.access_token, "AT");

  const body = calls[0].opts.body;
  assert.match(body, /grant_type=authorization_code/);
  assert.match(body, /code=CODE/);
  assert.match(body, /code_verifier=VER/);
  assert.match(body, /client_id=gid/);
  assert.match(body, /client_secret=gsecret/);
  assert.match(body, /redirect_uri=https%3A%2F%2Fmyfenrir.com%2Fauth%2Fgoogle%2Fcallback/);

  const profile = await fetchProfile(p, "google", env, tokens, null);
  assert.deepEqual(profile, {
    provider: "google",
    sub: "google-sub-1",
    email: "u@myfenrir.com",
    email_verified: true,
    name: "U",
    picture: "pic",
  });
});

test("apple: fetchProfile reads id_token claims + posted name", async () => {
  const p = getProvider("apple");
  const env = { BASE_URL: "https://myfenrir.com", APPLE_CLIENT_ID: "com.myfenrir.signin" };
  const idToken = `${b64url({ alg: "RS256" })}.${b64url({
    sub: "apple-sub-9",
    email: "priv@privaterelay.appleid.com",
    email_verified: "true",
  })}.sig`;

  const profile = await fetchProfile(p, "apple", env, { id_token: idToken }, JSON.stringify({ name: { firstName: "Ada", lastName: "Lovelace" } }));
  assert.equal(profile.provider, "apple");
  assert.equal(profile.sub, "apple-sub-9");
  assert.equal(profile.email, "priv@privaterelay.appleid.com");
  assert.equal(profile.name, "Ada Lovelace");
});
