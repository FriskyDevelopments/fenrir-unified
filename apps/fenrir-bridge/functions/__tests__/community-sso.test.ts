import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionPayload, signSession } from "../_lib/auth";
import { signCommunitySession } from "../_lib/community-auth";
import { onRequestGet } from "../api/auth/community-sso";

const env = {
  SESSION_SECRET: "test-session-secret",
  SUPABASE_URL: "https://project-ref.supabase.co",
  SUPABASE_ANON_KEY: "anon-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  FENRIR_COMMUNITY_AUTH_SECRET: "test-community-secret",
  NEON_DATABASE_URL: undefined as string | undefined,
};

async function signedRequest(
  next = "https://communities.myfenrir.com/gate?onboarding=1"
) {
  const token = await signSession(
    createSessionPayload({
      email: "member@example.com",
      name: "Fenrir Member",
      provider: "google",
      identityId: "member-1",
    }),
    env
  );
  return new Request(
    `https://www.myfenrir.com/api/auth/community-sso?next=${encodeURIComponent(
      next
    )}`,
    {
      headers: { Cookie: `fenrir_session=${token}` },
    }
  );
}

afterEach(() => vi.restoreAllMocks());

describe("community SSO", () => {
  it("turns a Fenrir session into a shared Supabase session and starts onboarding", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hashed_token: "one-time-hash" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-secret",
            refresh_token: "refresh-secret",
            expires_in: 3600,
            token_type: "bearer",
            user: { id: "supabase-user", email: "member@example.com" },
          }),
          { status: 200 }
        )
      );

    const response = await onRequestGet({
      request: await signedRequest(),
      env,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://communities.myfenrir.com/gate?onboarding=1"
    );
    expect(response.headers.get("location")).not.toContain("secret");
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("sb-project-ref-auth-token");
    expect(cookies).toContain("Domain=.myfenrir.com");
    expect(cookies).toContain("SameSite=Lax");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends a signed-out visitor to MyFenrir sign-in carrying the handoff", async () => {
    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate%3Fonboarding%3D1"
    );
    const response = await onRequestGet({ request, env });
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(302);
    // The visitor authenticates on MyFenrir, not on the community's local form.
    expect(location.origin).toBe("https://www.myfenrir.com");
    // Parked on an app route: safeReturnPath() refuses OAuth return_to at /api/auth/*.
    expect(location.pathname).toBe("/main");
    const resume = new URL(
      location.searchParams.get("next")!,
      "https://www.myfenrir.com"
    );
    expect(resume.pathname).toBe("/api/auth/community-sso");
    expect(resume.searchParams.get("next")).toBe(
      "https://communities.myfenrir.com/gate?onboarding=1"
    );
    expect(response.headers.get("set-cookie")).toContain(
      "fenrir_community_sso_attempted=1"
    );
  });

  it("falls back to the visible login without looping when sign-in produced no session", async () => {
    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate%3Fonboarding%3D1",
      { headers: { Cookie: "fenrir_community_sso_attempted=1" } }
    );
    const response = await onRequestGet({ request, env });
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://communities.myfenrir.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("sso")).toBe("0");
    expect(location.searchParams.get("next")).toBe("/gate?onboarding=1");
  });

  it("community session → mints a Supabase session and redirects", async () => {
    // No operator Fenrir session — only a community gate session cookie.
    const now = Math.floor(Date.now() / 1000);
    const communityToken = await signCommunitySession(
      {
        user_id: "comm-user-1",
        email: "gate@example.com",
        role: "member",
        access_status: "active",
        community_slug: "fenrir",
        community_org_id: null,
        iat: now,
        exp: now + 3600,
      },
      {
        ...env,
        FENRIR_COMMUNITY_AUTH_SECRET: "test-community-secret",
      } as Parameters<typeof signCommunitySession>[1]
    );

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hashed_token: "comm-hash" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "comm-access",
            refresh_token: "comm-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user: { id: "supabase-comm-user", email: "gate@example.com" },
          }),
          { status: 200 }
        )
      );

    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate",
      { headers: { Cookie: `fenrir_community_session=${communityToken}` } }
    );
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://communities.myfenrir.com/gate"
    );
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("sb-project-ref-auth-token");
    expect(cookies).toContain("Domain=.myfenrir.com");
  });

  it("community session → Supabase mint fails → falls back to community login", async () => {
    const now = Math.floor(Date.now() / 1000);
    const communityToken = await signCommunitySession(
      {
        user_id: "comm-user-2",
        email: "gate2@example.com",
        role: "member",
        access_status: "active",
        community_slug: "fenrir",
        community_org_id: null,
        iat: now,
        exp: now + 3600,
      },
      {
        ...env,
        FENRIR_COMMUNITY_AUTH_SECRET: "test-community-secret",
      } as Parameters<typeof signCommunitySession>[1]
    );

    // Supabase admin endpoint returns an error
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "user_not_found" }), { status: 422 })
    );

    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate",
      { headers: { Cookie: `fenrir_community_session=${communityToken}` } }
    );
    const response = await onRequestGet({ request, env });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    // Should redirect to community login, not loop back to MyFenrir
    expect(location.origin).toBe("https://communities.myfenrir.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("sso")).toBe("0");
  });

  it("Fenrir session + Supabase mint returns empty → inline mint throws → catch sends to community login", async () => {
    // Supabase env vars missing → mintSupabaseSharedSessionCookies returns [] (best-effort)
    // → code calls mintInlineSupabaseSession → required() throws missing_env:SUPABASE_URL
    // → outer catch returns fallbackResponse(next) → community /login
    const envNoSupabase = {
      SESSION_SECRET: env.SESSION_SECRET,
      FENRIR_COMMUNITY_AUTH_SECRET: env.FENRIR_COMMUNITY_AUTH_SECRET,
      // Deliberately omit SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
    };

    const token = await signSession(
      createSessionPayload({
        email: "operator@example.com",
        name: "Operator User",
        provider: "google",
        identityId: "op-1",
      }),
      env
    );
    const request = new Request(
      "https://www.myfenrir.com/api/auth/community-sso?next=https%3A%2F%2Fcommunities.myfenrir.com%2Fgate",
      { headers: { Cookie: `fenrir_session=${token}` } }
    );
    const response = await onRequestGet({ request, env: envNoSupabase });

    expect(response.status).toBe(302);
    // mintInlineSupabaseSession throws missing_env:SUPABASE_URL → caught → community login
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://communities.myfenrir.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("sso")).toBe("0");
  });

  it("rejects an external post-login redirect", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hashed_token: "one-time-hash" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "a",
            refresh_token: "r",
            user: { id: "u" },
          }),
          { status: 200 }
        )
      );

    const response = await onRequestGet({
      request: await signedRequest("https://evil.example/steal"),
      env,
    });
    expect(response.headers.get("location")).toBe(
      "https://communities.myfenrir.com/dashboard"
    );
  });
});
