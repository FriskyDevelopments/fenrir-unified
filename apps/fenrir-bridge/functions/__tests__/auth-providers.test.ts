import { describe, expect, it } from "vitest";
import { onRequestGet } from "../api/auth/providers";

describe("public auth provider capabilities", () => {
  it("advertises only providers backed by complete runtime credentials", async () => {
    const response = await onRequestGet({
      env: {
        BETTER_AUTH_ENABLED: "true",
        MICROSOFT_CLIENT_ID: "microsoft-client-id",
        MICROSOFT_CLIENT_SECRET: "microsoft-client-secret",
        GOOGLE_CLIENT_ID: "incomplete-google-client",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      engine: "better-auth",
      providers: ["microsoft"],
    });
  });

  it("fails closed when no provider is configured", async () => {
    const response = await onRequestGet({ env: { BETTER_AUTH_ENABLED: "true" } });

    await expect(response.json()).resolves.toEqual({ ok: true, engine: "better-auth", providers: [] });
  });
});
