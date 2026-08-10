import { describe, expect, it } from "vitest";

import { onRequestPost as logout } from "../api/auth/logout";
import { effectiveBillingPlanFromRow } from "../_lib/plan-catalog";

describe("session logout", () => {
  it("expires both host-only and parent-domain Fenrir cookies", async () => {
    const response = await logout({
      request: new Request("https://www.myfenrir.com/api/auth/logout", { method: "POST" }),
      env: { PUBLIC_SITE_URL: "https://www.myfenrir.com" }
    } as never);

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.every((cookie) => cookie.startsWith("fenrir_session=;") && cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((cookie) => !cookie.includes("Domain="))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes("Domain=myfenrir.com"))).toBe(true);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("entitlement mapping", () => {
  it.each(["active", "trialing", "past_due"])("keeps a verified paid plan for %s", (status) => {
    expect(effectiveBillingPlanFromRow({ plan: "pro", status })).toBe("pro");
  });

  it.each(["canceled", "incomplete", "unpaid"])("does not grant paid access for %s", (status) => {
    expect(effectiveBillingPlanFromRow({ plan: "operator", status })).toBe("free");
  });

  it("does not fabricate access from an unknown plan", () => {
    expect(effectiveBillingPlanFromRow({ plan: "enterprise", status: "active" })).toBe("free");
  });
});
