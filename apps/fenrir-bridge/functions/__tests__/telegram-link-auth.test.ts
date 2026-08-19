import { describe, expect, it, vi } from "vitest";

// The anonymous boundary must resolve before any D1 or Telegram-link work.
vi.mock("../_lib/auth", () => ({
  readSession: vi.fn().mockResolvedValue(null)
}));

import { onRequestGet, onRequestPost } from "../api/telegram/link";

function context(method: "GET" | "POST") {
  return {
    request: new Request("https://www.myfenrir.com/api/telegram/link", { method }),
    env: {}
  } as unknown as Parameters<typeof onRequestGet>[0];
}

describe("Telegram identity-link boundary", () => {
  it("rejects an anonymous GET before reading D1", async () => {
    const response = await onRequestGet(context("GET"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "authentication_required" });
  });

  it("rejects an anonymous POST before it can issue a link code", async () => {
    const response = await onRequestPost(context("POST"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "authentication_required" });
  });
});
