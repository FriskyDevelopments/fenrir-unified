import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../api/[[path]]";

function verifyGrant() {
  return onRequest({
    request: new Request("https://myfenrir.com/api/verification/grant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant: "synthetic-grant", context: "synthetic-context" }),
    }),
    env: {},
  });
}

describe("verification grant availability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([408, 429, 500, 503])("reports upstream %s as retryable unavailability", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ verified: false }, { status })));
    const response = await verifyGrant();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ verified: false, error: "verification_unavailable" });
  });

  it("preserves a verifier rejection as a failed proof", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ verified: false }, { status: 400 })));
    const response = await verifyGrant();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ verified: false, error: "verification_grant_rejected" });
  });
});
