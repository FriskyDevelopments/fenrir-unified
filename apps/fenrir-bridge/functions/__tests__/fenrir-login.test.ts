import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as startTelegramLink } from "../api/telegram/link/start";
import { onRequestGet as startProviderLogin } from "../api/auth/login/[provider]";
import { onRequestGet as oauthCallback } from "../api/auth/callback/[provider]";
import { safeReturnPath } from "../_lib/oauth";
import {
  canonicalFenrirLoginUrl,
  isFenrirAuthWorkerReady,
  preservedLoginNext,
  TELEGRAM_LINK_START_PATH,
} from "../_lib/fenrir-login";

const liveHealthJson = { ok: true, service: "fenrir-auth-worker" };
const liveReady503 = {
  ready: false,
  database: false,
  session_backend: "kv",
  degraded: true,
  session_secret: false,
  providers: { google: false, microsoft: false, apple: false },
};
const readyGoogleOnly = {
  ready: false,
  database: true,
  providers: { google: true, microsoft: false, apple: false },
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubAuthFetch(ready: { status: number; body: unknown }, healthBody = liveHealthJson) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/ready")) return jsonResponse(ready.status, ready.body);
      if (url.includes("/auth/health")) return jsonResponse(200, healthBody);
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

const pagesGoogleEnv = {
  PUBLIC_SITE_URL: "https://www.myfenrir.com",
  ALLOWED_REDIRECT_URIS: "https://myfenrir.com,https://www.myfenrir.com",
  SESSION_SECRET: "test-session-secret",
  GOOGLE_CLIENT_ID: "placeholder-google-client-id",
  GOOGLE_CLIENT_SECRET: "placeholder-google-client-secret",
};

const pagesMicrosoftEnv = {
  PUBLIC_SITE_URL: "https://www.myfenrir.com",
  ALLOWED_REDIRECT_URIS: "https://myfenrir.com,https://www.myfenrir.com",
  SESSION_SECRET: "test-session-secret",
  MICROSOFT_CLIENT_ID: "placeholder-microsoft-client-id",
  MICROSOFT_CLIENT_SECRET: "placeholder-microsoft-client-secret",
};

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

  it("treats /auth/ready 200 with ready true or one social provider as live, not health liveness", () => {
    expect(isFenrirAuthWorkerReady(200, "application/json", { ready: true, providers: liveReady503.providers })).toBe(true);
    expect(isFenrirAuthWorkerReady(200, "application/json; charset=utf-8", readyGoogleOnly)).toBe(true);
    expect(isFenrirAuthWorkerReady(503, "application/json", liveReady503)).toBe(false);
    expect(isFenrirAuthWorkerReady(200, "application/json", liveReady503)).toBe(false);
    expect(isFenrirAuthWorkerReady(200, "application/json", liveHealthJson)).toBe(false);
    expect(isFenrirAuthWorkerReady(200, "text/html", { ready: true })).toBe(false);
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

  it("starts Google via Pages OAuth when /auth/health is 200 but /auth/ready is 503 with all providers false", async () => {
    stubAuthFetch({ status: 503, body: liveReady503 });

    const response = await startProviderLogin({
      params: { provider: "google" },
      request: new Request(
        "https://www.myfenrir.com/api/auth/login/google?return_to=/api/telegram/link/start",
      ),
      env: pagesGoogleEnv,
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain("redirect_uri=https%3A%2F%2Fwww.myfenrir.com%2Fapi%2Fauth%2Fcallback%2Fgoogle");
    expect(location).not.toContain("/auth/google");
  });

  it("keeps Pages OAuth if www /auth/ready is unready even when apex is ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("https://myfenrir.com/auth/ready")) return jsonResponse(200, readyGoogleOnly);
        if (url.startsWith("https://www.myfenrir.com/auth/ready")) return jsonResponse(503, liveReady503);
        if (url.includes("/auth/health")) return jsonResponse(200, liveHealthJson);
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const response = await startProviderLogin({
      params: { provider: "google" },
      request: new Request("https://www.myfenrir.com/api/auth/login/google?return_to=/main"),
      env: pagesGoogleEnv,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location") ?? "").toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(response.headers.get("Location") ?? "").not.toContain("/auth/google");
  });

  it("starts Microsoft via Pages OAuth on the same unready Worker", async () => {
    stubAuthFetch({ status: 503, body: liveReady503 });

    const response = await startProviderLogin({
      params: { provider: "microsoft" },
      request: new Request("https://www.myfenrir.com/api/auth/login/microsoft?return_to=/main"),
      env: pagesMicrosoftEnv,
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(location).toContain("redirect_uri=https%3A%2F%2Fwww.myfenrir.com%2Fapi%2Fauth%2Fcallback%2Fmicrosoft");
    expect(location).not.toContain("/auth/microsoft");
  });

  it("keeps Apple 410 on Pages while the Worker is unready", async () => {
    stubAuthFetch({ status: 503, body: liveReady503 });

    const response = await startProviderLogin({
      params: { provider: "apple" },
      request: new Request("https://www.myfenrir.com/api/auth/login/apple"),
      env: pagesGoogleEnv,
    });

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "direct_oauth_retired" });
  });

  it("starts Google on the Better Auth Worker when /auth/ready is 200 with one provider true", async () => {
    stubAuthFetch({ status: 200, body: readyGoogleOnly });

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
