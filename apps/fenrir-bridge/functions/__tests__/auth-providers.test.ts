import { describe, expect, it } from "vitest";
import { onRequestGet } from "../api/auth/providers";

describe("public auth provider capabilities", () => {
  it("advertises only providers backed by complete runtime credentials", async () => {
    const response = await onRequestGet({
      env: {
        MICROSOFT_CLIENT_ID: "microsoft-client-id",
        MICROSOFT_CLIENT_SECRET: "microsoft-client-secret",
        GOOGLE_CLIENT_ID: "incomplete-google-client",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      engine: "legacy-direct-oauth",
      identity: "legacy-direct-oauth",
      authentik: "retired",
      appleLive: false,
      providers: ["microsoft"],
    });
  });

  it("fails closed when no provider is configured", async () => {
    const response = await onRequestGet({ env: {} });

    await expect(response.json()).resolves.toEqual({
      ok: true,
      engine: "legacy-direct-oauth",
      identity: "legacy-direct-oauth",
      authentik: "retired",
      appleLive: false,
      providers: [],
    });
  });

  it("keeps retired Authentik hidden despite leftover credentials and the old flag", async () => {
    const response = await onRequestGet({
      env: {
        AUTHENTIK_ENABLED: "true",
        AUTHENTIK_ISSUER: "https://authentik.example/application/o/fenrir/",
        AUTHENTIK_CLIENT_ID: "old-client",
        AUTHENTIK_CLIENT_SECRET: "old-secret",
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      authentik: "retired",
      providers: ["google"],
    });
  });

  it("does not advertise the retired direct-app Apple callback", async () => {
    const response = await onRequestGet({
      env: {
        APPLE_CLIENT_ID: "apple-id",
        APPLE_TEAM_ID: "apple-team",
        APPLE_KEY_ID: "apple-key",
        APPLE_PRIVATE_KEY: "community-p8",
        APPLE_CLIENT_SECRET: "better-auth-secret",
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      engine: "legacy-direct-oauth",
      appleLive: false,
      providers: [],
    });
  });

  it("advertises Apple for Better Auth using its pre-signed client secret", async () => {
    const response = await onRequestGet({
      env: {
        FRISKY_AUTH_ENABLED: "1",
        APPLE_CLIENT_ID: "apple-id",
        APPLE_CLIENT_SECRET: "better-auth-secret",
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      engine: "better-auth",
      appleLive: true,
      providers: ["apple"],
    });
  });

  it("does not advertise Apple from community-gate p8 when Better Auth is on", async () => {
    const response = await onRequestGet({
      env: {
        FRISKY_AUTH_ENABLED: "1",
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        APPLE_CLIENT_ID: "com.friskydev.myfenrir.web",
        APPLE_TEAM_ID: "TEAM",
        APPLE_KEY_ID: "KEY",
        APPLE_PRIVATE_KEY: "p8-not-a-better-auth-secret",
      },
    });

    await expect(response.json()).resolves.toMatchObject({
      engine: "better-auth",
      appleLive: false,
      providers: ["google"],
    });
  });

  it("advertises Better Auth engine and Google+Microsoft when enabled", async () => {
    const response = await onRequestGet({
      env: {
        FRISKY_AUTH_ENABLED: "1",
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        MICROSOFT_CLIENT_ID: "microsoft-id",
        MICROSOFT_CLIENT_SECRET: "microsoft-secret",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      engine: "better-auth",
      identity: "better-auth+neon-app_auth",
      authentik: "retired",
      appleLive: false,
      providers: ["google", "microsoft"],
    });
  });
});
