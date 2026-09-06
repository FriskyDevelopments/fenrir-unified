import assert from "node:assert/strict";
import test from "node:test";
import {
  availableBrandProviders,
  communityLoginPath,
  communityOAuthRedirectUrl,
  loadCommunityProviders,
  safeCommunityNext,
  startCommunityOAuth,
} from "../src/lib/canonical-auth.ts";
import {
  sharedSessionStorage,
  sharedStorageKey,
} from "../src/integrations/supabase/shared-session.ts";

test("Gate sign-in stays on Community and preserves brand and source Gate", () => {
  const route = new URL(
    communityLoginPath({ nextPath: "/g/private-gate", brandId: "lore", gateSlug: "private-gate" }),
    "https://communities.myfenrir.com",
  );
  assert.equal(route.origin, "https://communities.myfenrir.com");
  assert.equal(route.pathname, "/login");
  assert.equal(route.searchParams.get("next"), "/g/private-gate");
  assert.equal(route.searchParams.get("brand"), "lore");
  assert.equal(route.searchParams.get("gate"), "private-gate");
});

for (const next of [
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/%5cevil.example",
  "/login?next=/login",
  "/LOGIN",
  "/Login",
  "/%4c%4f%47%49%4e",
  "/AUTH/callback",
  "/%6cogin",
  "/auth/callback",
  "/api/auth/community-sso",
  "/../login",
  "/\n/evil.example",
]) {
  test(`rejects unsafe or looping next ${JSON.stringify(next)}`, () => {
    assert.equal(safeCommunityNext(next), null);
    assert.equal(
      new URL(communityLoginPath({ nextPath: next }), "https://community.example").searchParams.get(
        "next",
      ),
      "/dashboard",
    );
  });
}

test("callback returns to a public login which resumes the same safe Gate", () => {
  const callback = new URL(
    communityOAuthRedirectUrl({
      communityOrigin: "https://white-label.example",
      nextPath: "/g/private-gate?lang=fr#rules",
      brandId: "lore",
      gateSlug: "private-gate",
    }),
  );
  assert.equal(callback.origin, "https://white-label.example");
  assert.equal(callback.pathname, "/login");
  assert.equal(
    safeCommunityNext(callback.searchParams.get("next")),
    "/g/private-gate?lang=fr#rules",
  );
  assert.equal(callback.searchParams.get("gate"), "private-gate");
});

for (const provider of ["apple", "google", "microsoft"]) {
  test(`Community ${provider} starts its own client provider flow`, async () => {
    let supplied;
    const auth = {
      async signInWithOAuth(input) {
        supplied = input;
        return { data: { url: "https://project.supabase.co/auth/v1/authorize" }, error: null };
      },
    };
    const url = await startCommunityOAuth(auth, {
      provider,
      communityOrigin: "https://communities.myfenrir.com",
      nextPath: "/g/private-gate",
      brandId: "myfenrir",
      gateSlug: "private-gate",
    });
    assert.equal(url, "https://project.supabase.co/auth/v1/authorize");
    assert.equal(supplied.provider, provider === "microsoft" ? "azure" : provider);
    assert.equal(supplied.options.skipBrowserRedirect, true);
    assert.equal(supplied.options.scopes, provider === "microsoft" ? "email" : undefined);
    const callback = new URL(supplied.options.redirectTo);
    assert.equal(callback.origin, "https://communities.myfenrir.com");
    assert.equal(callback.pathname, "/login");
    assert.equal(callback.searchParams.get("next"), "/g/private-gate");
  });
}

test("provider failures remain visible rather than leaving a pending login", async () => {
  const input = {
    provider: "google",
    communityOrigin: "https://community.example",
    nextPath: "/g/gate",
    brandId: "myfenrir",
  };
  await assert.rejects(
    startCommunityOAuth(
      {
        signInWithOAuth: async () => ({
          data: { url: null },
          error: { message: "provider disabled" },
        }),
      },
      input,
    ),
    /provider disabled/,
  );
  await assert.rejects(
    startCommunityOAuth(
      { signInWithOAuth: async () => ({ data: { url: null }, error: null }) },
      input,
    ),
    /Could not start Community sign-in/,
  );
});

test("capabilities use only the Community identity project's enabled providers", async () => {
  let request;
  const providers = await loadCommunityProviders(
    {
      supabaseUrl: "https://community-project.supabase.co/",
      publishableKey: "synthetic-public-key",
    },
    undefined,
    async (url, options) => {
      request = { url, options };
      return Response.json({
        external: { google: true, azure: true, apple: false, authentik: true },
      });
    },
  );
  assert.equal(request.url, "https://community-project.supabase.co/auth/v1/settings");
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.headers.apikey, "synthetic-public-key");
  assert.deepEqual(providers, ["google", "microsoft"]);
  assert.deepEqual(availableBrandProviders(["microsoft", "apple", "google"], providers), [
    "microsoft",
    "google",
  ]);
});

test("enabled providers with no brand overlap leave no available sign-in options", () => {
  assert.deepEqual(availableBrandProviders(["apple"], ["google", "microsoft"]), []);
});

test("stalled capability discovery settles when its bounded signal is aborted", async () => {
  const controller = new AbortController();
  const pending = loadCommunityProviders(
    {
      supabaseUrl: "https://community-project.supabase.co",
      publishableKey: "synthetic-public-key",
    },
    controller.signal,
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason ?? new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );

  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

for (const body of [null, [], { external: null }, { external: { google: "true" } }]) {
  test(`malformed capability response fails closed ${JSON.stringify(body)}`, async () => {
    assert.deepEqual(
      await loadCommunityProviders(
        {
          supabaseUrl: "https://community-project.supabase.co",
          publishableKey: "synthetic-public-key",
        },
        undefined,
        async () => Response.json(body),
      ),
      [],
    );
  });
}

test("Community storage ignores legacy app cookies/tokens and never modifies them", () => {
  const key = sharedStorageKey("https://project.supabase.co");
  assert.equal(key, "fenrir-community-project-auth-token");
  const storage = new Map([["sb-project-auth-token", "legacy-shared-token"]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
  globalThis.document = {
    get cookie() {
      throw Error("Community must never read shared cookies");
    },
    set cookie(_) {
      throw Error("Community must never write shared cookies");
    },
  };
  try {
    assert.equal(sharedSessionStorage.getItem(key), null);
    sharedSessionStorage.setItem(key, "own-community-session");
    assert.equal(sharedSessionStorage.getItem(key), "own-community-session");
    sharedSessionStorage.removeItem(key);
    assert.equal(sharedSessionStorage.getItem(key), null);
    assert.equal(storage.get("sb-project-auth-token"), "legacy-shared-token");
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
