import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
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

function stubFetch(t, routes) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const handler = routes[String(url)];
    if (!handler) throw new Error(`unexpected fetch ${url}`);
    return handler(opts);
  };
  return calls;
}

test("google: exchangeCode posts PKCE verifier + Fenrir callback", async (t) => {
  const p = getProvider("google");
  const env = {
    BASE_URL: "https://myfenrir.com",
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
  };

  const calls = stubFetch(t, {
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
  assert.ok(calls[0].opts.signal instanceof AbortSignal);

  const profile = await fetchProfile(p, "google", env, tokens, null);
  assert.ok(calls[1].opts.signal instanceof AbortSignal);
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

test("apple callback rejects missing or mismatched OIDC nonce", async (t) => {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const pem = derToPem(new Uint8Array(pkcs8), "PRIVATE KEY");
  const oauthState = memoryOAuthState();
  const env = {
    BASE_URL: "https://myfenrir.com",
    SESSION_SECRET: "test-secret",
    APPLE_CLIENT_ID: "com.myfenrir.signin",
    APPLE_TEAM_ID: "TEAM123456",
    APPLE_KEY_ID: "KEY1234567",
    APPLE_PRIVATE_KEY: pem,
    OAUTH_STATE: oauthState,
  };
  let tokenNonce;
  stubFetch(t, {
    "https://appleid.apple.com/auth/token": () => {
      const claims = { sub: "apple-sub-9" };
      if (tokenNonce !== undefined) claims.nonce = tokenNonce;
      return Response.json({ id_token: `${b64url({ alg: "RS256" })}.${b64url(claims)}.sig` });
    },
  });

  for (const nonce of [undefined, "wrong-nonce"]) {
    tokenNonce = nonce;
    const start = await worker.fetch(new Request("https://myfenrir.com/auth/apple"), env);
    const state = new URL(start.headers.get("Location")).searchParams.get("state");
    const callback = await worker.fetch(
      new Request(`https://myfenrir.com/auth/apple/callback?code=CODE&state=${state}`),
      env,
    );
    assert.equal(callback.status, 400);
    assert.equal((await callback.json()).error, "invalid_or_expired_state");
  }
});

function derToPem(der, label) {
  const b64 = Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

function memoryOAuthState() {
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
