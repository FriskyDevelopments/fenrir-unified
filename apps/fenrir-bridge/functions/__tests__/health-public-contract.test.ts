import { describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../api/health";

describe("public health contract", () => {
  it("returns liveness metadata without billing or provider configuration", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({
      request: new Request("https://www.myfenrir.com/api/health"),
      env: {
        STRIPE_SECRET_KEY: "configured-but-private",
        STRIPE_WEBHOOK_SECRET: "configured-but-private",
        DB: {},
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "fenrir-bridge-pages-functions",
      path: "/api/health",
      routeContract: {
        apiReturnsJson: true,
        unknownApiReturnsJson404: true,
        spaFallbackOwnsApi: false,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
