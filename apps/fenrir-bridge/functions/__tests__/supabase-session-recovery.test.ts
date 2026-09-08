import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the browser auth service in the hermetic Functions runner. The SDK,
// browser storage/history and outbound fetch are all local fakes.
const sdk = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  stopAutoRefresh: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: sdk.createClient }));

const destinationKey = "fenrir_post_auth_destination";
const signedOutKey = "fenrir_auth_signed_out";
const sessionKey = "sb-fenrir-test-auth-token";
const callbackKeys = [
  "code", "error", "error_description", "state", "scope", "access_token",
  "id_token", "refresh_token", "token_type", "expires_in",
];

let browser: {
  location: URL;
  localStorage: Storage;
  history: { replaceState: ReturnType<typeof vi.fn> };
};
let fetchMock: ReturnType<typeof vi.fn>;

function navigate(path: string) {
  browser.location = new URL(path, "https://www.myfenrir.com");
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://fenrir-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-test-key");
  vi.stubEnv("VITE_AUTH_REDIRECT_ORIGIN", "https://www.myfenrir.com");
  vi.stubEnv("VITE_AUTH_REDIRECT_PATH", "/auth/callback");
  vi.stubEnv("VITE_FENRIR_MANAGED_URL", "/main");
  const values = new Map<string, string>();
  browser = {
    location: new URL("https://www.myfenrir.com/main"),
    localStorage: {
      get length() { return values.size; },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, String(value)); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => { values.clear(); },
      key: (index: number) => Array.from(values.keys())[index] ?? null,
    },
    history: { replaceState: vi.fn((_state, _unused, path: string) => navigate(path)) },
  };
  vi.stubGlobal("window", browser);
  fetchMock = vi.fn(() => { throw new Error("unexpected_network_request"); });
  vi.stubGlobal("fetch", fetchMock);
  sdk.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
  sdk.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  sdk.signOut.mockReset().mockResolvedValue({ error: null });
  sdk.stopAutoRefresh.mockReset().mockResolvedValue(undefined);
  sdk.createClient.mockReset().mockReturnValue({
    auth: {
      signInWithOAuth: sdk.signInWithOAuth,
      exchangeCodeForSession: sdk.exchangeCodeForSession,
      getSession: sdk.getSession,
      signOut: sdk.signOut,
      stopAutoRefresh: sdk.stopAutoRefresh,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Supabase callback recovery", () => {
  it("scrubs a rejected OAuth callback while retaining the requested page, query and anchor", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    navigate(`/login?next=${encodeURIComponent("/main/communities?view=members#pending")}`);
    await auth.signInWithSupabase("google");
    navigate("/auth/callback?error=access_denied&error_description=Consent+cancelled&code=expired-code&state=oauth-state&scope=openid&access_token=query-token&id_token=id-token&refresh_token=refresh-token&token_type=bearer&expires_in=3600&campaign=welcome#access_token=hash-token&refresh_token=hash-refresh");

    await expect(auth.completeSupabaseSession()).resolves.toBe(false);

    expect(browser.location.pathname).toBe("/main/communities");
    expect(browser.location.searchParams.get("view")).toBe("members");
    expect(browser.location.searchParams.get("campaign")).toBe("welcome");
    expect(browser.location.hash).toBe("#pending");
    expect(browser.location.searchParams.get("auth_error")).toBe("oauth_access_denied:Consent%20cancelled");
    for (const key of callbackKeys) expect(browser.location.searchParams.has(key)).toBe(false);
    expect(browser.location.href).not.toContain("hash-token");
    expect(browser.localStorage.getItem(destinationKey)).toBeNull();
    expect(sdk.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("completes the session bridge and removes callback tokens without losing the intended destination", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    browser.localStorage.setItem(destinationKey, "/main/billing?tab=history#receipt");
    navigate("/auth/callback?code=one-time-code&state=oauth-state&campaign=email#access_token=hash-token");
    sdk.getSession.mockResolvedValue({ data: { session: { access_token: "provider-session" } }, error: null });
    fetchMock.mockResolvedValue(Response.json({ ok: true }));

    await expect(auth.completeSupabaseSession()).resolves.toBe(true);

    expect(sdk.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/supabase-session", expect.objectContaining({
      method: "POST", credentials: "include", body: JSON.stringify({ accessToken: "provider-session" }),
    }));
    expect(browser.location.pathname).toBe("/main/billing");
    expect(browser.location.searchParams.get("tab")).toBe("history");
    expect(browser.location.searchParams.get("campaign")).toBe("email");
    expect(browser.location.hash).toBe("#receipt");
    for (const key of callbackKeys) expect(browser.location.searchParams.has(key)).toBe(false);
  });

  it.each([
    "https://untrusted.example/landing",
    "//untrusted.example/landing",
    "/\\untrusted.example/landing",
    "/main\\untrusted.example",
    "/login?next=/main",
    "/api/auth/login",
    "/auth/callback",
    "/auth/logout",
    "/api/frisky-auth/sign-out",
    "/main/../login",
    "/main/../auth/callback",
  ])("rejects an unsafe return path: %s", async (destination) => {
    const auth = await import("../../src/services/supabaseAuth");
    navigate(`/login?next=${encodeURIComponent(destination)}`);
    await auth.signInWithSupabase("google");
    expect(browser.localStorage.getItem(destinationKey)).toBe("/main");

    // Also validate a persisted destination at consumption time; storage may
    // predate the current bundle or have been edited between redirect legs.
    browser.localStorage.setItem(destinationKey, destination);
    navigate("/auth/callback?error=access_denied");
    await expect(auth.completeSupabaseSession()).resolves.toBe(false);
    expect(browser.location.pathname).toBe("/main");
    expect(browser.location.origin).toBe("https://www.myfenrir.com");
  });

  it("ends a stalled session lookup after the finite request deadline", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    vi.useFakeTimers();
    sdk.getSession.mockReturnValue(new Promise(() => undefined));

    const completion = expect(auth.completeSupabaseSession()).rejects.toThrow("request_timeout");
    await vi.dynamicImportSettled();
    expect(sdk.getSession).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(12_001);
    await completion;

    expect(sdk.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    new TypeError("network_unavailable"),
    new DOMException("Aborted", "AbortError"),
  ])("scrubs a consumed callback after a session POST transport failure: %s", async (error) => {
    const auth = await import("../../src/services/supabaseAuth");
    browser.localStorage.setItem(destinationKey, "/main/communities?view=members#pending");
    navigate("/auth/callback?code=consumed-code&state=oauth-state#access_token=stale-token");
    sdk.getSession.mockResolvedValue({ data: { session: { access_token: "provider-session" } }, error: null });
    fetchMock.mockRejectedValue(error);

    await expect(auth.completeSupabaseSession()).resolves.toBe(false);

    expect(browser.location.pathname).toBe("/main/communities");
    expect(browser.location.searchParams.get("view")).toBe("members");
    expect(browser.location.hash).toBe("#pending");
    expect(browser.location.searchParams.get("auth_error")).toBe(`supabase_session_failed:${encodeURIComponent(error.message)}`);
    for (const key of callbackKeys) expect(browser.location.searchParams.has(key)).toBe(false);
  });

  it("turns a stalled session POST into a scrubbed callback error and permits retry", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    vi.useFakeTimers();
    navigate("/auth/callback?code=consumed-code&state=oauth-state#access_token=stale-token");
    sdk.getSession.mockResolvedValue({ data: { session: { access_token: "provider-session" } }, error: null });
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const completion = expect(auth.completeSupabaseSession()).resolves.toBe(false);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(12_001);
    await completion;

    expect(browser.location.searchParams.get("auth_error")).toBe("supabase_session_failed:request_timeout");
    for (const key of callbackKeys) expect(browser.location.searchParams.has(key)).toBe(false);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await expect(auth.completeSupabaseSession()).resolves.toBe(true);
    expect(sdk.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it("scrubs a consumed callback code when the provider returns no session", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    browser.localStorage.setItem(destinationKey, "/main/communities?view=members#pending");
    navigate("/auth/callback?code=already-consumed-code&state=oauth-state#access_token=stale-token");

    await expect(auth.completeSupabaseSession()).resolves.toBe(false);

    expect(sdk.exchangeCodeForSession).toHaveBeenCalledWith("already-consumed-code");
    expect(browser.location.pathname).toBe("/main/communities");
    expect(browser.location.searchParams.get("view")).toBe("members");
    expect(browser.location.hash).toBe("#pending");
    expect(browser.location.searchParams.get("auth_error")).toBeTruthy();
    for (const key of callbackKeys) expect(browser.location.searchParams.has(key)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Supabase local logout", () => {
  it("does not mint a server cookie when an earlier session lookup finishes after logout", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    let resolveSession!: (result: { data: { session: { access_token: string } }; error: null }) => void;
    sdk.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    const completion = auth.completeSupabaseSession();
    await vi.dynamicImportSettled();
    expect(sdk.getSession).toHaveBeenCalledOnce();

    await auth.signOutSupabase();
    resolveSession({ data: { session: { access_token: "late-session" } }, error: null });

    await expect(completion).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(browser.localStorage.getItem(signedOutKey)).toBe("1");
  });

  it("aborts a pending server-session request when logout starts", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    sdk.getSession.mockResolvedValue({ data: { session: { access_token: "pending-session" } }, error: null });
    let requestSignal: AbortSignal | null = null;
    fetchMock.mockImplementation((_input, init: RequestInit) => new Promise((_resolve, reject) => {
      requestSignal = init.signal ?? null;
      requestSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const completion = expect(auth.completeSupabaseSession()).resolves.toBe(false);
    await vi.dynamicImportSettled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal!.aborted).toBe(false);

    await auth.signOutSupabase();
    await completion;

    expect(requestSignal!.aborted).toBe(true);
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    expect(browser.location.searchParams.has("auth_error")).toBe(false);
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(browser.localStorage.getItem(signedOutKey)).toBe("1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("clears this app's persisted credentials even when the provider rejects logout", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    const providerError = new Error("provider_unavailable");
    sdk.signOut.mockResolvedValue({ error: providerError });
    for (const key of [sessionKey, `${sessionKey}-code-verifier`, `${sessionKey}-user`, destinationKey]) {
      browser.localStorage.setItem(key, "stale-value");
    }
    browser.localStorage.setItem("community_identity", "separate-session");

    await expect(auth.signOutSupabase()).rejects.toBe(providerError);

    expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(sdk.stopAutoRefresh).toHaveBeenCalledOnce();
    for (const key of [sessionKey, `${sessionKey}-code-verifier`, `${sessionKey}-user`, destinationKey]) {
      expect(browser.localStorage.getItem(key)).toBeNull();
    }
    expect(browser.localStorage.getItem(signedOutKey)).toBe("1");
    expect(browser.localStorage.getItem("community_identity")).toBe("separate-session");

    // A provider retry or stale browser tab must not silently sign the user in.
    sdk.getSession.mockResolvedValue({ data: { session: { access_token: "stale-session" } }, error: null });
    await expect(auth.completeSupabaseSession()).resolves.toBe(false);
    expect(sdk.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still clears local credentials when provider logout never settles", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    vi.useFakeTimers();
    sdk.signOut.mockReturnValue(new Promise(() => undefined));
    browser.localStorage.setItem(sessionKey, "stale-session");

    const logout = expect(auth.signOutSupabase()).rejects.toThrow("request_timeout");
    await vi.dynamicImportSettled();
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
    await vi.advanceTimersByTimeAsync(12_001);
    await logout;

    expect(browser.localStorage.getItem(sessionKey)).toBeNull();
    expect(browser.localStorage.getItem(signedOutKey)).toBe("1");
    expect(sdk.stopAutoRefresh).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the navigation-only Community handoff while rejecting other auth destinations", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    const destination = "/api/auth/community-sso?next=%2Fdashboard";
    expect(auth.isSafeRedirectPath(destination)).toBe(true);
    expect(auth.isSafeRedirectPath("/api/auth/logout")).toBe(false);
    expect(auth.isSafeRedirectPath("/\\external.example")).toBe(false);
    navigate(`/login?next=${encodeURIComponent(destination)}`);
    await auth.signInWithSupabase("google");
    expect(browser.localStorage.getItem(destinationKey)).toBe(destination);
  });

  it("allows an explicit login to clear the signed-out marker and establish a fresh session", async () => {
    const auth = await import("../../src/services/supabaseAuth");
    browser.localStorage.setItem(signedOutKey, "1");
    navigate("/login?next=%2Fmain%2Fcommunities");

    await auth.signInWithSupabase("microsoft");

    expect(browser.localStorage.getItem(signedOutKey)).toBeNull();
    expect(sdk.signInWithOAuth).toHaveBeenCalledWith({
      provider: "azure", options: { redirectTo: "https://www.myfenrir.com/auth/callback", scopes: "email profile" },
    });
    navigate("/auth/callback?code=fresh-code");
    sdk.getSession.mockResolvedValue({ data: { session: { access_token: "fresh-session" } }, error: null });
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await expect(auth.completeSupabaseSession()).resolves.toBe(true);
    expect(browser.location.pathname).toBe("/main/communities");
  });
});
