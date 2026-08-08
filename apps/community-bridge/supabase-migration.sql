-- ClipsFlow auth + RBAC + Telegram linking
-- Run on the MyFenrir Supabase project (shared auth, isolated ClipsFlow data).
-- Idempotent: safe to re-run.

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, update on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- =========================================================================
-- 2. Security-definer role helpers (avoid RLS recursion)
-- =========================================================================
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_owner(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = 'owner')
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('owner', 'admin')
  )
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;

-- =========================================================================
-- 3. RLS policies for user_roles
-- =========================================================================
drop policy if exists "self or staff can read" on public.user_roles;
create policy "self or staff can read"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

-- Direct UPDATE/INSERT/DELETE from authenticated is blocked; mutations go
-- through admin_* RPCs below which enforce owner/admin rules in one place.
drop policy if exists "staff can update" on public.user_roles;
-- (no policy = denied for authenticated, but service_role bypasses RLS)

-- =========================================================================
-- 4. Auto-create user_roles row on signup; whitelist seed for owner
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role, telegram_id)
  values (
    new.id,
    case when new.email = 'babaji.alvarez@gmail.com' then 'owner'::public.app_role
         else 'user'::public.app_role end,
    case when new.email = 'babaji.alvarez@gmail.com' then 8581086019::bigint
         else null end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: if the owner already exists, ensure their role row is set correctly.
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

-- Backfill: ensure every existing auth user has a user_roles row.
insert into public.user_roles (user_id, role)
select u.id, 'user'::public.app_role
from auth.users u
left join public.user_roles r on r.user_id = u.id
where r.user_id is null
on conflict (user_id) do nothing;

-- =========================================================================
-- 5. Telegram linking codes (issued by the bot, redeemed by the portal)
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
-- No public policies: only the bot (service_role) writes; the RPC below
-- reads as security definer.

-- Drop legacy table if it was created by the previous migration
drop table if exists public.user_telegram_links;

create or replace function public.redeem_telegram_link_code(_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _tg bigint;
begin
  if _uid is null then
    raise exception 'not authenticated';
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

  -- Ensure user_roles row exists, then attach the telegram_id.
  insert into public.user_roles (user_id, role, telegram_id)
       values (_uid, 'user', _tg)
  on conflict (user_id)
    do update set telegram_id = excluded.telegram_id, updated_at = now();

  return true;
end;
$$;

grant execute on function public.redeem_telegram_link_code(text) to authenticated;

-- =========================================================================
-- 6. Admin RPCs (staff-only, enforce owner protection rules)
-- =========================================================================
create or replace function public.list_users_with_roles()
returns table (
  user_id uuid,
  email text,
  role public.app_role,
  telegram_id bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select
      u.id as user_id,
      u.email::text as email,
      coalesce(r.role, 'user'::public.app_role) as role,
      r.telegram_id,
      u.created_at
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    order by u.created_at desc;
end;
$$;

grant execute on function public.list_users_with_roles() to authenticated;

create or replace function public.admin_update_user_role(
  _target uuid,
  _role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _caller_is_owner boolean := public.is_owner(_caller);
  _caller_is_staff boolean := public.is_staff(_caller);
  _target_is_owner boolean := public.is_owner(_target);
begin
  if _caller is null or not _caller_is_staff then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only an owner can grant the owner role or modify an existing owner.
  if (_role = 'owner' or _target_is_owner) and not _caller_is_owner then
    raise exception 'only an owner can grant or modify the owner role' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role)
       values (_target, _role)
  on conflict (user_id)
    do update set role = excluded.role, updated_at = now();
end;
$$;

grant execute on function public.admin_update_user_role(uuid, public.app_role) to authenticated;

create or replace function public.admin_set_user_telegram_id(
  _target uuid,
  _telegram_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
begin
  if _caller is null or not public.is_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Admins cannot modify an owner's telegram link; only owners can.
  if public.is_owner(_target) and not public.is_owner(_caller) then
    raise exception 'only an owner can modify another owner' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role, telegram_id)
       values (_target, 'user', _telegram_id)
  on conflict (user_id)
    do update set telegram_id = excluded.telegram_id, updated_at = now();
end;
$$;

grant execute on function public.admin_set_user_telegram_id(uuid, bigint) to authenticated;
