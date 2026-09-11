import { describe, expect, it } from "vitest";
import { onRequestGet } from "../api/auth/login/[provider]";
import { onRequestGet as retiredCallbackGet, onRequestPost as retiredCallbackPost } from "../api/auth/callback/[provider]";
import { onRequestPost as supabaseSession } from "../api/auth/supabase-session";
import { createSessionPayload, readSession, signSession } from "../_lib/auth";

describe("retired Pages login paths", () => {
  it("redirects /api/auth/login/:provider onto the Fenrir Better Auth Worker", async () => {
    const response = await onRequestGet({
      params: { provider: "google" },
      request: new Request("https://myfenrir.com/api/auth/login/google?return_to=/main"),
      env: { PUBLIC_SITE_URL: "https://myfenrir.com" },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://myfenrir.com/auth/google?redirect=%2Fmain");
  });

  it.each(["https://evil.example/phish", "//evil.example/phish"])(
    "rejects non-local login return paths: %s",
    async (returnTo) => {
      const response = await onRequestGet({
        params: { provider: "google" },
        request: new Request(`https://myfenrir.com/api/auth/login/google?return_to=${encodeURIComponent(returnTo)}`),
        env: { PUBLIC_SITE_URL: "https://myfenrir.com" },
      });

      expect(response.headers.get("Location")).toBe("https://myfenrir.com/auth/google?redirect=%2Fmain");
    },
  );

  it("returns 410 for the Authentic/Supabase session exchange", async () => {
    const response = await supabaseSession();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "supabase_proxy_retired" });
  });

  it("retires both GET and form-post callbacks without processing provider data", async () => {
    for (const handler of [retiredCallbackGet, retiredCallbackPost]) {
      const response = await handler();
      expect(response.status).toBe(410);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({ error: "direct_oauth_retired" });
    }
  });

  it("rejects unsupported providers before constructing a Worker redirect", async () => {
    const response = await onRequestGet({
      params: { provider: "github" },
      request: new Request("https://myfenrir.com/api/auth/login/github"),
      env: { PUBLIC_SITE_URL: "https://myfenrir.com" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "unsupported_provider" });
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

  it("forwards both cookie and bearer credentials to the AUTH service binding", async () => {
    let forwarded: Request | undefined;
    await readSession(
      new Request("https://myfenrir.com/api/auth/me", {
        headers: { Cookie: "fenrir_session=cookie-token", Authorization: "Bearer api-token" },
      }),
      {
        AUTH: {
          fetch: async (request) => {
            forwarded = request;
            return Response.json({ authenticated: false });
          },
        },
      },
    );

    expect(forwarded?.url).toBe("https://myfenrir.com/auth/me");
    expect(forwarded?.headers.get("Cookie")).toBe("fenrir_session=cookie-token");
    expect(forwarded?.headers.get("Authorization")).toBe("Bearer api-token");
  });

  it("falls back to a valid legacy signed cookie when the AUTH binding is unavailable", async () => {
    const env = {
      SESSION_SECRET: "legacy-session-secret",
      AUTH: { fetch: async () => { throw new Error("binding unavailable"); } },
    };
    const legacy = createSessionPayload({
      email: "legacy@myfenrir.com",
      name: "Legacy User",
      provider: "apple",
      identityId: "apple:legacy",
    });
    const token = await signSession(legacy, env);
    const session = await readSession(new Request("https://myfenrir.com/api/auth/me", {
      headers: { Cookie: `fenrir_session=${token}` },
    }), env);

    expect(session).toEqual(legacy);
  });

  it("normalizes unknown Worker provider values instead of trusting arbitrary session data", async () => {
    const session = await readSession(new Request("https://myfenrir.com/api/auth/me"), {
      AUTH: {
        fetch: async () => Response.json({
          authenticated: true,
          user: { id: "external:one", email: "one@example.com", provider: "github" },
        }),
      },
    });

    expect(session?.provider).toBe("google");
    expect(session?.name).toBe("one@example.com");
  });
});
