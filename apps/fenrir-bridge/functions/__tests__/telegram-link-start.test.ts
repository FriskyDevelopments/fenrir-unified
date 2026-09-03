import { describe, expect, it } from "vitest";
import { onRequestGet } from "../api/telegram/link/start";
import { onRequestPost } from "../api/telegram/link";
import { onRequest as dispatchApi } from "../api/[[path]]";

const sessionCookie = "fenrir_session=test-session";

describe("FriskyDev Telegram link-start", () => {
  it("sends unauthenticated browsers to Better Auth /login, not /main", async () => {
    const response = await onRequestGet({
      request: new Request("https://www.myfenrir.com/api/telegram/link/start"),
      env: {},
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("https://myfenrir.com/login?");
    expect(location).toContain("next=%2Fapi%2Ftelegram%2Flink%2Fstart");
    expect(location).not.toContain("/main");
    expect(location).not.toContain("www.myfenrir.com");
  });

  it("mints a bot deep-link when Better Auth session is present", async () => {
    const binds: unknown[][] = [];
    const env = {
      FENRIR_TELEGRAM_BOT_USERNAME: "Myfenrir_bot",
      AUTH: {
        fetch: async (request: Request) => {
          expect(request.headers.get("Cookie")).toBe(sessionCookie);
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: {
                id: "google:sub-1",
                email: "ada@myfenrir.com",
                name: "Ada",
                provider: "google",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      },
      DB: {
        prepare() {
          return {
            bind(...values: unknown[]) {
              binds.push(values);
              return {
                run: async () => ({ success: true }),
              };
            },
          };
        },
      },
    };

    const response = await onRequestGet({
      request: new Request("https://www.myfenrir.com/api/telegram/link/start", {
        headers: { Cookie: sessionCookie },
      }),
      env,
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/^https:\/\/t\.me\/Myfenrir_bot\?start=link_[a-z0-9]+$/i);
    expect(binds.length).toBe(1);
  });

  it("POST /api/telegram/link stays authentication_required without fenrir_session", async () => {
    const response = await onRequestPost({
      request: new Request("https://www.myfenrir.com/api/telegram/link", { method: "POST" }),
      env: {},
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "authentication_required",
    });
  });

  it("POST /api/telegram/link completes against a Worker fenrir_session", async () => {
    const env = {
      FENRIR_TELEGRAM_BOT_USERNAME: "Myfenrir_bot",
      AUTH: {
        fetch: async (request: Request) => {
          expect(request.headers.get("Cookie")).toBe(sessionCookie);
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: {
                id: "google:sub-1",
                email: "ada@myfenrir.com",
                name: "Ada",
                provider: "google",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      },
      DB: {
        prepare() {
          return {
            bind() {
              return {
                run: async () => ({ success: true }),
              };
            },
          };
        },
      },
    };

    const response = await onRequestPost({
      request: new Request("https://www.myfenrir.com/api/telegram/link", {
        method: "POST",
        headers: { Cookie: sessionCookie },
      }),
      env,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.url).toMatch(/^https:\/\/t\.me\/Myfenrir_bot\?start=link_/i);
  });

  it("rejects HEAD link routes without invoking their stateful handlers", async () => {
    for (const path of ["/api/telegram/link/start", "/api/telegram/link"]) {
      const response = await dispatchApi({
        request: new Request(`https://www.myfenrir.com${path}`, { method: "HEAD" }),
        env: {
          AUTH: {
            fetch: async () => {
              throw new Error("AUTH.fetch must not be called");
            },
          },
          DB: {
            prepare: () => {
              throw new Error("DB.prepare must not be called");
            },
          },
        },
      });

      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toContain("GET");
    }
  });
});
