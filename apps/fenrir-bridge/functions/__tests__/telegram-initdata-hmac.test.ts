import { describe, expect, it } from "vitest";
import {
  TelegramAuthError,
  TelegramConfigError,
  TelegramPayloadError,
  verifyTelegramLoginPayload
} from "../_lib/telegram-login";

const BOT_TOKEN = "123456:test-bot-token";

async function hmacHex(keyData: ArrayBuffer, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signMiniAppInitData(fields: Record<string, string>, token: string) {
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  // Per Telegram's Mini App spec: secret_key = HMAC_SHA256(key="WebAppData", data=bot_token).
  const secretKey = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", new TextEncoder().encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(token)
  );
  const hash = await hmacHex(secretKey, dataCheckString);
  return new URLSearchParams({ ...fields, hash }).toString();
}

async function signLoginWidget(fields: Record<string, string>, token: string) {
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secretKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = await hmacHex(secretKey, dataCheckString);
  return { ...fields, hash };
}

describe("verifyTelegramLoginPayload — Mini App initData (WebAppData secret)", () => {
  it("accepts initData signed with HMAC_SHA256(\"WebAppData\", bot_token)", async () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const user = JSON.stringify({ id: 42, first_name: "Ada", username: "ada_tg" });
    const initData = await signMiniAppInitData({ auth_date: authDate, user, query_id: "abc" }, BOT_TOKEN);

    const result = await verifyTelegramLoginPayload({ initData }, { TELEGRAM_BOT_TOKEN: BOT_TOKEN } as never);

    expect(result.id).toBe("42");
    expect(result.first_name).toBe("Ada");
    expect(result.username).toBe("ada_tg");
  });

  it("rejects initData signed with the Login Widget secret (would have silently failed before)", async () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const user = JSON.stringify({ id: 42, first_name: "Ada" });
    const dataCheckString = [`auth_date=${authDate}`, `user=${user}`].sort().join("\n");
    const wrongSecret = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(BOT_TOKEN));
    const wrongHash = await hmacHex(wrongSecret, dataCheckString);
    const initData = new URLSearchParams({ auth_date: authDate, user, hash: wrongHash }).toString();

    await expect(
      verifyTelegramLoginPayload({ initData }, { TELEGRAM_BOT_TOKEN: BOT_TOKEN } as never)
    ).rejects.toBeInstanceOf(TelegramAuthError);
  });

  it("rejects expired initData", async () => {
    const authDate = (Math.floor(Date.now() / 1000) - 60 * 60 * 25).toString();
    const user = JSON.stringify({ id: 42, first_name: "Ada" });
    const initData = await signMiniAppInitData({ auth_date: authDate, user }, BOT_TOKEN);

    await expect(
      verifyTelegramLoginPayload({ initData }, { TELEGRAM_BOT_TOKEN: BOT_TOKEN } as never)
    ).rejects.toBeInstanceOf(TelegramAuthError);
  });
});

describe("verifyTelegramLoginPayload — Login Widget (SHA256 secret)", () => {
  it("accepts a widget payload signed with SHA256(bot_token)", async () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const signed = await signLoginWidget(
      { id: "42", first_name: "Ada", auth_date: authDate },
      BOT_TOKEN
    );

    const result = await verifyTelegramLoginPayload(signed, { TELEGRAM_BOT_TOKEN: BOT_TOKEN } as never);

    expect(result.id).toBe("42");
    expect(result.first_name).toBe("Ada");
  });

  it("rejects a tampered widget payload", async () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const signed = await signLoginWidget(
      { id: "42", first_name: "Ada", auth_date: authDate },
      BOT_TOKEN
    );

    await expect(
      verifyTelegramLoginPayload({ ...signed, id: "43" }, { TELEGRAM_BOT_TOKEN: BOT_TOKEN } as never)
    ).rejects.toBeInstanceOf(TelegramAuthError);
  });
});

describe("verifyTelegramLoginPayload — config and payload guards", () => {
  it("throws TelegramConfigError when no bot token is configured", async () => {
    await expect(
      verifyTelegramLoginPayload({ hash: "deadbeef", id: "1", auth_date: "1" }, {} as never)
    ).rejects.toBeInstanceOf(TelegramConfigError);
  });

  it("throws TelegramConfigError when only the dev token is present without the opt-in flag", async () => {
    await expect(
      verifyTelegramLoginPayload(
        { hash: "deadbeef", id: "1", auth_date: "1" },
        { TELEGRAM_DEV_BOT_TOKEN: BOT_TOKEN } as never
      )
    ).rejects.toBeInstanceOf(TelegramConfigError);
  });

  it("throws TelegramPayloadError when the body has neither initData nor hash", async () => {
    await expect(
      verifyTelegramLoginPayload({}, { TELEGRAM_BOT_TOKEN: BOT_TOKEN } as never)
    ).rejects.toBeInstanceOf(TelegramPayloadError);
  });
});
