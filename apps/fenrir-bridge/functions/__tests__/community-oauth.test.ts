/**
 * Hermetic tests for the Community Bridge OAuth flow.
 *
 * Everything here runs without network, without Neon, and without provider credentials:
 * it covers the parts of the bridge that are decided before any database round trip —
 * return-path safety, provider gating, the signed transaction cookie, and the callback
 * error paths. The remaining leg (code exchange → Neon session) needs real console
 * credentials and is covered by the manual steps in docs/COMMUNITY_OAUTH_RUNBOOK.md.
 *
 * Run: npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCommunityTransactionCookie,
  communityTransactionSetCookie,
  createCommunityOAuthTransaction,
  getAuthorizationUrl,
  isCommunityOAuthProvider,
  readCommunityOAuthTransaction,
  safeCommunityReturnPath,
  type OAuthEnv
} from "../_lib/oauth.ts";
import {
  availableCommunityAuthProviders,
  communityOAuthCallbackPath,
  handleCommunityOAuthCallback,
  handleCommunityOAuthStart,
  type CommunityOAuthEnv
} from "../_lib/community-oauth.ts";

const ORIGIN = "https://www.myfenrir.com";

/** Env shaped like production, with placeholder credentials — never a real secret. */
function testEnv(overrides: Partial<CommunityOAuthEnv> = {}): CommunityOAuthEnv {
  return {
    SESSION_SECRET: "test-session-secret",
    PUBLIC_SITE_URL: ORIGIN,
    NEON_DATABASE_URL: "postgres://placeholder/neon",
    FENRIR_COMMUNITY_AUTH_SECRET: "test-community-secret",
    GOOGLE_CLIENT_ID: "placeholder-google-client-id",
    GOOGLE_CLIENT_SECRET: "placeholder-google-client-secret",
    ...overrides
  } as CommunityOAuthEnv;
}

/** Turn a Set-Cookie header into the Cookie header a browser would send back. */
function cookieHeaderFrom(setCookie: string) {
  return setCookie.split(";", 1)[0]!;
}

function requestWithCookie(url: string, cookie: string, init: RequestInit = {}) {
  return new Request(url, { ...init, headers: { ...(init.headers as object), Cookie: cookie } });
}

test("safeCommunityReturnPath only allows relative /community paths", () => {
  assert.equal(safeCommunityReturnPath("/community/fenrir"), "/community/fenrir");
  assert.equal(safeCommunityReturnPath("/community/fenrir?x=1"), "/community/fenrir?x=1");
  // Open-redirect and protocol-relative attempts collapse to the site root.
  assert.equal(safeCommunityReturnPath("https://evil.tld/community/fenrir"), "/");
  assert.equal(safeCommunityReturnPath("//evil.tld/community/fenrir"), "/");
  assert.equal(safeCommunityReturnPath("/main"), "/");
  assert.equal(safeCommunityReturnPath(null), "/");
});

test("workos is not a community provider", () => {
  assert.equal(isCommunityOAuthProvider("google"), true);
  assert.equal(isCommunityOAuthProvider("microsoft"), true);
  assert.equal(isCommunityOAuthProvider("apple"), true);
  // The Neon provider check constraint would reject it.
  assert.equal(isCommunityOAuthProvider("workos"), false);
  assert.equal(isCommunityOAuthProvider("telegram"), false);
});

test("availableCommunityAuthProviders reflects bound credentials", () => {
  assert.deepEqual(availableCommunityAuthProviders(testEnv()), ["magic_link", "google"]);
  assert.deepEqual(
    availableCommunityAuthProviders(testEnv({ GOOGLE_CLIENT_SECRET: undefined })),
    ["magic_link"]
  );
  const allThree = availableCommunityAuthProviders(testEnv({
    MICROSOFT_CLIENT_ID: "x",
    MICROSOFT_CLIENT_SECRET: "x",
    APPLE_CLIENT_ID: "x",
    APPLE_TEAM_ID: "x",
    APPLE_KEY_ID: "x",
    APPLE_PRIVATE_KEY: "x"
  }));
  assert.deepEqual(allThree, ["magic_link", "google", "microsoft", "apple"]);
});

test("transaction cookie round-trips the community slug", async () => {
  const env = testEnv();
  const tx = await createCommunityOAuthTransaction("google", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });
  const setCookie = await communityTransactionSetCookie(tx, env);
  const request = requestWithCookie(`${ORIGIN}/api/community-auth/oauth/callback/google`, cookieHeaderFrom(setCookie));

  const restored = await readCommunityOAuthTransaction(request, env);
  assert.ok(restored);
  assert.equal(restored.community, "fenrir");
  assert.equal(restored.provider, "google");
  assert.equal(restored.state, tx.state);
  assert.equal(restored.verifier, tx.verifier);
});

test("a tampered or foreign-signed transaction cookie is rejected", async () => {
  const env = testEnv();
  const tx = await createCommunityOAuthTransaction("google", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });
  const setCookie = await communityTransactionSetCookie(tx, env);
  const cookie = cookieHeaderFrom(setCookie);

  // Same payload, signature from a different secret.
  const forged = await communityTransactionSetCookie(tx, testEnv({ SESSION_SECRET: "attacker" }));
  assert.equal(
    await readCommunityOAuthTransaction(
      requestWithCookie(`${ORIGIN}/x`, cookieHeaderFrom(forged)),
      env
    ),
    null
  );

  // Flipped payload byte, original signature.
  const [name, value] = cookie.split("=", 2) as [string, string];
  const [payload, signature] = value.split(".") as [string, string];
  const mutated = `${name}=${payload.slice(0, -1)}${payload.at(-1) === "A" ? "B" : "A"}.${signature}`;
  assert.equal(
    await readCommunityOAuthTransaction(requestWithCookie(`${ORIGIN}/x`, mutated), env),
    null
  );
});

test("an expired transaction cookie is rejected", async () => {
  const env = testEnv();
  const tx = await createCommunityOAuthTransaction("google", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });
  const expired = { ...tx, exp: Math.floor(Date.now() / 1000) - 1 };
  const setCookie = await communityTransactionSetCookie(expired, env);
  assert.equal(
    await readCommunityOAuthTransaction(
      requestWithCookie(`${ORIGIN}/x`, cookieHeaderFrom(setCookie)),
      env
    ),
    null
  );
});

test("Apple gets SameSite=None so its cross-site form_post carries the cookie", async () => {
  const env = testEnv();
  const appleTx = await createCommunityOAuthTransaction("apple", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });
  const googleTx = await createCommunityOAuthTransaction("google", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });

  const appleCookie = await communityTransactionSetCookie(appleTx, env);
  const googleCookie = await communityTransactionSetCookie(googleTx, env);

  assert.match(appleCookie, /SameSite=None/);
  assert.match(appleCookie, /Secure/);
  assert.match(googleCookie, /SameSite=Lax/);
  for (const cookie of [appleCookie, googleCookie]) {
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Path=\/api\/community-auth/);
  }
});

test("clearing the transaction cookie expires it on the same path", () => {
  const cleared = clearCommunityTransactionCookie();
  assert.match(cleared, /^fenrir_community_oauth_tx=;/);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Path=\/api\/community-auth/);
});

test("the authorization URL carries PKCE, state, nonce and the bridge callback", async () => {
  const env = testEnv();
  const tx = await createCommunityOAuthTransaction("google", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });
  const callback = `${ORIGIN}${communityOAuthCallbackPath("google")}`;
  const url = new URL(await getAuthorizationUrl("google", env, callback, tx));

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("redirect_uri"), "https://www.myfenrir.com/api/community-auth/oauth/callback/google");
  assert.equal(url.searchParams.get("client_id"), "placeholder-google-client-id");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), tx.state);
  assert.equal(url.searchParams.get("nonce"), tx.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  // The challenge is the hash, never the raw verifier.
  assert.ok(url.searchParams.get("code_challenge"));
  assert.notEqual(url.searchParams.get("code_challenge"), tx.verifier);
});

test("callback paths are the ones registered in the provider consoles", () => {
  assert.equal(communityOAuthCallbackPath("google"), "/api/community-auth/oauth/callback/google");
  assert.equal(communityOAuthCallbackPath("microsoft"), "/api/community-auth/oauth/callback/microsoft");
  assert.equal(communityOAuthCallbackPath("apple"), "/api/community-auth/oauth/callback/apple");
});

test("start rejects workos, a bad slug, and an unconfigured provider", async () => {
  const env = testEnv();

  const workos = await handleCommunityOAuthStart({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/workos?slug=fenrir`),
    env,
    provider: "workos"
  });
  assert.equal(workos.status, 404);

  const badSlug = await handleCommunityOAuthStart({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/google?slug=NOT+A+SLUG`),
    env,
    provider: "google"
  });
  assert.equal(badSlug.status, 400);

  // No credentials: bounce back to the gate instead of throwing a 500 at the visitor.
  const unconfigured = await handleCommunityOAuthStart({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/apple?slug=fenrir`),
    env,
    provider: "apple"
  });
  assert.equal(unconfigured.status, 302);
  assert.equal(
    unconfigured.headers.get("Location"),
    `${ORIGIN}/community/fenrir?auth_error=provider_not_configured`
  );
});

test("start 503s when the community bridge itself is not configured", async () => {
  const response = await handleCommunityOAuthStart({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/google?slug=fenrir`),
    env: testEnv({ NEON_DATABASE_URL: undefined }),
    provider: "google"
  });
  assert.equal(response.status, 503);
});

test("callback surfaces a provider error without touching the database", async () => {
  const response = await handleCommunityOAuthCallback({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/callback/google?error=access_denied`),
    env: testEnv(),
    provider: "google"
  });
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${ORIGIN}/community/unknown?auth_error=access_denied`
  );
  assert.match(response.headers.get("Set-Cookie") ?? "", /fenrir_community_oauth_tx=;/);
});

test("callback without a code redirects with missing_code", async () => {
  const response = await handleCommunityOAuthCallback({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/callback/google`),
    env: testEnv(),
    provider: "google"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("Location") ?? "", /auth_error=missing_code$/);
});

test("callback with no transaction cookie fails closed on state", async () => {
  const response = await handleCommunityOAuthCallback({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/callback/google?code=abc&state=xyz`),
    env: testEnv(),
    provider: "google"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("Location") ?? "", /auth_error=oauth_state_missing$/);
});

test("callback rejects a state that does not match the transaction", async () => {
  const env = testEnv();
  const tx = await createCommunityOAuthTransaction("google", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });
  const cookie = cookieHeaderFrom(await communityTransactionSetCookie(tx, env));

  const response = await handleCommunityOAuthCallback({
    request: requestWithCookie(`${ORIGIN}/api/community-auth/oauth/callback/google?code=abc&state=not-the-state`, cookie),
    env,
    provider: "google"
  });
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${ORIGIN}/community/fenrir?auth_error=oauth_state_invalid`
  );
});

test("callback rejects a transaction minted for a different provider", async () => {
  const env = testEnv({ MICROSOFT_CLIENT_ID: "x", MICROSOFT_CLIENT_SECRET: "x" });
  const tx = await createCommunityOAuthTransaction("google", env, {
    community: "fenrir",
    returnTo: "/community/fenrir"
  });
  const cookie = cookieHeaderFrom(await communityTransactionSetCookie(tx, env));

  const response = await handleCommunityOAuthCallback({
    request: requestWithCookie(
      `${ORIGIN}/api/community-auth/oauth/callback/microsoft?code=abc&state=${encodeURIComponent(tx.state)}`,
      cookie
    ),
    env,
    provider: "microsoft"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("Location") ?? "", /auth_error=oauth_provider_mismatch$/);
});

test("callback reads Apple's form_post body", async () => {
  const env = testEnv({
    APPLE_CLIENT_ID: "x",
    APPLE_TEAM_ID: "x",
    APPLE_KEY_ID: "x",
    APPLE_PRIVATE_KEY: "x"
  });
  const body = new URLSearchParams({ error: "user_cancelled_authorize" });
  const response = await handleCommunityOAuthCallback({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/callback/apple`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }),
    env,
    provider: "apple"
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("Location") ?? "", /auth_error=user_cancelled_authorize$/);
});

test("callback rejects workos outright", async () => {
  const response = await handleCommunityOAuthCallback({
    request: new Request(`${ORIGIN}/api/community-auth/oauth/callback/workos?code=abc`),
    env: testEnv(),
    provider: "workos"
  });
  assert.equal(response.status, 404);
});
