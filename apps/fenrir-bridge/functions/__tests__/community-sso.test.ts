import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionPayload, signSession } from "../_lib/auth";
import { onRequestGet } from "../api/auth/community-sso";

const env = {
  SESSION_SECRET: "test-session-secret",
  SUPABASE_URL: "https://project-ref.supabase.co",
  SUPABASE_ANON_KEY: "anon-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
};

async function signedRequest(next = "https://communities.myfenrir.com/gate?onboarding=1") {
  const token = await signSession(
    createSessionPayload({
      email: "member@example.com",
      name: "Fenrir Member",
      provider: "google",
      identityId: "member-1",
    }),
    env,
  );
  return new Request(`https://www.myfenrir.com/api/auth/community-sso?next=${encodeURIComponent(next)}`, {
    headers: { Cookie: `fenrir_session=${token}` },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("community SSO", () => {
  it("turns a Fenrir session into a shared Supabase session and starts onboarding", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ hashed_token: "one-time-hash" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-secret",
            refresh_token: "refresh-secret",
            expires_in: 3600,
            token_type: "bearer",
            user: { id: "supabase-user", email: "member@example.com" },
          }),
          { status: 200 },
        ),
      );

    const response = await onRequestGet({ request: await signedRequest(), env });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://communities.myfenrir.com/gate?onboarding=1");
    expect(response.headers.get("location")).not.toContain("secret");
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("sb-project-ref-auth-token");
    expect(cookies).toContain("Domain=.myfenrir.com");
    expect(cookies).toContain("SameSite=Lax");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the visible login without looping when no dashboard session exists", async () => {
    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate%3Fonboarding%3D1",
    );
    const response = await onRequestGet({ request, env });
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://communities.myfenrir.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("sso")).toBe("0");
    expect(location.searchParams.get("next")).toBe("/gate?onboarding=1");
    expect(response.headers.get("set-cookie")).toContain("fenrir_community_sso_attempted=1");
  });

  it("rejects an external post-login redirect", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ hashed_token: "one-time-hash" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "a", refresh_token: "r", user: { id: "u" } }),
          { status: 200 },
        ),
      );

    const response = await onRequestGet({ request: await signedRequest("https://evil.example/steal"), env });
    expect(response.headers.get("location")).toBe("https://communities.myfenrir.com/dashboard");
  });
});
