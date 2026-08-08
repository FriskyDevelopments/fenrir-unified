import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onRequestGet as communityStart } from "../api/community-auth/oauth/[provider]";
import { onRequestGet as communityCallback } from "../api/community-auth/oauth/callback/[provider]";
import {
  communityTransactionSetCookie,
  createCommunityOAuthTransaction,
  type OAuthTransaction
} from "../_lib/oauth";
import type { CommunityOAuthEnv } from "../_lib/community-oauth";
import { buildFetchRouter, cookiePair, hasCookieSet, jsonResponse, mintIdToken, setCookies } from "./oauth-harness";

// The community OAuth bridge resolves a brand from Neon and writes membership +
// session rows. We replace the Neon driver with an in-memory tagged-template
// fake (keyed by the SQL statement) so the real handler, gate, and PKCE/state
// crypto run unchanged with no database and no network.
const dbState = vi.hoisted(() => ({
  handler: (_query: string, _values: unknown[]) => [] as Array<Record<string, unknown>>
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" $ ");
      return Promise.resolve(dbState.handler(query, values));
    };
    return sql;
  }
}));

const SLUG = "stixmagic";

function baseEnv(): CommunityOAuthEnv {
  return {
    NEON_DATABASE_URL: "postgres://test-db/neon",
    FENRIR_COMMUNITY_AUTH_SECRET: "community-auth-secret",
    SESSION_SECRET: "test-session-secret-community",
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google-secret",
    PUBLIC_SITE_URL: "https://app.example.test"
  };
}

function brandRow(enabledProviders: string[]) {
  return {
    id: "community-1",
    org_id: "org-1",
    slug: SLUG,
    name: "STIX Magic",
    logo_url: null,
    mascot_url: null,
    background_url: null,
    primary_color: "#22c7a8",
    secondary_color: "#8cb9ff",
    accent_color: "#9b8cff",
    headline: "Join STIX Magic",
    subheadline: "Enter to continue.",
    invite_prefix: SLUG,
    enabled_auth_providers: enabledProviders,
    default_access_state: "active"
  };
}

/** Full happy-path DB: brand resolves, then user/membership/identity/session writes succeed. */
function happyPathDb(enabledProviders: string[]) {
  return (query: string) => {
    if (query.includes("from fenrir_gate_communities")) return [brandRow(enabledProviders)];
    if (query.includes("insert into fenrir_community_users")) {
      return [{ id: "user-1", email: "alice@example.test", role: "member", access_status: "pending" }];
    }
    if (query.includes("insert into fenrir_community_memberships")) {
      return [{ id: "membership-1", role: "member", status: "pending" }];
    }
    if (query.includes("insert into fenrir_community_oauth_identities")) return [];
    if (query.includes("insert into fenrir_community_sessions")) return [{ id: "session-1" }];
    return [];
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  dbState.handler = () => [];
});

describe("community OAuth start", () => {
  it("happy path: redirects to the provider authorize URL and sets the signed transaction cookie", async () => {
    dbState.handler = happyPathDb(["magic_link", "google"]);
    // No outbound calls expected during start — any fetch is a bug.
    const router = buildFetchRouter([]);
    vi.stubGlobal("fetch", router.fetch);

    const request = new Request(
      `https://app.example.test/api/community-auth/oauth/google?slug=${SLUG}&return_to=/community/${SLUG}`
    );
    const response = await communityStart({ request, env: baseEnv(), params: { provider: "google" } } as any);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth")).toBe(true);
    expect(location).toContain("code_challenge=");
    expect(location).toContain("code_challenge_method=S256");
    expect(hasCookieSet(response, "fenrir_community_oauth_tx")).toBe(true);
    expect(router.calls).toHaveLength(0);
  });

  it("provider_not_enabled gate: redirects to the community page with the gate error when the brand has not enabled the provider", async () => {
    // Brand exists but only enables magic_link — Google must be refused.
    dbState.handler = happyPathDb(["magic_link"]);
    const router = buildFetchRouter([]);
    vi.stubGlobal("fetch", router.fetch);

    const request = new Request(`https://app.example.test/api/community-auth/oauth/google?slug=${SLUG}`);
    const response = await communityStart({ request, env: baseEnv(), params: { provider: "google" } } as any);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toBe(`https://app.example.test/community/${SLUG}?auth_error=provider_not_enabled`);
    // The gate must not start an OAuth transaction when it refuses the provider.
    expect(hasCookieSet(response, "fenrir_community_oauth_tx")).toBe(false);
  });
});

describe("community OAuth callback", () => {
  async function mintGoogleToken(tx: OAuthTransaction, emailVerified: boolean) {
    return mintIdToken({
      iss: "https://accounts.google.com",
      aud: "google-client-id.apps.googleusercontent.com",
      sub: "google-sub-789",
      email: "alice@example.test",
      email_verified: emailVerified,
      name: "Alice Example",
      nonce: tx.nonce,
      exp: Math.floor(Date.now() / 1000) + 3600
    });
  }

  it("happy path: exchanges the code, provisions membership, and mints the community session", async () => {
    const env = baseEnv();
    dbState.handler = happyPathDb(["magic_link", "google"]);

    const tx = await createCommunityOAuthTransaction("google", env, {
      community: SLUG,
      returnTo: `/community/${SLUG}`
    });
    const { idToken, jwks } = await mintGoogleToken(tx, true);
    const router = buildFetchRouter([
      { when: "oauth2.googleapis.com/token", respond: () => jsonResponse({ id_token: idToken }) },
      { when: "/oauth2/v3/certs", respond: () => jsonResponse(jwks) }
    ]);
    vi.stubGlobal("fetch", router.fetch);

    const txCookie = cookiePair(await communityTransactionSetCookie(tx, env));
    const request = new Request(
      `https://app.example.test/api/community-auth/oauth/callback/google?code=auth_code&state=${tx.state}`,
      { headers: { Cookie: txCookie } }
    );

    const response = await communityCallback({ request, env, params: { provider: "google" } } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`https://app.example.test/community/${SLUG}`);
    expect(hasCookieSet(response, "fenrir_community_session")).toBe(true);
    // Transaction cookie is cleared after the exchange completes.
    expect(setCookies(response).some((c) => c.startsWith("fenrir_community_oauth_tx=;"))).toBe(true);
  });

  it("email_unverified rejection: refuses sign-in and never writes a session when the provider reports an unverified email", async () => {
    const env = baseEnv();
    dbState.handler = happyPathDb(["magic_link", "google"]);

    const tx = await createCommunityOAuthTransaction("google", env, {
      community: SLUG,
      returnTo: `/community/${SLUG}`
    });
    const { idToken, jwks } = await mintGoogleToken(tx, false);
    const router = buildFetchRouter([
      { when: "oauth2.googleapis.com/token", respond: () => jsonResponse({ id_token: idToken }) },
      { when: "/oauth2/v3/certs", respond: () => jsonResponse(jwks) }
    ]);
    vi.stubGlobal("fetch", router.fetch);

    const txCookie = cookiePair(await communityTransactionSetCookie(tx, env));
    const request = new Request(
      `https://app.example.test/api/community-auth/oauth/callback/google?code=auth_code&state=${tx.state}`,
      { headers: { Cookie: txCookie } }
    );

    const response = await communityCallback({ request, env, params: { provider: "google" } } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `https://app.example.test/community/${SLUG}?auth_error=email_unverified`
    );
    expect(hasCookieSet(response, "fenrir_community_session")).toBe(false);
    expect(setCookies(response).some((c) => c.startsWith("fenrir_community_oauth_tx=;"))).toBe(true);
  });
});
