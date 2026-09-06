import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const friskyAuth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));

vi.mock("../../src/services/friskyAuth", () => ({
  signInWithFriskyAuth: friskyAuth.signIn,
  signOutFriskyAuthClient: friskyAuth.signOut,
}));

import { appService, authService } from "../../src/services/api";
import { postLoginDestination } from "../../src/routes/authGate";
import { fetchWithTimeout, withDeadline } from "../../src/services/request";

describe("browser session and workspace recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Exercise production failures; the local demo fallback must never mask them.
    vi.stubEnv("DEV", false);
    vi.stubGlobal("window", {
      location: new URL("https://myfenrir.com/main"),
      localStorage: { removeItem: vi.fn() },
    });
    friskyAuth.signOut.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("distinguishes an unavailable session endpoint from a signed-out visitor", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ authenticated: false }))
      .mockResolvedValueOnce(Response.json({ error: "service_unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ authenticated: false }))
      .mockResolvedValueOnce(Response.json({ ok: true, authenticated: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(authService.me()).rejects.toThrow("service_unavailable");
    await expect(authService.me()).resolves.toMatchObject({ data: { authenticated: false } });
  });

  it("aborts a stalled initial session request and allows a fresh retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ authenticated: false }))
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const pending = expect(authService.me()).rejects.toThrow("request_timeout");

    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);

    fetchMock
      .mockResolvedValueOnce(Response.json({ authenticated: false }))
      .mockResolvedValueOnce(Response.json({ ok: true, authenticated: false }));
    await expect(authService.me()).resolves.toMatchObject({ data: { authenticated: false } });
  });

  it("bounds the full Worker and Pages session fallback even when both stall", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const pending = expect(authService.me()).rejects.toThrow("session_timeout");

    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps an authenticated Worker identity when Pages hydration is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ authenticated: true, user: { id: "worker-user", email: "test@example.invalid", provider: "apple" } }))
      .mockResolvedValueOnce(Response.json({ error: "service_unavailable" }, { status: 503 })));
    await expect(authService.me()).resolves.toMatchObject({
      data: { authenticated: true, user: { id: "worker-user", authProvider: "apple" } },
    });
  });

  it("rejects malformed Pages session data instead of claiming the visitor is signed out", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ authenticated: false }))
      .mockResolvedValueOnce(Response.json({ ok: true })));
    await expect(authService.me()).rejects.toThrow("invalid_auth_response");
  });

  it("rejects a failed workspace load and returns the workspace on retry", async () => {
    const data = { user: { id: "test-user" }, org: { id: "test-org" }, domains: [] };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "database_unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true, data })));

    await expect(appService.load()).rejects.toThrow("database_unavailable");
    await expect(appService.load()).resolves.toEqual({ ok: true, data });
  });

  it("rejects an empty successful workspace response instead of looping on boot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: null })));
    await expect(appService.load()).rejects.toThrow("invalid_app_state");
  });

  it("includes a stalled JSON body in the workspace deadline", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = expect(appService.load()).rejects.toThrow("request_timeout");

    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("clears both server cookies while optional provider sign-out is pending", async () => {
    let rejectProvider!: (error: Error) => void;
    friskyAuth.signOut.mockImplementation(() => new Promise((_, reject) => { rejectProvider = reject; }));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = authService.logout();

    expect(fetchMock).toHaveBeenCalledWith("/auth/logout", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    rejectProvider(new Error("provider_unavailable"));
    await expect(pending).resolves.toBeUndefined();
  });

  it("reports a failed server logout so the UI cannot claim the session ended", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "logout_unavailable" }, { status: 503 })));
    await expect(authService.logout()).rejects.toThrow("logout_unavailable");
    expect(friskyAuth.signOut).toHaveBeenCalledOnce();
  });

  it("reports a failed Worker logout even if the Pages cookie clear succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true })));
    await expect(authService.logout()).rejects.toThrow("worker_logout_failed_503");
  });

  it("finishes both cookie clears when the optional client sign-out stalls", async () => {
    friskyAuth.signOut.mockReturnValue(new Promise(() => {}));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = expect(authService.logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows Pages logout in local development without the Worker", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "not_found" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ ok: true })));
    await expect(authService.logout()).resolves.toBeUndefined();
  });

  it("clears deadline timers after successful operations", async () => {
    await expect(withDeadline(Promise.resolve("ready"))).resolves.toBe("ready");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts timed-out provider fetches", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const pending = expect(fetchWithTimeout("https://auth.example.invalid/session")).rejects.toThrow("request_timeout");
    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe("standalone auth gate return path", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "/\\evil.example", "//evil.example", "https://evil.example", "/api/auth/logout",
    "/auth/callback", "/auth/logout", "/api/frisky-auth/sign-out", "/login", "/main/../login",
  ])("uses the dashboard fallback for unsafe next=%s", (next) => {
    vi.stubGlobal("window", { location: new URL(`/login?next=${encodeURIComponent(next)}`, "https://myfenrir.com") });
    expect(postLoginDestination()).toBe("/main");
  });

  it.each(["/main/communities?view=members#pending", "/api/auth/community-sso?next=%2Fdashboard"])(
    "preserves the safe destination %s", (next) => {
      vi.stubGlobal("window", { location: new URL(`/login?next=${encodeURIComponent(next)}`, "https://myfenrir.com") });
      expect(postLoginDestination()).toBe(next);
    },
  );
});
