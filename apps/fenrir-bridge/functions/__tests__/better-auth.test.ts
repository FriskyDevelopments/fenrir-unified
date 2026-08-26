import { describe, expect, it } from "vitest";

import {
  FRISKY_AUTH_ORIGIN,
  betterAuthOrigin,
  betterAuthEnabled,
  configuredBetterAuthProviders,
  constantTimeEqual,
  isFriskySocialProvider,
} from "../_lib/better-auth";

describe("central Better Auth contract", () => {
  it("advertises only fully configured providers", () => {
    expect(configuredBetterAuthProviders({
      GOOGLE_CLIENT_ID: "google",
      GOOGLE_CLIENT_SECRET: "secret",
      MICROSOFT_CLIENT_ID: "incomplete",
      APPLE_CLIENT_ID: "apple",
      APPLE_CLIENT_SECRET: "secret",
    })).toEqual(["google", "apple"]);
  });

  it("accepts only the supported social providers", () => {
    expect(isFriskySocialProvider("google")).toBe(true);
    expect(isFriskySocialProvider("microsoft")).toBe(true);
    expect(isFriskySocialProvider("apple")).toBe(true);
    expect(isFriskySocialProvider("authentik")).toBe(false);
    expect(isFriskySocialProvider("workos")).toBe(false);
  });

  it("uses the canonical auth origin and normalizes an override", () => {
    expect(betterAuthOrigin({})).toBe(FRISKY_AUTH_ORIGIN);
    expect(betterAuthOrigin({ BETTER_AUTH_URL: "https://auth.example.test/" })).toBe("https://auth.example.test");
  });

  it("requires an explicit activation flag", () => {
    expect(betterAuthEnabled({})).toBe(false);
    expect(betterAuthEnabled({ BETTER_AUTH_ENABLED: "true" })).toBe(true);
  });

  it("compares migration tokens without a length shortcut", () => {
    expect(constantTimeEqual("same-token", "same-token")).toBe(true);
    expect(constantTimeEqual("same-token", "other-token")).toBe(false);
    expect(constantTimeEqual("short", "a-much-longer-token")).toBe(false);
  });
});
