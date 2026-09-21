import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionPayload, signSession } from "../_lib/auth";
import { onRequestGet } from "../api/auth/community-sso";

const env = {
  SESSION_SECRET: "test-session-secret",
  SUPABASE_URL: "https://project-ref.supabase.co",
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
  it("hands Community a one-time Supabase token without a cross-subdomain refresh-token cookie", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hashed_token: "one-time-hash" }), { status: 200 }));

    const response = await onRequestGet({ request: await signedRequest(), env });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(`${location.origin}${location.pathname}${location.search}`).toBe(
      "https://communities.myfenrir.com/gate?onboarding=1",
    );
    const handoff = new URLSearchParams(location.hash.slice(1));
    expect(handoff.get("fenrir_handoff")).toBe("one-time-hash");
    expect(handoff.get("fenrir_handoff_type")).toBe("magiclink");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).not.toContain("sb-project-ref-auth-token");
    expect(cookies).not.toContain("access-secret");
    expect(cookies).not.toContain("refresh-secret");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe("https://myfenrir.com/auth/me");
    expect(fetchMock.mock.calls[1]?.[0]?.toString()).toBe(
      "https://project-ref.supabase.co/auth/v1/admin/generate_link",
    );
  });

  it("sends a signed-out visitor to MyFenrir sign-in carrying the handoff", async () => {
    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate%3Fonboarding%3D1",
    );
    const response = await onRequestGet({ request, env });
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(302);
    // The visitor authenticates on MyFenrir, not on the community's local form.
    expect(location.origin).toBe("https://myfenrir.com");
    expect(location.pathname).toBe("/login");
    const resume = new URL(location.searchParams.get("next")!, "https://www.myfenrir.com");
    expect(resume.pathname).toBe("/api/auth/community-sso");
    expect(resume.searchParams.get("next")).toBe("https://communities.myfenrir.com/gate?onboarding=1");
    expect(response.headers.get("set-cookie")).toContain("__Host-fenrir_community_sso_attempted=1");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("Domain=.myfenrir.com");
  });

  it("falls back to the visible login without looping when sign-in produced no session", async () => {
    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate%3Fonboarding%3D1",
      { headers: { Cookie: "__Host-fenrir_community_sso_attempted=1" } },
    );
    const response = await onRequestGet({ request, env });
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://communities.myfenrir.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("sso")).toBe("0");
    expect(location.searchParams.get("next")).toBe("/gate?onboarding=1");
  });

  it("rejects an external post-login redirect", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hashed_token: "one-time-hash" }), { status: 200 }),
      );

    const response = await onRequestGet({ request: await signedRequest("https://evil.example/steal"), env });
    const location = new URL(response.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe("https://communities.myfenrir.com/dashboard");
    expect(new URLSearchParams(location.hash.slice(1)).get("fenrir_handoff")).toBe("one-time-hash");
  });
});
