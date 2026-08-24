import { describe, expect, it } from "vitest";
import { telegramCommunityId } from "../../workers/fenrir-stars-payments.js";

describe("Telegram destination sync contract", () => {
  it("derives a stable, selector-safe Community Bridge ID from a Telegram chat ID", () => {
    expect(telegramCommunityId("-1001234567890")).toBe("telegram-1001234567890");
    expect(telegramCommunityId(-1001234567890)).toBe("telegram-1001234567890");
  });
});
