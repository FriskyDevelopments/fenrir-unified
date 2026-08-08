import { afterEach, describe, expect, it, vi } from "vitest";

import {
  onRequestGet as directCallback,
  onRequestPost as directCallbackPost
} from "../api/auth/callback/[provider]";
import { onRequestGet as directLogin } from "../api/auth/login/[provider]";
import { transactionSetCookie, type OAuthEnv, type OAuthTransaction } from "../_lib/oauth";
import {
  buildFetchRouter,
  cookiePair,
  hasCookieSet,
  jsonResponse,
  mintIdToken,
  setCookies
} from "./oauth-harness";

// MyFenrir sign-in is Supabase-only (signInWithOAuth from the client). These
// suites are the regression guard for that decision: no server-side login
// initiation may reach an identity provider or external broker, and the
// retired per-provider callbacks must stay dead — even with a fully
// configured environment and a valid-looking transaction cookie in hand.

afterEach(() => {
  vi.unstubAllGlobals();
});

function call(handler: (context: any) => Promise<Response> | Response, context: any) {
  return Promise.resolve(handler(context));
}

describe("Server-side login initiation is retired (Supabase-only sign-in)", () => {
  const env: OAuthEnv = {
    SESSION_SECRET: "test-session-secret-direct",
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-secret",
    PUBLIC_SITE_URL: "https://app.example.test",
    PUBLIC_AUTH_URL: "https://auth.example.test",
    ALLOWED_REDIRECT_URIS: "https://app.example.test"
  };

  for (const provider of ["google", "microsoft", "apple"] as const) {
    it(`sends /api/auth/login/${provider} to the login screen, never to a provider`, async () => {
      const router = buildFetchRouter([]);
      vi.stubGlobal("fetch", router.fetch);

      const request = new Request(`https://auth.example.test/api/auth/login/${provider}?return_to=/main`);
      const response = await call(directLogin, { request, env, params: { provider } });

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("Location") ?? "");
      expect(location.origin).toBe("https://auth.example.test");
      expect(location.pathname).toBe("/login");
      // No transaction cookie may be issued, and no network may be touched.
      expect(setCookies(response)).toHaveLength(0);
      expect(router.calls).toHaveLength(0);
    });
  }
});

describe("Retired direct OAuth stack (Google/Microsoft/Apple)", () => {
  // Deliberately fully configured — direct OAuth credentials AND the shared
  // Supabase project are present. A configured environment must not be enough
  // to bring the legacy path back to life.
  const env: OAuthEnv = {
    SESSION_SECRET: "test-session-secret-direct",
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-secret",
    PUBLIC_SITE_URL: "https://app.example.test",
    PUBLIC_AUTH_URL: "https://auth.example.test",
    ALLOWED_REDIRECT_URIS: "https://app.example.test",
    SUPABASE_URL: "https://proj.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
  };

  function makeTransaction(): OAuthTransaction {
    return {
      provider: "google",
      state: "tx-state-token",
      verifier: "tx-pkce-verifier",
      nonce: "tx-nonce-value",
      returnTo: "/main",
      exp: Math.floor(Date.now() / 1000) + 600
    };
  }

  it("refuses to mint a session on the retired callback, even with a valid transaction", async () => {
    const tx = makeTransaction();
    const { idToken, jwks } = await mintIdToken({
      iss: "https://accounts.google.com",
      aud: env.GOOGLE_CLIENT_ID,
      sub: "google-sub-123",
      email: "alice@example.test",
      email_verified: true,
      name: "Alice Example",
      nonce: tx.nonce,
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    // Every endpoint the legacy flow used to reach is stubbed and reachable.
    // The assertion is that none of them is called.
    const router = buildFetchRouter([
      { when: "oauth2.googleapis.com/token", respond: () => jsonResponse({ id_token: idToken }) },
      { when: "/oauth2/v3/certs", respond: () => jsonResponse(jwks) },
      { when: "proj.supabase.co/rest/v1/profiles", respond: () => jsonResponse([{ id: "google-sub-123" }]) }
    ]);
    vi.stubGlobal("fetch", router.fetch);

    const txCookie = cookiePair(await transactionSetCookie(tx, env));
    const request = new Request(
      `https://auth.example.test/api/auth/callback/google?code=auth_code&state=${tx.state}`,
      { headers: { Cookie: txCookie } }
    );

    const response = await call(directCallback, { request, env, params: { provider: "google" } });

    expect(response.status).toBe(410);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("direct_oauth_retired");
    // No Fenrir session cookie; the stale transaction cookie is cleared.
    const cookies = setCookies(response);
    expect(cookies.some((c) => c.startsWith("fenrir_session="))).toBe(false);
    expect(cookies.some((c) => c.startsWith("fenrir_oauth_tx=;"))).toBe(true);
    // No token exchange, and above all no write into the shared Supabase project.
    expect(router.calls).toHaveLength(0);
    expect(hasCookieSet(response, "fenrir_session")).toBe(false);
  });

  it("also refuses the Apple form_post callback", async () => {
    const router = buildFetchRouter([]);
    vi.stubGlobal("fetch", router.fetch);

    const body = new URLSearchParams({ code: "auth_code", state: "tx-state-token" });
    const request = new Request("https://auth.example.test/api/auth/callback/apple", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const response = await call(directCallbackPost, { request, env, params: { provider: "apple" } });

    expect(response.status).toBe(410);
    expect(router.calls).toHaveLength(0);
  });
});
