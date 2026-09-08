import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeTelegramAccountLinkCode } from "../_lib/telegram-identity";
import { onRequestPost as confirmTelegramLink } from "../api/telegram/link/confirm";

afterEach(() => vi.restoreAllMocks());

describe("Telegram identity link concurrency", () => {
  it("claims the D1 mirror with one conditional UPDATE instead of read-then-write", async () => {
    const statements: string[] = [];
    const db = {
      prepare(query: string) {
        statements.push(query);
        return {
          bind() {
            return {
              first: async () =>
                query.startsWith("UPDATE")
                  ? null
                  : {
                      status: "claimed",
                      expires_at: "2099-01-01T00:00:00.000Z",
                    },
              run: async () => ({ success: true }),
            };
          },
        };
      },
    } as unknown as D1Database;

    await expect(
      consumeTelegramAccountLinkCode({}, db, "single-use-code", {
        telegramUserId: "123",
        telegramChatId: "123",
      })
    ).resolves.toEqual({ ok: false, reason: "not_found" });

    expect(statements[0]).toContain("UPDATE telegram_account_link_codes");
    expect(statements[0]).toContain("status = 'pending'");
    expect(statements[0]).toContain("expires_at > ?");
    expect(statements[0]).toContain("RETURNING");
    expect(statements[0]).not.toContain("SELECT");
  });

  it("fails closed when Supabase already consumed the code without consulting D1", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { status: "consumed", expires_at: "2099-01-01T00:00:00.000Z" },
          ]),
          { status: 200 }
        )
      );

    const response = await confirmTelegramLink({
      request: new Request("https://myfenrir.com/api/telegram/link/confirm", {
        method: "POST",
        headers: {
          Authorization: "Bearer internal-test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "already-consumed", telegramId: "999" }),
      }),
      env: {
        FENRIR_GATEKEEPER_INTERNAL_SECRET: "internal-test-secret",
        SUPABASE_URL: "https://project-ref.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-test",
        DB: {
          prepare() {
            throw new Error("D1 must not override a canonical rejection");
          },
        },
      },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
