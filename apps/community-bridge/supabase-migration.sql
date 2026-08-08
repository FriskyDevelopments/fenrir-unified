-- MyFenrir Community Bridge — consolidated schema (FINAL STATE)
-- Run on the canonical MyFenrir Supabase project: yqevglppbhuoxxfsfnih
-- Idempotent: safe to re-run.
--
-- This file is the single source of truth for the app's database objects.
-- `supabase/migrations/*` is the historical record of the Lovable Cloud dev
-- project and must NOT be replayed here — earlier revisions of those
-- migrations created public.* SECURITY DEFINER helpers that this final state
-- deliberately drops (they live in the `private` schema now).
--
-- Deployment notes (manual, once per project):
--   * PostgREST "Exposed schemas" must include `private` — the app calls the
--     admin RPCs via supabaseAdmin.schema('private').rpc(...).
--   * Auth providers: enable Google / Apple / Azure (Microsoft) and register
--     https://yqevglppbhuoxxfsfnih.supabase.co/auth/v1/callback in each console.

-- =========================================================================
-- 1. Role enum + user_roles table (one row per user)
-- =========================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner', 'admin', 'user');
  end if;
end$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  telegram_id bigint unique,
  -- Blocklist: a non-null blocked_at bans the account portal-wide. Enforced
  -- server-side by the auth middleware and the private RPCs.
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade path for databases created before the blocklist existed.
alter table public.user_roles add column if not exists blocked_at timestamptz;

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- =========================================================================
-- 2. Private schema (not exposed to anon/authenticated) + helpers
-- =========================================================================
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function private.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('owner','admin'))
$$;

create or replace function private.is_owner(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = 'owner')
$$;

-- =========================================================================
-- 3. Auto-create user_roles row on signup; owner bootstrap
-- =========================================================================
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role, telegram_id)
  values (
    new.id,
    case when new.email = 'babaji.alvarez@gmail.com' then 'owner'::public.app_role
         else 'user'::public.app_role end,
    case when new.email = 'babaji.alvarez@gmail.com' then 8581086019::bigint else null end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill: if the owner already exists, ensure their role row is correct.
do $$
declare
  _uid uuid;
begin
  select id into _uid from auth.users where email = 'babaji.alvarez@gmail.com' limit 1;
  if _uid is not null then
    insert into public.user_roles (user_id, role, telegram_id)
    values (_uid, 'owner', 8581086019)
    on conflict (user_id)
      do update set role = 'owner', telegram_id = 8581086019, updated_at = now();
  end if;
end$$;

-- Backfill: every existing auth user gets a user_roles row.
insert into public.user_roles (user_id, role)
select u.id, 'user'::public.app_role
from auth.users u
left join public.user_roles r on r.user_id = u.id
where r.user_id is null
on conflict (user_id) do nothing;

-- =========================================================================
-- 4. RLS for user_roles (reads only; all writes go through private RPCs)
-- =========================================================================
drop policy if exists "self or staff can read" on public.user_roles;
create policy "self or staff can read"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id or private.is_staff(auth.uid()));

-- =========================================================================
-- 5. Telegram linking codes (issued by the bot via service_role)
-- =========================================================================
create table if not exists public.telegram_link_codes (
  code text primary key,
  telegram_id bigint not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

grant all on public.telegram_link_codes to service_role;
alter table public.telegram_link_codes enable row level security;
-- No public policies: only the bot (service_role) writes; the portal redeems
-- through private.redeem_telegram_link_code below.

drop table if exists public.user_telegram_links;

-- =========================================================================
-- 6. Admin RPCs in `private` with an explicit _caller (service_role only).
--    The app validates the user's JWT server-side, then passes their id.
-- =========================================================================
-- Return type changed over time (blocked_at added) — OR REPLACE cannot alter
-- a result signature, so drop first.
drop function if exists private.list_users_with_roles(uuid);
create function private.list_users_with_roles(_caller uuid)
returns table (
  user_id uuid,
  email text,
  role public.app_role,
  telegram_id bigint,
  blocked_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if _caller is null or not private.is_staff(_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(r.role, 'user'::public.app_role), r.telegram_id,
           r.blocked_at, u.created_at
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    order by u.created_at desc;
end;
$$;

create or replace function private.admin_update_user_role(_caller uuid, _target uuid, _role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  _caller_is_owner boolean := private.is_owner(_caller);
  _caller_is_staff boolean := private.is_staff(_caller);
  _target_is_owner boolean := private.is_owner(_target);
begin
  if _caller is null or not _caller_is_staff then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (_role = 'owner' or _target_is_owner) and not _caller_is_owner then
    raise exception 'only an owner can grant or modify the owner role' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role) values (_target, _role)
  on conflict (user_id) do update set role = excluded.role, updated_at = now();
end;
$$;

create or replace function private.admin_set_user_telegram_id(_caller uuid, _target uuid, _telegram_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _caller is null or not private.is_staff(_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.is_owner(_target) and not private.is_owner(_caller) then
    raise exception 'only an owner can modify another owner' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role, telegram_id) values (_target, 'user', _telegram_id)
  on conflict (user_id) do update set telegram_id = excluded.telegram_id, updated_at = now();
end;
$$;

create or replace function private.admin_set_user_blocked(_caller uuid, _target uuid, _blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _caller is null or not private.is_staff(_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.is_owner(_target) then
    raise exception 'owners cannot be blocked' using errcode = '42501';
  end if;
  insert into public.user_roles (user_id, role, blocked_at)
       values (_target, 'user', case when _blocked then now() else null end)
  on conflict (user_id)
    do update set blocked_at = excluded.blocked_at, updated_at = now();
end;
$$;

create or replace function private.redeem_telegram_link_code(_caller uuid, _code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  _tg bigint;
begin
  if _caller is null then
    raise exception 'not authenticated';
  end if;
  if exists (
    select 1 from public.user_roles
    where user_id = _caller and blocked_at is not null
  ) then
    raise exception 'account blocked' using errcode = '42501';
  end if;
  update public.telegram_link_codes
     set consumed_at = now()
   where code = upper(_code)
     and consumed_at is null
     and expires_at > now()
  returning telegram_id into _tg;
  if _tg is null then
    return false;
  end if;
  insert into public.user_roles (user_id, role, telegram_id)
       values (_caller, 'user', _tg)
  on conflict (user_id)
    do update set telegram_id = excluded.telegram_id, updated_at = now();
  return true;
end;
$$;

revoke all on function private.list_users_with_roles(uuid) from public, anon, authenticated;
revoke all on function private.admin_update_user_role(uuid, uuid, public.app_role) from public, anon, authenticated;
revoke all on function private.admin_set_user_telegram_id(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function private.admin_set_user_blocked(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.redeem_telegram_link_code(uuid, text) from public, anon, authenticated;

grant execute on function private.list_users_with_roles(uuid) to service_role;
grant execute on function private.admin_update_user_role(uuid, uuid, public.app_role) to service_role;
grant execute on function private.admin_set_user_telegram_id(uuid, uuid, bigint) to service_role;
grant execute on function private.admin_set_user_blocked(uuid, uuid, boolean) to service_role;
grant execute on function private.redeem_telegram_link_code(uuid, text) to service_role;

-- Drop the legacy public-schema versions (flagged by the Supabase linter and
-- superseded by the private.* functions above).
drop function if exists public.has_role(uuid, public.app_role);
drop function if exists public.is_staff(uuid);
drop function if exists public.is_owner(uuid);
drop function if exists public.handle_new_user();
drop function if exists public.list_users_with_roles();
drop function if exists public.admin_update_user_role(uuid, public.app_role);
drop function if exists public.admin_set_user_telegram_id(uuid, bigint);
drop function if exists public.redeem_telegram_link_code(text);

-- =========================================================================
-- 7. updated_at trigger helper
-- =========================================================================
create or replace function public.update_updated_at_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$
language plpgsql set search_path = public;

-- =========================================================================
-- 8. Public Gate Builder: gate_configs
-- =========================================================================
create table if not exists public.gate_configs (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  preset text not null default 'fenrir-dark',
  headline text not null default 'Members only',
  subheadline text not null default 'Sign in to continue to the portal.',
  logo_url text,
  mascot_url text,
  background_url text,
  brand_id text not null default 'myfenrir',
  community_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gate_configs_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
);

grant select on public.gate_configs to anon;
grant select, insert, update, delete on public.gate_configs to authenticated;
grant all on public.gate_configs to service_role;

alter table public.gate_configs enable row level security;

drop policy if exists "gate configs are publicly readable" on public.gate_configs;
create policy "gate configs are publicly readable"
  on public.gate_configs for select to anon, authenticated using (true);

drop policy if exists "owners insert own gate config" on public.gate_configs;
create policy "owners insert own gate config"
  on public.gate_configs for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "owners update own gate config" on public.gate_configs;
create policy "owners update own gate config"
  on public.gate_configs for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owners delete own gate config" on public.gate_configs;
create policy "owners delete own gate config"
  on public.gate_configs for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists update_gate_configs_updated_at on public.gate_configs;
create trigger update_gate_configs_updated_at
  before update on public.gate_configs
  for each row execute function public.update_updated_at_column();

-- Upgrade path for databases created from an earlier revision of this file.
alter table public.gate_configs drop constraint if exists gate_configs_user_unique;
alter table public.gate_configs add column if not exists brand_id text not null default 'myfenrir';
alter table public.gate_configs add column if not exists community_id text;

create index if not exists gate_configs_user_id_idx on public.gate_configs (user_id);
create index if not exists gate_configs_brand_id_idx on public.gate_configs (brand_id);

-- =========================================================================
-- 9. Gate view analytics (written server-side with service_role)
-- =========================================================================
create table if not exists public.gate_views (
  id uuid not null default gen_random_uuid() primary key,
  gate_id uuid not null references public.gate_configs(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  referrer_host text,
  visitor_key text
);

grant select on public.gate_views to authenticated;
grant all on public.gate_views to service_role;

alter table public.gate_views add column if not exists visitor_key text;

alter table public.gate_views enable row level security;

drop policy if exists "owners read views for own gates" on public.gate_views;
create policy "owners read views for own gates"
  on public.gate_views for select to authenticated
  using (
    exists (
      select 1 from public.gate_configs g
      where g.id = gate_views.gate_id and g.user_id = auth.uid()
    )
  );

create unique index if not exists gate_views_gate_visitor_day_uniq
  on public.gate_views (gate_id, visitor_key)
  where visitor_key is not null;
create index if not exists gate_views_gate_id_viewed_at_idx
  on public.gate_views (gate_id, viewed_at desc);

-- =========================================================================
-- 10. White-label brand tenants
-- =========================================================================
create table if not exists public.brand_tenants (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null unique,
  name text not null,
  tagline text not null default '',
  hostnames text[] not null default '{}'::text[],
  providers text[] not null default array['apple','google','microsoft']::text[],
  theme jsonb not null default '{}'::jsonb,
  logo_url text,
  wordmark_url text,
  community_id text not null,
  community_label text,
  terminal_command text not null default 'login',
  after_login_path text not null default '/dashboard',
  oauth_return_path text not null default '/',
  site_url text,
  terms_url text not null default '/terms',
  privacy_url text not null default '/privacy',
  gate_preset text not null default 'fenrir-dark',
  login_headline text not null default '',
  login_subheadline text not null default '',
  login_signin_label text not null default '',
  login_signup_label text not null default '',
  login_forgot_label text not null default '',
  login_terminal_header text not null default '',
  login_terminal_lines text[] not null default '{}'::text[],
  activate_headline text not null default '',
  activate_subheadline text not null default '',
  activate_steps_title text not null default '',
  activate_bot_label text not null default '',
  activate_submit_label text not null default '',
  activate_success_headline text not null default '',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.brand_tenants to anon;
grant select, insert, update, delete on public.brand_tenants to authenticated;
grant all on public.brand_tenants to service_role;

-- Upgrade path: columns added after the table's first revision.
alter table public.brand_tenants add column if not exists tagline text not null default '';
alter table public.brand_tenants add column if not exists gate_preset text not null default 'fenrir-dark';
alter table public.brand_tenants add column if not exists login_headline text not null default '';
alter table public.brand_tenants add column if not exists login_subheadline text not null default '';
alter table public.brand_tenants add column if not exists login_signin_label text not null default '';
alter table public.brand_tenants add column if not exists login_signup_label text not null default '';
alter table public.brand_tenants add column if not exists login_forgot_label text not null default '';
alter table public.brand_tenants add column if not exists login_terminal_header text not null default '';
alter table public.brand_tenants add column if not exists login_terminal_lines text[] not null default '{}'::text[];
alter table public.brand_tenants add column if not exists activate_headline text not null default '';
alter table public.brand_tenants add column if not exists activate_subheadline text not null default '';
alter table public.brand_tenants add column if not exists activate_steps_title text not null default '';
alter table public.brand_tenants add column if not exists activate_bot_label text not null default '';
alter table public.brand_tenants add column if not exists activate_submit_label text not null default '';
alter table public.brand_tenants add column if not exists activate_success_headline text not null default '';

alter table public.brand_tenants enable row level security;

drop policy if exists "brand tenants are publicly readable" on public.brand_tenants;
create policy "brand tenants are publicly readable"
  on public.brand_tenants for select to anon, authenticated using (true);

drop policy if exists "staff insert brand tenants" on public.brand_tenants;
create policy "staff insert brand tenants"
  on public.brand_tenants for insert to authenticated
  with check (private.is_staff(auth.uid()));

drop policy if exists "staff update brand tenants" on public.brand_tenants;
create policy "staff update brand tenants"
  on public.brand_tenants for update to authenticated
  using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

drop policy if exists "staff delete brand tenants" on public.brand_tenants;
create policy "staff delete brand tenants"
  on public.brand_tenants for delete to authenticated
  using (private.is_staff(auth.uid()));

drop trigger if exists update_brand_tenants_updated_at on public.brand_tenants;
create trigger update_brand_tenants_updated_at
  before update on public.brand_tenants
  for each row execute function public.update_updated_at_column();

-- =========================================================================
-- 11. Brand tenant audit log
-- =========================================================================
create table if not exists public.brand_tenant_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  brand_id text not null,
  tenant_name text,
  action text not null,
  actor_id uuid,
  actor_email text,
  changes jsonb not null default '[]'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

grant select, insert on public.brand_tenant_audit to authenticated;
grant all on public.brand_tenant_audit to service_role;

alter table public.brand_tenant_audit add column if not exists ip_address text;
alter table public.brand_tenant_audit add column if not exists user_agent text;

alter table public.brand_tenant_audit enable row level security;

drop policy if exists "staff read brand tenant audit" on public.brand_tenant_audit;
create policy "staff read brand tenant audit"
  on public.brand_tenant_audit for select to authenticated
  using (private.is_staff(auth.uid()));

drop policy if exists "staff insert brand tenant audit" on public.brand_tenant_audit;
create policy "staff insert brand tenant audit"
  on public.brand_tenant_audit for insert to authenticated
  with check (private.is_staff(auth.uid()) and actor_id = auth.uid());

create index if not exists brand_tenant_audit_created_at_idx
  on public.brand_tenant_audit (created_at desc);
create index if not exists brand_tenant_audit_brand_id_idx
  on public.brand_tenant_audit (brand_id, created_at desc);

-- =========================================================================
-- 12. Admission requirements — minimum conditions (beyond signing in) that a
--     member must meet before the community bot admits them. Staff edit these
--     in the portal admin console; the bot reads them with service_role and
--     enforces on join.
-- =========================================================================
create table if not exists public.admission_requirements (
  community_id text primary key,
  require_username boolean not null default false,
  require_profile_photo boolean not null default false,
  min_account_age_days integer not null default 0
    constraint admission_min_age_nonneg check (min_account_age_days >= 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

grant select on public.admission_requirements to anon;
grant select, insert, update, delete on public.admission_requirements to authenticated;
grant all on public.admission_requirements to service_role;

alter table public.admission_requirements enable row level security;

drop policy if exists "admission requirements are publicly readable" on public.admission_requirements;
create policy "admission requirements are publicly readable"
  on public.admission_requirements for select to anon, authenticated using (true);

drop policy if exists "staff insert admission requirements" on public.admission_requirements;
create policy "staff insert admission requirements"
  on public.admission_requirements for insert to authenticated
  with check (private.is_staff(auth.uid()));

drop policy if exists "staff update admission requirements" on public.admission_requirements;
create policy "staff update admission requirements"
  on public.admission_requirements for update to authenticated
  using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

drop policy if exists "staff delete admission requirements" on public.admission_requirements;
create policy "staff delete admission requirements"
  on public.admission_requirements for delete to authenticated
  using (private.is_staff(auth.uid()));

drop trigger if exists update_admission_requirements_updated_at on public.admission_requirements;
create trigger update_admission_requirements_updated_at
  before update on public.admission_requirements
  for each row execute function public.update_updated_at_column();

-- =========================================================================
-- 13. Storage buckets + policies (assets served through the app's server
--     routes with service_role, so both buckets stay private)
-- =========================================================================
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('gate-media', 'gate-media', false)
on conflict (id) do nothing;

drop policy if exists "staff read brand assets" on storage.objects;
create policy "staff read brand assets"
  on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and private.is_staff(auth.uid()));

drop policy if exists "staff upload brand assets" on storage.objects;
create policy "staff upload brand assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and private.is_staff(auth.uid()));

drop policy if exists "staff update brand assets" on storage.objects;
create policy "staff update brand assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and private.is_staff(auth.uid()))
  with check (bucket_id = 'brand-assets' and private.is_staff(auth.uid()));

drop policy if exists "staff delete brand assets" on storage.objects;
create policy "staff delete brand assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and private.is_staff(auth.uid()));

drop policy if exists "gate_media_owner_read" on storage.objects;
create policy "gate_media_owner_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'gate-media' and owner = auth.uid());

drop policy if exists "gate_media_owner_insert" on storage.objects;
create policy "gate_media_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gate-media'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "gate_media_owner_update" on storage.objects;
create policy "gate_media_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'gate-media' and owner = auth.uid())
  with check (
    bucket_id = 'gate-media'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "gate_media_owner_delete" on storage.objects;
create policy "gate_media_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'gate-media' and owner = auth.uid());
