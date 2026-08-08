import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestGet as workosCallback } from "../api/auth/callback/workos";
import {
  onRequestGet as directCallback,
  onRequestPost as directCallbackPost
} from "../api/auth/callback/[provider]";
import { onRequestGet as directLogin } from "../api/auth/login/[provider]";
import { createStatePayload, stateSetCookie, type WorkOSEnv } from "../_lib/workos";
import { transactionSetCookie, type OAuthEnv, type OAuthTransaction } from "../_lib/oauth";
import {
  buildFetchRouter,
  cookiePair,
  hasCookieSet,
  jsonResponse,
  mintIdToken,
  setCookies
} from "./oauth-harness";

// These two suites exercise the production auth callbacks that previously could
// only be checked against the live network + Supabase. Both providers' token
// exchanges (and the Supabase profile upsert) are stubbed, so the flows run
// hermetically — no WorkOS, no Google, no Supabase, no network.

afterEach(() => {
  vi.unstubAllGlobals();
});

function call(handler: (context: any) => Promise<Response> | Response, context: any) {
  return Promise.resolve(handler(context));
}

describe("WorkOS AuthKit callback (needs WorkOS network, now mocked)", () => {
  const env: WorkOSEnv = {
    SESSION_SECRET: "test-session-secret-workos",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_API_KEY: "sk_test_workos",
    PUBLIC_SITE_URL: "https://app.example.test",
    ALLOWED_REDIRECT_URIS: "https://app.example.test"
  };

  it("validates state, exchanges the code, and mints the Fenrir session cookie", async () => {
    const router = buildFetchRouter([
      {
        when: "api.workos.com/user_management/authenticate",
        respond: () =>
          jsonResponse({
            user: { id: "wos_user_1", email: "bob@example.test", first_name: "Bob", last_name: "Stone" }
          })
      }
    ]);
    vi.stubGlobal("fetch", router.fetch);

    const state = createStatePayload("/locks");
    const stateCookie = cookiePair(await stateSetCookie(state, env));
    const request = new Request(
      `https://auth.example.test/api/auth/callback/workos?code=auth_code&state=${state.state}`,
      { headers: { Cookie: stateCookie } }
    );

    const response = await call(workosCallback, { request, env });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://app.example.test/locks");
    expect(hasCookieSet(response, "fenrir_session")).toBe(true);
    // State cookie is cleared on success.
    expect(setCookies(response).some((c) => c.startsWith("fenrir_workos_state=;"))).toBe(true);
    expect(router.calls).toHaveLength(1);
  });

  it("rejects a forged/mismatched state without exchanging the code", async () => {
    const router = buildFetchRouter([
      {
        when: "api.workos.com/user_management/authenticate",
        respond: () => jsonResponse({ user: { id: "x", email: "x@example.test" } })
      }
    ]);
    vi.stubGlobal("fetch", router.fetch);

    const state = createStatePayload("/locks");
    const stateCookie = cookiePair(await stateSetCookie(state, env));
    const request = new Request(
      "https://auth.example.test/api/auth/callback/workos?code=auth_code&state=not-the-real-state",
      { headers: { Cookie: stateCookie } }
    );

    const response = await call(workosCallback, { request, env });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/login?");
    expect(response.headers.get("Location")).toContain("auth_error=workos_state_invalid");
    expect(hasCookieSet(response, "fenrir_session")).toBe(false);
    // Token exchange must never run when state validation fails.
    expect(router.calls).toHaveLength(0);
  });
});

// MyFenrir identity is WorkOS-only. These tests are the regression guard for
// that decision: the direct Google/Microsoft/Apple stack that used to run
// alongside WorkOS on this host must stay dead, even with a fully configured
// environment and a valid-looking transaction cookie in hand.
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

  for (const provider of ["google", "microsoft", "apple"] as const) {
    it(`sends /api/auth/login/${provider} into WorkOS instead of the provider`, async () => {
      const router = buildFetchRouter([]);
      vi.stubGlobal("fetch", router.fetch);

      const request = new Request(`https://auth.example.test/api/auth/login/${provider}?return_to=/main`);
      const response = await call(directLogin, { request, env, params: { provider } });

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("Location") ?? "");
      expect(location.pathname).toBe("/api/auth/workos/login");
      expect(location.searchParams.get("provider")).toBe(provider);
      expect(location.searchParams.get("return_to")).toBe("/main");
      // No direct transaction cookie may be issued any more.
      expect(setCookies(response)).toHaveLength(0);
      expect(router.calls).toHaveLength(0);
    });
  }

  it("keeps /api/auth/login/workos pointing at the WorkOS entry point", async () => {
    const request = new Request("https://auth.example.test/api/auth/login/workos");
    const response = await call(directLogin, { request, env, params: { provider: "workos" } });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location") ?? "");
    expect(location.pathname).toBe("/api/auth/workos/login");
    // No provider hint: this is the plain AuthKit entry point.
    expect(location.searchParams.has("provider")).toBe(false);
  });

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
