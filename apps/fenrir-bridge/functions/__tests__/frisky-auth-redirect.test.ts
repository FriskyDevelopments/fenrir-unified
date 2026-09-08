import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock("@frisky/auth/client", () => ({
  createFriskyAuthClient: () => ({ signIn: { social: client.social } }),
}));

import { signInWithFriskyAuth } from "../../src/services/friskyAuth";

describe("Better Auth browser return path", () => {
  beforeEach(() => client.social.mockReset().mockResolvedValue({ error: null }));
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "/\\evil.example", "//evil.example", "/auth/logout", "/api/auth/logout",
    "/api/frisky-auth/sign-out", "/main/../login",
  ])("uses the dashboard callback for unsafe next=%s", async (next) => {
    vi.stubGlobal("window", { location: new URL(`/login?next=${encodeURIComponent(next)}`, "https://myfenrir.com") });

    await signInWithFriskyAuth("google");

    expect(client.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "https://myfenrir.com/main" });
  });

  it.each([
    "/main/communities?view=members#pending",
    "/api/auth/community-sso?next=%2Fdashboard",
    "/api/telegram/link/start",
  ])("retains a safe requested destination %s", async (next) => {
    vi.stubGlobal("window", { location: new URL(`/login?next=${encodeURIComponent(next)}`, "https://myfenrir.com") });

    await signInWithFriskyAuth("apple");

    expect(client.social).toHaveBeenCalledWith({ provider: "apple", callbackURL: `https://myfenrir.com${next}` });
  });
});
