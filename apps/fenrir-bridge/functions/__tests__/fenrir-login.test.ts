import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as startTelegramLink } from "../api/telegram/link/start";
import { onRequestGet as startProviderLogin } from "../api/auth/login/[provider]";
import { onRequestGet as oauthCallback } from "../api/auth/callback/[provider]";
import { safeReturnPath } from "../_lib/oauth";
import {
  canonicalFenrirLoginUrl,
  isFenrirAuthWorkerDocument,
  preservedLoginNext,
  TELEGRAM_LINK_START_PATH,
} from "../_lib/fenrir-login";

describe("fenrir login helpers", () => {
  it("builds the apex Better Auth login URL", () => {
    expect(canonicalFenrirLoginUrl(TELEGRAM_LINK_START_PATH)).toBe(
      "https://myfenrir.com/login?next=%2Fapi%2Ftelegram%2Flink%2Fstart",
    );
  });

  it("unwraps Telegram link-start from /login and /main next", () => {
    expect(preservedLoginNext("/api/telegram/link/start")).toBe("/api/telegram/link/start");
    expect(preservedLoginNext("/login?next=/api/telegram/link/start")).toBe("/api/telegram/link/start");
    expect(preservedLoginNext("/main?next=/api/telegram/link/start")).toBe("/api/telegram/link/start");
    expect(preservedLoginNext("/main")).toBeNull();
  });

  it("accepts Worker health JSON and rejects SPA HTML", () => {
    expect(
      isFenrirAuthWorkerDocument("application/json", {
        service: "fenrir-auth-worker",
        ready: true,
      }),
    ).toBe(true);
    expect(isFenrirAuthWorkerDocument("application/json; charset=utf-8", { ready: true })).toBe(true);
    expect(isFenrirAuthWorkerDocument("text/html", { service: "fenrir-auth-worker" })).toBe(false);
    expect(isFenrirAuthWorkerDocument("application/json", { ok: true })).toBe(false);
    expect(isFenrirAuthWorkerDocument("text/html", "<!doctype html>")).toBe(false);
  });
});

describe("canonical Fenrir Better Auth login for Telegram link-start", () => {
  it("sends unauthenticated www browsers to apex /login, never /main", async () => {
    const response = await startTelegramLink({
      request: new Request("https://www.myfenrir.com/api/telegram/link/start"),
      env: {},
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://myfenrir.com/login?next=%2Fapi%2Ftelegram%2Flink%2Fstart",
    );
    expect(response.headers.get("Location")).not.toContain("/main");
    expect(response.headers.get("Location")).not.toContain("www.myfenrir.com");
  });
});

describe("login next preservation", () => {
  it("keeps Telegram link-start through /login?next= so OAuth does not dump to /main", () => {
    expect(safeReturnPath("/login?next=/api/telegram/link/start")).toBe("/api/telegram/link/start");
    expect(safeReturnPath("/api/telegram/link/start")).toBe("/api/telegram/link/start");
    expect(safeReturnPath("/main")).toBe("/main");
  });

  it("keeps Community SSO through /login?next= so OAuth can resume the Gate", () => {
    const sso =
      "/api/auth/community-sso?next=" +
      encodeURIComponent("https://communities.myfenrir.com/gate?onboarding=1");
    expect(safeReturnPath(`/login?next=${encodeURIComponent(sso)}`)).toBe(sso);
    expect(safeReturnPath("/api/auth/logout")).toBe("/main");
  });
});

describe("Better Auth Worker vs live Pages OAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts Google via Pages OAuth when public /auth/ready is still SPA HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<!doctype html><title>MyFenrir</title>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      ),
    );

    const response = await startProviderLogin({
      params: { provider: "google" },
      request: new Request(
        "https://www.myfenrir.com/api/auth/login/google?return_to=/api/telegram/link/start",
      ),
      env: {
        PUBLIC_SITE_URL: "https://www.myfenrir.com",
        ALLOWED_REDIRECT_URIS: "https://myfenrir.com,https://www.myfenrir.com",
        SESSION_SECRET: "test-session-secret",
        GOOGLE_CLIENT_ID: "placeholder-google-client-id",
        GOOGLE_CLIENT_SECRET: "placeholder-google-client-secret",
      },
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain("redirect_uri=https%3A%2F%2Fwww.myfenrir.com%2Fapi%2Fauth%2Fcallback%2Fgoogle");
    expect(location).not.toContain("/auth/google");
  });

  it("keeps Pages Google OAuth when /auth/health is Worker JSON but /auth/ready is 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/auth/ready")) {
          return new Response(
            JSON.stringify({
              ready: false,
              service: "fenrir-auth-worker",
              providers: { google: false, microsoft: false, apple: false },
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify({ ok: true, service: "fenrir-auth-worker" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const response = await startProviderLogin({
      params: { provider: "google" },
      request: new Request("https://myfenrir.com/api/auth/login/google?return_to=/api/telegram/link/start"),
      env: {
        PUBLIC_SITE_URL: "https://myfenrir.com",
        ALLOWED_REDIRECT_URIS: "https://myfenrir.com,https://www.myfenrir.com",
        SESSION_SECRET: "test-session-secret",
        GOOGLE_CLIENT_ID: "placeholder-google-client-id",
        GOOGLE_CLIENT_SECRET: "placeholder-google-client-secret",
      },
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location).not.toContain("/auth/google");
  });

  it("starts Google on the Better Auth Worker when /auth/ready is 200 with a provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ready: true,
            service: "fenrir-auth-worker",
            providers: { google: true, microsoft: false, apple: false },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const response = await startProviderLogin({
      params: { provider: "google" },
      request: new Request("https://myfenrir.com/api/auth/login/google?return_to=/api/telegram/link/start"),
      env: {
        PUBLIC_SITE_URL: "https://myfenrir.com",
      },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://myfenrir.com/auth/google?redirect=%2Fapi%2Ftelegram%2Flink%2Fstart",
    );
  });

  it("keeps the Pages Google callback alive so live OAuth can finish before the Worker is routed", async () => {
    const response = await oauthCallback({
      params: { provider: "google" },
      request: new Request("https://www.myfenrir.com/api/auth/callback/google"),
      env: {
        PUBLIC_SITE_URL: "https://www.myfenrir.com",
        GOOGLE_CLIENT_ID: "placeholder-google-client-id",
        GOOGLE_CLIENT_SECRET: "placeholder-google-client-secret",
        SESSION_SECRET: "test-session-secret",
      },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/login?");
    expect(response.headers.get("Location")).toContain("auth_error=missing_code");
  });
});
