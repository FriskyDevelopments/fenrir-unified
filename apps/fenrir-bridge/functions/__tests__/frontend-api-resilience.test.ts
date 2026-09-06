import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  complete: vi.fn(),
  hasCallback: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../src/services/supabaseAuth", () => ({
  completeSupabaseSession: supabase.complete,
  hasSupabaseCallbackInLocation: supabase.hasCallback,
  signInWithSupabase: supabase.signIn,
  signOutSupabase: supabase.signOut,
}));

import { appService, authService } from "../../src/services/api";
import { fetchWithTimeout, withDeadline } from "../../src/services/request";

describe("browser session and workspace recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Exercise production failures; the local demo fallback must never mask them.
    vi.stubEnv("DEV", false);
    vi.stubGlobal("window", { localStorage: { removeItem: vi.fn() } });
    supabase.complete.mockReset().mockResolvedValue(false);
    supabase.hasCallback.mockReset().mockReturnValue(false);
    supabase.signOut.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("distinguishes an unavailable session endpoint from a signed-out visitor", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "service_unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true, authenticated: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(authService.me()).rejects.toThrow("service_unavailable");
    await expect(authService.me()).resolves.toMatchObject({ data: { authenticated: false } });
  });

  it("aborts a stalled initial session request and allows a fresh retry", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const pending = expect(authService.me()).rejects.toThrow("request_timeout");

    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);

    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, authenticated: false }));
    await expect(authService.me()).resolves.toMatchObject({ data: { authenticated: false } });
  });

  it("bounds callback initialization even if the identity client never settles", async () => {
    supabase.hasCallback.mockReturnValue(true);
    supabase.complete.mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", vi.fn());
    const pending = expect(authService.me()).rejects.toThrow("session_timeout");

    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
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

  it("clears the server cookie while provider sign-out is pending and tolerates revocation failure after local cleanup", async () => {
    let rejectProvider!: (error: Error) => void;
    supabase.signOut.mockImplementation(() => new Promise((_, reject) => { rejectProvider = reject; }));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = authService.logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    rejectProvider(new Error("provider_unavailable_after_local_cleanup"));
    await expect(pending).resolves.toBeUndefined();
  });

  it("reports a failed server logout so the UI cannot claim the session ended", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "logout_unavailable" }, { status: 503 })));
    await expect(authService.logout()).rejects.toThrow("logout_unavailable");
    expect(supabase.signOut).toHaveBeenCalledOnce();
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
