import { describe, expect, it } from "vitest";
import { onRequest } from "../api/frisky-auth/[[path]]";
import { onRequestGet as login } from "../api/auth/login/[provider]";
import { onRequestGet as communityProposal } from "../api/community-auth/proposal";
import {
  appleConfigured,
  authOptionsFromEnv,
  cookieDomainFromBaseURL,
  enabledFlag,
  enabledSocialProviders,
} from "@frisky/auth";

describe("@frisky/auth env helpers", () => {
  it("enables Google and Microsoft from complete credentials and keeps Apple off", () => {
    expect(
      enabledSocialProviders({
        GOOGLE_CLIENT_ID: "g",
        GOOGLE_CLIENT_SECRET: "gs",
        MICROSOFT_CLIENT_ID: "m",
        MICROSOFT_CLIENT_SECRET: "ms",
      }),
    ).toEqual(["google", "microsoft"]);
    expect(appleConfigured({})).toBe(false);
    expect(enabledFlag("1")).toBe(true);
    expect(enabledFlag("")).toBe(false);
  });

  it("does not treat Apple as live from a Services ID or community-gate p8 alone", () => {
    expect(appleConfigured({ APPLE_CLIENT_ID: "com.friskydev.myfenrir.web" })).toBe(false);
    expect(
      appleConfigured({
        APPLE_CLIENT_ID: "com.friskydev.myfenrir.web",
        APPLE_TEAM_ID: "TEAM",
        APPLE_KEY_ID: "KEY",
        APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----",
      }),
    ).toBe(false);
    expect(
      appleConfigured({
        APPLE_CLIENT_ID: "com.friskydev.myfenrir.web",
        APPLE_CLIENT_SECRET: "minted.apple.jwt",
      }),
    ).toBe(true);
  });

  it("scopes Better Auth cookies to myfenrir.com and never to pages.dev", () => {
    expect(cookieDomainFromBaseURL("https://www.myfenrir.com")).toBe("myfenrir.com");
    expect(cookieDomainFromBaseURL("https://auth.myfenrir.com")).toBe("myfenrir.com");
    expect(cookieDomainFromBaseURL("http://localhost:5173")).toBeUndefined();
    expect(cookieDomainFromBaseURL("https://preview.fenrir-bridge.pages.dev")).toBeUndefined();
  });

  it("maps Neon + secret into Better Auth options without inventing provider secrets", () => {
    const options = authOptionsFromEnv({
      env: {
        NEON_DATABASE_URL: "postgres://example/neon",
        SESSION_SECRET: "test-session-secret-value",
        GOOGLE_CLIENT_ID: "g",
        GOOGLE_CLIENT_SECRET: "gs",
      },
      database: { query: async () => ({}) },
      baseURL: "https://www.myfenrir.com",
    });
    expect(options.secret).toBe("test-session-secret-value");
    expect(options.socialProviders.google?.clientId).toBe("g");
    expect(options.socialProviders.apple).toBeUndefined();
    expect(options.trustedOrigins).toContain("https://www.myfenrir.com");
  });
});

describe("frisky-auth mount", () => {
  it("stays 503 until FRISKY_AUTH_ENABLED is set", async () => {
    const response = await onRequest({
      request: new Request("https://www.myfenrir.com/api/frisky-auth/ok"),
      env: { NEON_DATABASE_URL: "postgres://example/neon" },
      waitUntil() {},
      passThroughOnException() {},
      params: { path: "ok" },
      data: {},
      next: async () => new Response(null, { status: 404 }),
      functionPath: "/api/frisky-auth/[[path]]",
    } as Parameters<typeof onRequest>[0]);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "frisky_auth_not_enabled",
    });
  });

  it("does not boot Better Auth without Neon even when the flag is on", async () => {
    const response = await onRequest({
      request: new Request("https://www.myfenrir.com/api/frisky-auth/ok"),
      env: { FRISKY_AUTH_ENABLED: "1" },
      waitUntil() {},
      passThroughOnException() {},
      params: { path: "ok" },
      data: {},
      next: async () => new Response(null, { status: 404 }),
      functionPath: "/api/frisky-auth/[[path]]",
    } as Parameters<typeof onRequest>[0]);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "frisky_auth_missing_neon",
    });
  });
});

describe("legacy app login route", () => {
  it("returns use_frisky_auth when Better Auth is enabled", async () => {
    const response = await login({
      request: new Request("https://www.myfenrir.com/api/auth/login/google"),
      env: {
        FRISKY_AUTH_ENABLED: "1",
        GOOGLE_CLIENT_ID: "g",
        GOOGLE_CLIENT_SECRET: "gs",
      },
      params: { provider: "google" },
      waitUntil() {},
      passThroughOnException() {},
      data: {},
      next: async () => new Response(null, { status: 404 }),
      functionPath: "/api/auth/login/[provider]",
    } as Parameters<typeof login>[0]);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "use_frisky_auth",
    });
  });
});

describe("community gate stays a separate membership plane", () => {
  it("does not treat Better Auth, Authentik, or Firebase as community identity", async () => {
    const response = await communityProposal({ env: {} });
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      product: "fenrir-community-gate",
      auth: "fenrir_community_session",
      database: "neon",
      isolatedFrom: {
        friskyClientPortal: true,
        friskySessionCookie: "fenrir_session",
      },
      requiredEnv: ["FENRIR_COMMUNITY_AUTH_SECRET", "NEON_DATABASE_URL"],
    });
    expect(body.optionalEnv).toContain("FIREBASE_PROJECT_ID");
    expect(body.optionalEnv).not.toContain("BETTER_AUTH_SECRET");
  });
});
