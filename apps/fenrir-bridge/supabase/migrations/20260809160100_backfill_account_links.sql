-- ============================================================================
-- MyFenrir · Idempotent backfill into public.account_links
-- Project: yqevglppbhuoxxfsfnih
--
-- Moves EXISTING linked identities into the new SoT so nobody loses their link.
-- Re-runnable: guarded by NOT EXISTS against BOTH unique constraints
-- (supabase_user_id+provider AND provider+telegram_id), so running it twice is
-- a no-op.
--
-- Data reality on 2026-08-09 (verified):
--   * public.telegram_identity_links .......... 10 real linked rows (auth.users.id ↔ telegram)
--   * public.user_roles.telegram_id ........... a few rows also carry telegram_id
--   * Cloudflare D1 telegram_identity_links ... 0 rows (handled by the cross-system script)
--   * Cloudflare D1 billing_customers ......... 0 rows (Stripe anchor greenfield)
-- So this file recovers the 10 Supabase-side links; the .mjs script covers D1
-- (empty today, kept for forward-safety) and account_billing.
-- ============================================================================

-- (a) Seed from the canonical Supabase telegram_identity_links map.
insert into public.account_links
  (supabase_user_id, provider, telegram_id, telegram_username, email, status, verified_at, created_at, updated_at)
select
  til.user_id,
  'telegram',
  nullif(regexp_replace(coalesce(til.telegram_user_id, ''), '\D', '', 'g'), '')::bigint,
  nullif(til.telegram_username, ''),
  u.email,
  'linked',
  coalesce(til.updated_at, til.created_at, now()),
  coalesce(til.created_at, now()),
  now()
from public.telegram_identity_links til
join auth.users u on u.id = til.user_id
where not exists (
        select 1 from public.account_links al
        where al.supabase_user_id = til.user_id and al.provider = 'telegram')
  and not exists (
        select 1 from public.account_links al
        where al.provider = 'telegram'
          and al.telegram_id = nullif(regexp_replace(coalesce(til.telegram_user_id, ''), '\D', '', 'g'), '')::bigint);

-- (b) Fold in any user_roles.telegram_id that has no link row yet.
insert into public.account_links
  (supabase_user_id, provider, telegram_id, email, status, verified_at)
select
  r.user_id, 'telegram', r.telegram_id, u.email, 'linked', now()
from public.user_roles r
join auth.users u on u.id = r.user_id
where r.telegram_id is not null
  and not exists (
        select 1 from public.account_links al
        where al.supabase_user_id = r.user_id and al.provider = 'telegram')
  and not exists (
        select 1 from public.account_links al
        where al.provider = 'telegram' and al.telegram_id = r.telegram_id);
