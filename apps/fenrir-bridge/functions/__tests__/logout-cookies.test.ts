import { describe, expect, it } from "vitest";
import { sessionSetCookie } from "../_lib/auth";
import { onRequestPost } from "../api/auth/logout";

describe("logout cookie removal", () => {
  it.each(["https://myfenrir.com", "https://www.myfenrir.com"])(
    "expires the Supabase host cookie and legacy domain cookie on %s",
    async (origin) => {
      expect(sessionSetCookie("test-session")).not.toContain("Domain=");
      const response = await onRequestPost({
        request: new Request(`${origin}/api/auth/logout`, { method: "POST" }),
        env: { PUBLIC_SITE_URL: "https://www.myfenrir.com" },
      } as Parameters<typeof onRequestPost>[0]);
      const cookies = response.headers.getSetCookie();
      expect(cookies).toHaveLength(2);
      expect(cookies[0]).toMatch(/^fenrir_session=;.*Max-Age=0$/);
      expect(cookies[0]).not.toContain("Domain=");
      expect(cookies[1]).toContain("Domain=myfenrir.com");
      for (const cookie of cookies) {
        expect(cookie).toContain("Max-Age=0");
        expect(cookie).toContain("Path=/");
      }
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ ok: true });
    },
  );

  it("expires the host cookie on localhost without inventing a cookie domain", async () => {
    const response = await onRequestPost({
      request: new Request("http://localhost:8788/api/auth/logout", { method: "POST" }),
      env: {},
    } as Parameters<typeof onRequestPost>[0]);
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
  });
});
