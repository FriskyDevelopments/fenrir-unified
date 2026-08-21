import { afterEach, describe, expect, it, vi } from "vitest";
import { handleGateAccessStart, verifyGateAccessToken } from "../../workers/fenrir-stars-payments.js";

const secret = "test-gate-handoff-secret";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function tokenFor(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `gate_${payload}.${base64Url(signature.slice(0, 16))}`;
}

function privateGateMessage(telegramUserId = 8581086019) {
  return {
    chat: { id: telegramUserId, type: "private" },
    from: { id: telegramUserId },
  };
}

function telegramFetchMock(memberStatus: string | null = "left") {
  const calls: Array<{ method: string; body: any }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = url.split("/").pop() || "";
    const body = JSON.parse(String(init?.body || "{}"));
    calls.push({ method, body });

    if (method === "getMe") return Response.json({ ok: true, result: { id: 777 } });
    if (method === "getChatMember" && body.user_id === 777) {
      return Response.json({ ok: true, result: { status: "administrator", can_invite_users: true } });
    }
    if (method === "getChatMember") {
      return Response.json({ ok: true, result: { status: memberStatus } });
    }
    if (method === "createChatInviteLink") {
      return Response.json({ ok: true, result: { invite_link: "https://t.me/+oneUseGateInvite" } });
    }
    if (method === "sendMessage") return Response.json({ ok: true, result: { message_id: 1 } });
    return Response.json({ ok: false, description: "unexpected method" }, { status: 400 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gate-to-Telegram handoff", () => {
  it("accepts a compact signed ticket for its exact Telegram identity", async () => {
    const now = 1_800_000_000;
    const token = await tokenFor(`1.${(8581086019).toString(36)}.${(1001234567890).toString(36)}.${(now + 300).toString(36)}.abcdefg`);

    await expect(verifyGateAccessToken(secret, token, 8581086019, now)).resolves.toEqual({
      telegramUserId: 8581086019,
      chatId: "-1001234567890",
      expiresAt: now + 300,
    });
    expect(token.length).toBeLessThanOrEqual(64);
  });

  it("rejects tampered, expired, and wrong-account tickets", async () => {
    const now = 1_800_000_000;
    const valid = await tokenFor(`1.${(8581086019).toString(36)}.${(1001234567890).toString(36)}.${(now + 300).toString(36)}.abcdefg`);
    const expired = await tokenFor(`1.${(8581086019).toString(36)}.${(1001234567890).toString(36)}.${(now - 1).toString(36)}.abcdefg`);

    await expect(verifyGateAccessToken(secret, valid, 123, now)).resolves.toBeNull();
    await expect(verifyGateAccessToken(secret, `${valid.slice(0, -1)}x`, 8581086019, now)).resolves.toBeNull();
    await expect(verifyGateAccessToken(secret, expired, 8581086019, now)).resolves.toBeNull();
  });

  it("issues a one-use expiring invite only after bot permission and member checks pass", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await tokenFor(`1.${(8581086019).toString(36)}.${(1001234567890).toString(36)}.${(now + 300).toString(36)}.abcdefg`);
    const { calls } = telegramFetchMock("left");

    await expect(
      handleGateAccessStart(
        { FENRIR_GATE_ACCESS_SECRET: secret, TELEGRAM_BOT_TOKEN: "test-token" },
        "prod",
        privateGateMessage(),
        token,
      ),
    ).resolves.toBe(true);

    const inviteCall = calls.find((call) => call.method === "createChatInviteLink");
    expect(inviteCall?.body).toMatchObject({
      chat_id: "-1001234567890",
      member_limit: 1,
      creates_join_request: false,
    });
    expect(inviteCall?.body.expire_date).toBeLessThanOrEqual(now + 300);

    const finalMessage = calls.filter((call) => call.method === "sendMessage").at(-1)?.body.text;
    expect(finalMessage).toContain("one-use community invite");
    expect(finalMessage).toContain("https://t.me/+oneUseGateInvite");
  });

  it("does not create a fresh invite when the Telegram identity is already a member", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await tokenFor(`1.${(8581086019).toString(36)}.${(1001234567890).toString(36)}.${(now + 300).toString(36)}.abcdefg`);
    const { calls } = telegramFetchMock("member");

    await expect(
      handleGateAccessStart(
        { FENRIR_GATE_ACCESS_SECRET: secret, TELEGRAM_BOT_TOKEN: "test-token" },
        "prod",
        privateGateMessage(),
        token,
      ),
    ).resolves.toBe(true);

    expect(calls.some((call) => call.method === "createChatInviteLink")).toBe(false);
    expect(calls.filter((call) => call.method === "sendMessage").at(-1)?.body.text).toContain("already has access");
  });

  it("does not touch Telegram destination checks when the token is for another account", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await tokenFor(`1.${(8581086019).toString(36)}.${(1001234567890).toString(36)}.${(now + 300).toString(36)}.abcdefg`);
    const { calls } = telegramFetchMock("left");

    await expect(
      handleGateAccessStart(
        { FENRIR_GATE_ACCESS_SECRET: secret, TELEGRAM_BOT_TOKEN: "test-token" },
        "prod",
        privateGateMessage(123),
        token,
      ),
    ).resolves.toBe(true);

    expect(calls.map((call) => call.method)).toEqual(["sendMessage"]);
    expect(calls[0]?.body.text).toContain("expired or invalid");
  });
});
