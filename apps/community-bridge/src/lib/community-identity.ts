/**
 * Persistent mapping: Authentik `sub` → Community ownership `user_id`.
 *
 * Community Bridge is ONE Community organization. Its data-ownership keys all
 * share a single stable `user_id` uuid — the same value stored in
 * `cb_gate_configs.user_id`, `public.user_roles.user_id`, and
 * `public.account_links.supabase_user_id`. This module defines the persistent
 * mapping from the Authentik `sub` (the first-party OIDC identity) to that
 * `user_id`, so a member who already owns Gates keeps them after signing in
 * with Authentik — without fabricating a Supabase session to hide the
 * migration.
 *
 * This file is intentionally free of imports so it can be unit-tested under
 * plain Node (type-stripped) with no app bundler, database, or id provider.
 */

export interface IdentityMapRow {
  authentik_sub: string;
  user_id: string;
  email: string | null;
}

export type MappingKind = "existing" | "reconciled" | "new";

export interface ResolvedCommunityIdentity {
  /** Persistent Community ownership key (existing Gates/roles/links). */
  user_id: string;
  sub: string;
  email: string | null;
  name: string | null;
  /** How this `user_id` was reached — used only for observability. */
  mapping: MappingKind;
}

/**
 * Minimal storage contract the resolver needs. The Neon-backed implementation
 * lives in `community-identity.server.ts`; tests inject a fake.
 */
export interface IdentityStore {
  findBySub(sub: string): Promise<IdentityMapRow | null>;
  findByEmail(email: string): Promise<IdentityMapRow | null>;
  upsert(row: IdentityMapRow): Promise<void>;
}

export interface ResolveCommunityIdentityInput {
  sub: string;
  email: string | null;
  name: string | null;
}

export interface ResolveCommunityIdentityOptions {
  store: IdentityStore;
  /**
   * Read-only reconciliation against the legacy Supabase identity by email.
   * Returns the existing `auth.users.id` for that address, or null. This is a
   * lookup only — it never creates a session or user.
   */
  lookupUserIdByEmail?: (email: string) => Promise<string | null>;
  /** New-identity uuid generator (injectable for tests). */
  newUserId?: () => string;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Resolve the persistent Community `user_id` for an Authentik subject.
 *
 * Order:
 *   1. `sub` already mapped            → reuse its `user_id` (mapping: existing).
 *   2. `email` already mapped          → re-key this `sub` onto that `user_id`
 *                                        (mapping: reconciled) — covers a user
 *                                        whose Authentik `sub` changed.
 *   3. legacy Supabase user by email   → map `sub` to their existing `user_id`
 *                                        so existing Gates are retained
 *                                        (mapping: reconciled).
 *   4. otherwise                       → mint a NEW `user_id` (mapping: new).
 *                                        No Supabase session/auth.user is
 *                                        fabricated anywhere in this flow.
 */
export async function resolveCommunityIdentity(
  input: ResolveCommunityIdentityInput,
  options: ResolveCommunityIdentityOptions,
): Promise<ResolvedCommunityIdentity> {
  const email = normalizeEmail(input.email);
  const { store, lookupUserIdByEmail, newUserId } = options;

  const bySub = await store.findBySub(input.sub);
  if (bySub) {
    return { user_id: bySub.user_id, sub: input.sub, email, name: input.name, mapping: "existing" };
  }

  if (email) {
    const byEmail = await store.findByEmail(email);
    if (byEmail) {
      await store.upsert({ authentik_sub: input.sub, user_id: byEmail.user_id, email });
      return { user_id: byEmail.user_id, sub: input.sub, email, name: input.name, mapping: "reconciled" };
    }

    if (lookupUserIdByEmail) {
      const legacyUserId = await lookupUserIdByEmail(email);
      if (legacyUserId) {
        await store.upsert({ authentik_sub: input.sub, user_id: legacyUserId, email });
        return { user_id: legacyUserId, sub: input.sub, email, name: input.name, mapping: "reconciled" };
      }
    }
  }

  const user_id = (newUserId ?? (() => crypto.randomUUID()))();
  await store.upsert({ authentik_sub: input.sub, user_id, email });
  return { user_id, sub: input.sub, email, name: input.name, mapping: "new" };
}
