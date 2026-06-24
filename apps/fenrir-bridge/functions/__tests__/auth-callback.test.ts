import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestGet as workosCallback } from "../api/auth/callback/workos";
import { onRequestGet as directCallback } from "../api/auth/callback/[provider]";
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

  it("does not leak the upstream WorkOS error body into the user-visible redirect URL", async () => {
    const SECRET_ISH = "client_secret_echoed_back_or_internal_trace_id_xyz";
    const router = buildFetchRouter([
      {
        when: "api.workos.com/user_management/authenticate",
        respond: () => jsonResponse({ message: SECRET_ISH }, 400)
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
    const location = response.headers.get("Location") ?? "";
    // Stable code only — the raw upstream body must not appear in the URL.
    expect(location).toContain("auth_error=workos_token_exchange_failed");
    expect(location).not.toContain(SECRET_ISH);
    expect(hasCookieSet(response, "fenrir_session")).toBe(false);
  });

  it("maps an unexpected (non-allowlisted) error to a generic code in the redirect URL", async () => {
    // Force an unexpected throw AFTER state validation by returning a body that
    // makes exchangeCodeForSession throw a non-allowlisted message path.
    const router = buildFetchRouter([
      {
        when: "api.workos.com/user_management/authenticate",
        // 200 OK but missing user → throws "workos_missing_email" (allowlisted),
        // so instead return malformed JSON to trigger a generic parse error.
        respond: () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } })
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
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("auth_error=workos_exchange_failed");
  });
});

describe("Direct Google OAuth callback (needs Google network + Supabase, now mocked)", () => {
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

  it("verifies the id_token, upserts the Supabase profile, and redirects to session transfer", async () => {
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

    const ACCOUNT_UUID = "99999999-8888-7777-6666-555555555555";
    const router = buildFetchRouter([
      { when: "oauth2.googleapis.com/token", respond: () => jsonResponse({ id_token: idToken }) },
      { when: "/oauth2/v3/certs", respond: () => jsonResponse(jwks) },
      { when: "proj.supabase.co/rest/v1/profiles", respond: () => jsonResponse([{ id: "google-sub-123" }]) },
      // Fenrir Protocol: the direct OAuth callback must also resolve the
      // canonical Supabase auth.users UUID (parity with the WorkOS callback).
      {
        when: "proj.supabase.co/auth/v1/admin/users",
        respond: () => jsonResponse({ users: [{ id: ACCOUNT_UUID, email: "alice@example.test" }] })
      }
    ]);
    vi.stubGlobal("fetch", router.fetch);

    const txCookie = cookiePair(await transactionSetCookie(tx, env));
    const request = new Request(
      `https://auth.example.test/api/auth/callback/google?code=auth_code&state=${tx.state}`,
      { headers: { Cookie: txCookie } }
    );

    const response = await call(directCallback, { request, env, params: { provider: "google" } });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("https://app.example.test/api/auth/complete?token=");
    // Transaction cookie is cleared after a successful exchange.
    expect(setCookies(response).some((c) => c.startsWith("fenrir_oauth_tx=;"))).toBe(true);

    // The Supabase profile upsert is the network call this test exists to mock.
    const supabaseCall = router.calls.find((c) => c.url.includes("proj.supabase.co/rest/v1/profiles"));
    expect(supabaseCall).toBeDefined();
    expect((supabaseCall?.init as RequestInit | undefined)?.method).toBe("POST");

    // The canonical account id must end up inside the session-transfer token.
    expect(router.calls.some((c) => c.url.includes("/auth/v1/admin/users"))).toBe(true);
    const location = response.headers.get("Location") ?? "";
    const token = decodeURIComponent(new URL(location).searchParams.get("token") ?? "");
    const encodedBody = token.split(".")[0];
    const transfer = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(encodedBody.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
      )
    ) as { session?: { frisky_account_id?: string } };
    expect(transfer.session?.frisky_account_id).toBe(ACCOUNT_UUID);
  });

  it("does not block login when the Supabase admin account API is unreachable", async () => {
    const tx = makeTransaction();
    const { idToken, jwks } = await mintIdToken({
      iss: "https://accounts.google.com",
      aud: env.GOOGLE_CLIENT_ID,
      sub: "google-sub-err",
      email: "err@example.test",
      email_verified: true,
      name: "Err Example",
      nonce: tx.nonce,
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const router = buildFetchRouter([
      { when: "oauth2.googleapis.com/token", respond: () => jsonResponse({ id_token: idToken }) },
      { when: "/oauth2/v3/certs", respond: () => jsonResponse(jwks) },
      { when: "proj.supabase.co/rest/v1/profiles", respond: () => jsonResponse([{ id: "google-sub-err" }]) },
      // Admin API errors out — login must still complete (no frisky_account_id).
      { when: "proj.supabase.co/auth/v1/admin/users", respond: () => jsonResponse({ error: "boom" }, 500) }
    ]);
    vi.stubGlobal("fetch", router.fetch);

    const txCookie = cookiePair(await transactionSetCookie(tx, env));
    const request = new Request(
      `https://auth.example.test/api/auth/callback/google?code=auth_code&state=${tx.state}`,
      { headers: { Cookie: txCookie } }
    );

    const response = await call(directCallback, { request, env, params: { provider: "google" } });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/api/auth/complete?token=");
  });

  it("returns 410 when the provider's direct OAuth credentials are not configured", async () => {
    const router = buildFetchRouter([]);
    vi.stubGlobal("fetch", router.fetch);

    const unconfigured: OAuthEnv = { ...env, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined };
    const request = new Request("https://auth.example.test/api/auth/callback/google?code=x&state=y");

    const response = await call(directCallback, { request, env: unconfigured, params: { provider: "google" } });

    expect(response.status).toBe(410);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("direct_oauth_disabled");
    expect(router.calls).toHaveLength(0);
  });
});
