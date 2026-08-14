/**
 * Unit tests for the Community Authentik identity boundary.
 *
 * These cover the pure, dependency-free logic:
 *   - internal-only `next` / destination resolution (reject external redirects)
 *   - signed OIDC state (slug/community/brand/next preserved; tampering rejected)
 *   - signed Community session (now carries the resolved user_id)
 *   - the persistent Authentik `sub` → `user_id` mapping resolver
 *
 * Run with: node --test tests/*.test.ts   (Node >= 23.6 type stripping)
 *
 * They intentionally do NOT touch a live database, the Authentik IdP, or the
 * Quality Community host. Live Quality traces must target
 * https://quality.communities.myfenrir.com only, and require the provisioned
 * AUTHENTIK_* credentials (see TASK_02 stop conditions).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  safeNext,
  resolveDestination,
  createState,
  verifyState,
  OAUTH_FLOW_MAX_AGE,
  encodeSession,
  decodeSession,
  type OidcState,
  type CommunityIdentity,
} from "../src/lib/authentik.server.ts";

import {
  resolveCommunityIdentity,
  type IdentityStore,
  type IdentityMapRow,
} from "../src/lib/community-identity.ts";

process.env.AUTHENTIK_SESSION_SECRET =
  "community-bridge-test-secret-0123456789abcdef0123456789abcdef";

// ── internal-only next / destination ────────────────────────────────────────

test("safeNext accepts internal paths and rejects external destinations", () => {
  assert.equal(safeNext("/g/5ccsgzpgsk"), "/g/5ccsgzpgsk");
  assert.equal(safeNext("/dashboard"), "/dashboard");
  assert.equal(safeNext("/"), "/");

  assert.equal(safeNext("https://evil.example.com"), null);
  assert.equal(safeNext("//evil.example.com"), null);
  assert.equal(safeNext("javascript:alert(1)"), null);
  assert.equal(safeNext("evil.example.com/x"), null);
  assert.equal(safeNext(""), null);
  assert.equal(safeNext(null), null);
  assert.equal(safeNext(undefined), null);
});

test("resolveDestination always lands back on the same Gate and never external", () => {
  const base: OidcState = {
    slug: "5ccsgzpgsk",
    community_id: "community",
    brand_id: "lore",
    next: null,
    nonce: "n",
    exp: Math.floor(Date.now() / 1000) + 60,
  };

  // slug wins, even over an external next
  assert.equal(
    resolveDestination({ ...base, next: "https://evil.example.com" }),
    "/g/5ccsgzpgsk",
  );

  // no slug → internal next
  assert.equal(
    resolveDestination({ ...base, slug: null, next: "/dashboard" }),
    "/dashboard",
  );

  // no slug + external next → dashboard fallback (never external)
  assert.equal(
    resolveDestination({ ...base, slug: null, next: "https://evil.example.com" }),
    "/dashboard",
  );

  // nothing → dashboard
  assert.equal(
    resolveDestination({ ...base, slug: null, next: null }),
    "/dashboard",
  );
});

// ── signed OIDC state ───────────────────────────────────────────────────────

test("createState preserves slug/community/brand/internal next and nulls external next", async () => {
  const { state, nonce } = await createState({
    slug: "my-gate",
    community_id: "community",
    brand_id: "lore",
    next: "/g/my-gate",
  });
  assert.ok(state.length > 20);
  assert.ok(nonce.length > 0);

  const parsed = await verifyState(state);
  assert.ok(parsed);
  assert.equal(parsed.slug, "my-gate");
  assert.equal(parsed.community_id, "community");
  assert.equal(parsed.brand_id, "lore");
  assert.equal(parsed.next, "/g/my-gate");
  assert.equal(parsed.nonce, nonce);
});

test("OIDC state remains valid for the complete human-verification window", () => {
  assert.equal(OAUTH_FLOW_MAX_AGE, 30 * 60);
});

test("createState rejects external next at creation time", async () => {
  const { state } = await createState({
    slug: "my-gate",
    community_id: "community",
    brand_id: "lore",
    next: "https://evil.example.com/steal",
  });
  const parsed = await verifyState(state);
  assert.ok(parsed);
  assert.equal(parsed.next, null);
});

test("verifyState rejects a tampered signature", async () => {
  const { state } = await createState({ slug: "my-gate" });
  const tampered = state.slice(0, -2) + (state.endsWith("AA") ? "BB" : "AA");
  assert.equal(await verifyState(tampered), null);
});

// ── signed Community session (carries resolved user_id) ────────────────────

test("session round-trips sub + resolved user_id and rejects tampering", async () => {
  const identity: CommunityIdentity = {
    sub: "authentik-sub-123",
    user_id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Owner",
    iss: "https://auth.example.com/application/o/community/",
    community_id: "community",
    brand_id: "lore",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const token = await encodeSession(identity);
  const decoded = await decodeSession(token);
  assert.ok(decoded);
  assert.equal(decoded.sub, "authentik-sub-123");
  assert.equal(decoded.user_id, "00000000-0000-4000-8000-000000000001");

  const tampered = token.slice(0, -3) + "xyz";
  assert.equal(await decodeSession(tampered), null);
});

// ── persistent sub → user_id mapping ────────────────────────────────────────

function makeStore(seed: IdentityMapRow[] = []) {
  const rows = new Map<string, { user_id: string; email: string | null }>();
  for (const row of seed) {
    rows.set(row.authentik_sub, { user_id: row.user_id, email: row.email });
  }

  const store: IdentityStore = {
    async findBySub(sub) {
      const hit = rows.get(sub);
      return hit ? { authentik_sub: sub, ...hit } : null;
    },
    async findByEmail(email) {
      for (const [sub, row] of rows) {
        if (row.email?.toLowerCase() === email.toLowerCase()) {
          return { authentik_sub: sub, ...row };
        }
      }
      return null;
    },
    async upsert(row) {
      rows.set(row.authentik_sub, { user_id: row.user_id, email: row.email });
    },
  };

  return {
    store,
    get: (sub: string) => rows.get(sub) ?? null,
  };
}

test("existing Authentik sub reuses its mapped user_id (existing)", async () => {
  const { store } = makeStore([
    { authentik_sub: "sub-1", user_id: "user-1", email: "a@example.com" },
  ]);
  const resolved = await resolveCommunityIdentity(
    { sub: "sub-1", email: "a@example.com", name: "A" },
    { store },
  );
  assert.equal(resolved.mapping, "existing");
  assert.equal(resolved.user_id, "user-1");
});

test("known email re-keys a changed sub onto the existing user_id (reconciled)", async () => {
  const { store, get } = makeStore([
    { authentik_sub: "old-sub", user_id: "user-1", email: "a@example.com" },
  ]);
  const resolved = await resolveCommunityIdentity(
    { sub: "new-sub", email: "A@example.com", name: "A" },
    { store },
  );
  assert.equal(resolved.mapping, "reconciled");
  assert.equal(resolved.user_id, "user-1");
  // the new sub is now persisted onto the same user_id (Gates retained)
  assert.deepEqual(get("new-sub"), { user_id: "user-1", email: "a@example.com" });
});

test("legacy Supabase email lookup retains existing ownership (reconciled)", async () => {
  const { store } = makeStore();
  const resolved = await resolveCommunityIdentity(
    { sub: "sub-1", email: "owner@example.com", name: "Owner" },
    { store, lookupUserIdByEmail: async () => "legacy-user-7" },
  );
  assert.equal(resolved.mapping, "reconciled");
  assert.equal(resolved.user_id, "legacy-user-7");
});

test("unmapped identity mints a new user_id (new) without a Supabase session", async () => {
  const { store } = makeStore();
  const resolved = await resolveCommunityIdentity(
    { sub: "sub-new", email: "new@example.com", name: "New" },
    { store, newUserId: () => "00000000-0000-4000-8000-000000000099" },
  );
  assert.equal(resolved.mapping, "new");
  assert.equal(resolved.user_id, "00000000-0000-4000-8000-000000000099");
});
