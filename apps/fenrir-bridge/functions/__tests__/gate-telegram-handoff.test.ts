import { describe, expect, it } from "vitest";
import { verifyGateAccessToken } from "../../workers/fenrir-stars-payments.js";

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
});
