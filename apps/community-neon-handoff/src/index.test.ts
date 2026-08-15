import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { testables, type Env } from "./index";

const env: Env = {
  QUALITY_HANDOFF_SECRET: "test-secret",
  CANONICAL_NEON_ORIGIN: "https://276df7c1.fenrir-bridge.pages.dev",
  QUALITY_ORIGIN: "https://quality.communities.myfenrir.com",
};

describe("Community Neon handoff edge", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("pins destinations to the Quality Gate", () => {
    expect(testables.safeDestination("https://quality.communities.myfenrir.com/g/5ccsgzpgsk", "https://quality.communities.myfenrir.com"))
      .toBe("https://quality.communities.myfenrir.com/g/5ccsgzpgsk");
    expect(testables.safeDestination("https://evil.example/g/5ccsgzpgsk", "https://quality.communities.myfenrir.com")).toBeNull();
    expect(testables.safeDestination("https://quality.communities.myfenrir.com/upgrade", "https://quality.communities.myfenrir.com")).toBeNull();
  });

  it("signs and verifies scoped tokens", async () => {
    const token = await testables.signedJson({ ok: true }, "test-secret");
    await expect(testables.verifiedJson(token, "test-secret")).resolves.toEqual({ ok: true });
    await expect(testables.verifiedJson(token, "wrong-secret")).resolves.toBeNull();
  });

  it("starts only canonical providers and pins the marker cookie", async () => {
    const response = await worker.fetch(new Request(
      "https://myfenrir.com/api/community-auth/quality-start?provider=microsoft&destination=https%3A%2F%2Fquality.communities.myfenrir.com%2Fg%2F5ccsgzpgsk",
    ), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/api/community-auth/oauth/microsoft?slug=fenrir");
    expect(response.headers.get("set-cookie")).toContain("fenrir_quality_handoff=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("proxies OAuth starts through the pinned canonical Neon deployment", async () => {
    const upstreamFetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: {
        Location: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "Set-Cookie": "fenrir_oauth_state=opaque; Path=/api/community-auth; HttpOnly; Secure; SameSite=Lax",
      },
    }));
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await worker.fetch(new Request(
      "https://myfenrir.com/api/community-auth/oauth/microsoft?slug=fenrir&return_to=%2Fcommunity%2Ffenrir",
    ), env);
    expect(upstreamFetch).toHaveBeenCalledOnce();
    expect((upstreamFetch.mock.calls[0]![0] as Request).url).toBe(
      "https://276df7c1.fenrir-bridge.pages.dev/api/community-auth/oauth/microsoft?slug=fenrir&return_to=%2Fcommunity%2Ffenrir",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("login.microsoftonline.com");
    expect(response.headers.get("set-cookie")).toContain("fenrir_oauth_state=");
  });

  it("rejects a handoff when the canonical Neon session is not authenticated", async () => {
    const now = Math.floor(Date.now() / 1000);
    const marker = await testables.signedJson({
      destination: "https://quality.communities.myfenrir.com/g/5ccsgzpgsk",
      nonce: "nonce-1",
      exp: now + 600,
    }, "quality-marker-v1:test-secret");
    const response = await worker.fetch(new Request("https://myfenrir.com/api/community-auth/quality-handoff", {
      headers: { Cookie: `fenrir_quality_handoff=${marker}` },
    }), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${env.QUALITY_ORIGIN}/login?error=handoff_invalid`);
  });

  it("mints a Quality token only after the canonical Neon session endpoint authenticates", async () => {
    const now = Math.floor(Date.now() / 1000);
    const marker = await testables.signedJson({
      destination: "https://quality.communities.myfenrir.com/g/5ccsgzpgsk",
      nonce: "nonce-2",
      exp: now + 600,
    }, "quality-marker-v1:test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      authenticated: true,
      user: { id: "user-1", email: "member@example.com" },
      communitySlug: "fenrir",
      communityOrgId: "myfenrir-core",
    })));
    const response = await worker.fetch(new Request("https://myfenrir.com/api/community-auth/quality-handoff", {
      headers: { Cookie: `fenrir_quality_handoff=${marker}; fenrir_community_session=opaque` },
    }), env);
    const callback = new URL(response.headers.get("location")!);
    expect(callback.pathname).toBe("/auth/neon-callback");
    const verified = await testables.verifiedJson<Record<string, unknown>>(
      callback.searchParams.get("token")!, "community-quality-handoff-v1:test-secret",
    );
    expect(verified).toMatchObject({ user_id: "user-1", email: "member@example.com", nonce: "nonce-2" });
  });
});
