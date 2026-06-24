-- Community Gate (Neon Nexus) consolidation — ADDITIVE, NO data loss.
-- Apply to a Neon BRANCH/staging first (neon branches), then prod after review.
--
-- Goal: one master identity for the community gate, on Neon SQL, keyed by EMAIL.
-- Keep the LIVE generation (magic-link / OAuth, tables `fenrir_community_*`, used by
-- functions/_lib/community-auth.ts via @neondatabase/serverless) and DEPRECATE the
-- Firebase generation (`profiles`/`communities`/`verification_sessions`/… used by
-- functions/_lib/community-gate.ts). Nothing is dropped — deprecated tables are kept
-- read-only for backfill/migration.

begin;

-- 1) Master identity = fenrir_community_users, keyed by email (already
--    `email text not null unique` in neon-community-auth-schema.sql). No change needed;
--    application code (community-auth.ts: ensureCommunityUserByEmail) lower-cases email
--    before upsert so case-variant duplicates can't form.

-- 2) Optional cross-reference to the central Supabase account (frisky_account_id).
--    The MASTER stays this Neon row; this nullable column is only a convenience link
--    by email to the Supabase auth.users UUID used by the bot/owner login.
alter table fenrir_community_users
  add column if not exists frisky_account_id uuid;
comment on column fenrir_community_users.frisky_account_id is
  'OPTIONAL cross-reference to the central Supabase auth.users UUID. Master identity for the community gate is THIS Neon row (keyed by email), not Supabase.';

-- 3) Deprecate the Firebase generation WITHOUT dropping data (kept for backfill).
do $$
declare t text;
begin
  foreach t in array array['profiles','communities','community_memberships','verification_sessions','invite_codes','audit_logs']
  loop
    if to_regclass('public.'||t) is not null then
      execute format(
        'comment on table public.%I is %L', t,
        'DEPRECATED (Firebase community-gate generation). Superseded by fenrir_community_* (magic-link/OAuth on Neon). Retained read-only for migration; do not write new rows.'
      );
    end if;
  end loop;
end $$;

commit;

-- 4) (OPTIONAL, run only after reviewing data) backfill the live table from the
--    deprecated `profiles` by email — additive upsert, no overwrite of existing rows:
-- insert into fenrir_community_users (email, display_name)
-- select lower(email), coalesce(display_name, split_part(email,'@',1)) from profiles
-- on conflict (email) do nothing;
