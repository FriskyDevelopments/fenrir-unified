/**
 * Server-only adapter for the Authentik `sub` → Community `user_id` mapping.
 *
 * The mapping table lives in Neon (the canonical Community data store), the
 * same place as `cb_gate_configs`. Reconciliation against an existing legacy
 * Supabase identity is read-only (listUsers by email) and optional — if the
 * shared Supabase project is not reachable, the resolver still produces a
 * correct, persistent `user_id` for brand-new Community identities.
 *
 * Never import from client code.
 */
import { neonSql } from "./neon.server";
import {
  resolveCommunityIdentity,
  type IdentityMapRow,
  type IdentityStore,
  type ResolvedCommunityIdentity,
  type ResolveCommunityIdentityInput,
} from "./community-identity";

/** Idempotent DDL, matching the `ensureGatePolicyColumns` pattern. */
export async function ensureCommunityIdentityMap(
  sql = neonSql(),
): Promise<void> {
  await sql`create table if not exists cb_identity_map (
    authentik_sub text primary key,
    user_id uuid not null,
    email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`create index if not exists cb_identity_map_user_idx on cb_identity_map (user_id)`;
  await sql`create index if not exists cb_identity_map_email_idx on cb_identity_map (lower(email))`;
}

function toRow(row: Record<string, unknown>): IdentityMapRow {
  return {
    authentik_sub: String(row["authentik_sub"]),
    user_id: String(row["user_id"]),
    email: (row["email"] as string | null) ?? null,
  };
}

export function neonIdentityStore(sql = neonSql()): IdentityStore {
  return {
    async findBySub(sub: string) {
      const rows = (await sql`
        select authentik_sub, user_id, email
        from cb_identity_map
        where authentik_sub = ${sub}
        limit 1
      `) as Record<string, unknown>[];
      return rows[0] ? toRow(rows[0]) : null;
    },
    async findByEmail(email: string) {
      const rows = (await sql`
        select authentik_sub, user_id, email
        from cb_identity_map
        where lower(email) = lower(${email})
        limit 1
      `) as Record<string, unknown>[];
      return rows[0] ? toRow(rows[0]) : null;
    },
    async upsert(row: IdentityMapRow) {
      await sql`
        insert into cb_identity_map (authentik_sub, user_id, email)
        values (${row.authentik_sub}, ${row.user_id}, ${row.email})
        on conflict (authentik_sub)
        do update set user_id = excluded.user_id, email = excluded.email, updated_at = now()
      `;
    },
  };
}

/**
 * Read-only reconciliation against the legacy Supabase identity. Returns the
 * existing `auth.users.id` for the given email, or null. This never creates a
 * session or user — it only locates the ownership key an existing member
 * already has, so their Gates/roles/links are retained through the migration.
 */
export async function defaultLookupUserIdByEmail(
  email: string,
): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error || !data?.users) return null;
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    return match?.id ?? null;
  } catch {
    // Supabase not configured / unreachable — continue Neon-only.
    return null;
  }
}

/**
 * Resolve the Community `user_id` for a freshly validated Authentik subject.
 * Throws `neon_not_configured` (from neonSql) when Neon is missing, which the
 * callback maps to the explicit `identity_mapping_failed` login state.
 */
export async function resolveCommunityIdentityForLogin(
  input: ResolveCommunityIdentityInput,
): Promise<ResolvedCommunityIdentity> {
  const sql = neonSql();
  await ensureCommunityIdentityMap(sql);
  return resolveCommunityIdentity(input, {
    store: neonIdentityStore(sql),
    lookupUserIdByEmail: defaultLookupUserIdByEmail,
  });
}
