import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeLinkCode, type LinkCodeRow } from "../_lib/account-links";

const env = {
  SUPABASE_URL: "https://project-ref.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
};

const pendingRow: LinkCodeRow = {
  code: "LINK-ONE",
  supabase_user_id: "user-1",
  provider: "telegram",
  frisky_user_id: "frisky-1",
  frisky_org_id: "org-1",
  email: "member@example.com",
  status: "consumed",
  telegram_id: 12345,
  expires_at: "2099-01-01T00:00:00.000Z",
  consumed_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-09-01T00:00:00.000Z",
};

afterEach(() => vi.restoreAllMocks());

describe("consumeLinkCode", () => {
  it("claims pending -> consumed with a status-and-expiry conditional write", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([pendingRow]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "link-1" }]), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await consumeLinkCode(env, { code: "LINK-ONE", telegramId: 12345 });

    expect(result).toMatchObject({ ok: true, supabaseUserId: "user-1" });
    const [claimUrl, claimInit] = fetchMock.mock.calls[0];
    expect(String(claimUrl)).toContain("status=eq.pending");
    expect(String(claimUrl)).toContain("expires_at=gt.");
    expect(claimInit?.method).toBe("PATCH");
    expect(new Headers(claimInit?.headers).get("Prefer")).toBe("return=representation");
  });

  it("has only one winner when the conditional claim returns no row", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ status: "consumed", expires_at: pendingRow.expires_at }]), {
          status: 200,
        }),
      );

    await expect(
      consumeLinkCode(env, { code: "LINK-ONE", telegramId: 99999 }),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("conditionally restores the code when the canonical link write fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([pendingRow]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "conflict" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      consumeLinkCode(env, { code: "LINK-ONE", telegramId: 12345 }),
    ).resolves.toEqual({ ok: false, reason: "write_failed" });

    const [restoreUrl, restoreInit] = fetchMock.mock.calls[2];
    expect(String(restoreUrl)).toContain("status=eq.consumed");
    expect(String(restoreUrl)).toContain("telegram_id=eq.12345");
    expect(String(restoreUrl)).toContain("consumed_at=eq.");
    expect(restoreInit?.method).toBe("PATCH");
  });
});
