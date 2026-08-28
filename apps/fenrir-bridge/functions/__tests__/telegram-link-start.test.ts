import { describe, expect, it } from "vitest";
import { onRequestGet } from "../api/telegram/link/start";

describe("FriskyDev Telegram link-start", () => {
  it("sends unauthenticated browsers to Better Auth /login, not /main", async () => {
    const response = await onRequestGet({
      request: new Request("https://www.myfenrir.com/api/telegram/link/start"),
      env: {},
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("https://www.myfenrir.com/login?");
    expect(location).toContain("next=%2Fapi%2Ftelegram%2Flink%2Fstart");
    expect(location).not.toContain("/main");
  });

  it("mints a bot deep-link when Better Auth session is present", async () => {
    const binds: unknown[][] = [];
    const env = {
      FENRIR_TELEGRAM_BOT_USERNAME: "Myfenrir_bot",
      AUTH: {
        fetch: async () =>
          new Response(
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
          ),
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
      request: new Request("https://www.myfenrir.com/api/telegram/link/start"),
      env,
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/^https:\/\/t\.me\/Myfenrir_bot\?start=link_[a-z0-9]+$/i);
    expect(binds.length).toBe(1);
  });
});
