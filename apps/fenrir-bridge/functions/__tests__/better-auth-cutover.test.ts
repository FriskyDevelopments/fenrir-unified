import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../api/auth/login/[provider]";
import { onRequestPost as supabaseSession } from "../api/auth/supabase-session";
import { readSession } from "../_lib/auth";

describe("retired Pages login paths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("redirects /api/auth/login/:provider onto the Fenrir Better Auth Worker when that Worker is publicly routed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, service: "fenrir-auth-worker" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await onRequestGet({
      params: { provider: "google" },
      request: new Request("https://myfenrir.com/api/auth/login/google?return_to=/main"),
      env: {
        PUBLIC_SITE_URL: "https://myfenrir.com",
      },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://myfenrir.com/auth/google?redirect=%2Fmain");
  });

  it("returns 410 for the Authentic/Supabase session exchange", async () => {
    const response = await supabaseSession();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "supabase_proxy_retired" });
  });

  it("readSession prefers the AUTH service binding over the legacy cookie", async () => {
    const session = await readSession(
      new Request("https://myfenrir.com/api/auth/me", { headers: { Cookie: "fenrir_session=ignored" } }),
      {
        AUTH: {
          fetch: async () =>
            new Response(
              JSON.stringify({
                authenticated: true,
                user: { id: "google:sub-1", email: "ada@myfenrir.com", name: "Ada", provider: "google" },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        },
      },
    );

    expect(session?.email).toBe("ada@myfenrir.com");
    expect(session?.provider).toBe("google");
    expect(session?.frisky_user_id).toMatch(/^frisky_usr_/);
  });
});
