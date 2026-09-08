import { describe, expect, it } from "vitest";
import { computeReadiness } from "../_lib/readiness";

describe("production readiness", () => {
  it("accepts a verified Bot OS rail without duplicating bot secrets in Pages", () => {
    const snapshot = computeReadiness(
      {
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        MICROSOFT_CLIENT_ID: "microsoft-id",
        MICROSOFT_CLIENT_SECRET: "microsoft-secret",
        APPLE_CLIENT_ID: "apple-id",
        APPLE_TEAM_ID: "apple-team",
        APPLE_KEY_ID: "apple-key",
        APPLE_PRIVATE_KEY: "apple-private-key",
        DB: {},
        NEON_DATABASE_URL: "postgres://private"
      },
      { starsConfigured: true, webhookConfigured: true }
    );

    expect(snapshot.billing.telegramStarsConfigured).toBe(true);
    expect(snapshot.billing.telegramWebhookSecretConfigured).toBe(true);
    expect(snapshot.app.readyForPaidUsers).toBe(true);
  });

  it("accepts minimal non-Stripe path with only one primary auth provider + Telegram rail", () => {
    // Mirrors the relaxed go-live criteria: at least one OAuth (not all three)
    const snapshot = computeReadiness(
      {
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
        DB: {},
        NEON_DATABASE_URL: "postgres://private"
      },
      { starsConfigured: true, webhookConfigured: true }
    );

    expect(snapshot.auth.googleConfigured).toBe(true);
    expect(snapshot.auth.microsoftConfigured).toBe(false);
    expect(snapshot.app.readyForPaidUsers).toBe(true);
  });

  it("recognizes Apple credentials that generate the client secret at exchange time", () => {
    const snapshot = computeReadiness({
      APPLE_CLIENT_ID: "apple-id",
      APPLE_TEAM_ID: "apple-team",
      APPLE_KEY_ID: "apple-key",
      APPLE_PRIVATE_KEY: "apple-private-key",
    });

    expect(snapshot.auth.appleConfigured).toBe(true);
  });

  it.each(["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"] as const)(
    "requires %s for the community Apple exchange",
    (missing) => {
      const snapshot = computeReadiness({
        APPLE_CLIENT_ID: "apple-id",
        APPLE_TEAM_ID: "apple-team",
        APPLE_KEY_ID: "apple-key",
        APPLE_PRIVATE_KEY: "apple-private-key",
        APPLE_CLIENT_SECRET: "better-auth-only-secret",
        [missing]: " ",
      });

      expect(snapshot.auth.appleConfigured).toBe(false);
    },
  );
});
