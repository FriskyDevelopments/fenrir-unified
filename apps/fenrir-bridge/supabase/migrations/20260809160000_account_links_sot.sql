-- ============================================================================
-- MyFenrir · Canonical Account-Link Source of Truth (SoT)
-- Project: yqevglppbhuoxxfsfnih  (FriskyDEV) — the Supabase project that BOTH
--          apps/fenrir-bridge (server, service_role) AND apps/community-bridge
--          (browser, RLS) run against. They share ONE auth session via a
--          `.myfenrir.com` cookie, so `account_links` is directly RLS-readable
--          by community-bridge with no cross-project hop.
--
-- Fixes the split-brain: the bot used to write the link into Cloudflare D1 while
-- community-bridge read "linked" from an orphan `telegram_link_codes` table that
-- was never even applied to this project. From now on:
--   * public.account_links   = the ONLY truth for "is this identity linked?"
--   * public.link_codes      = single-use, short-lived deep-link codes (SoT;
--                              Cloudflare D1 keeps a copy only as cache/queue)
--   * public.account_billing = Stripe anchor: one supabase_user_id ⇒ one
--                              stripe_customer_id (same customer the trial/
--                              billing system already creates in D1).
--
-- WRITES happen ONLY through the MyFenrir writer (service_role, which bypasses
-- RLS). Clients get SELECT-your-own via RLS. No anon access.
-- No secrets in this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) account_links — canonical identity-link truth
-- ---------------------------------------------------------------------------
create table if not exists public.account_links (
  id                  uuid primary key default gen_random_uuid(),
  supabase_user_id    uuid not null references auth.users (id) on delete cascade,
  provider            text not null default 'telegram' check (provider in ('telegram')),
  telegram_id         bigint,
  telegram_username   text,
  telegram_first_name text,
  -- Bridge to the D1 / billing / bot world (frisky_user_id = deterministic
  -- hash of "supabase:"+auth.users.id; carried so those surfaces can resolve
  -- without re-deriving the hash).
  frisky_user_id      text,
  frisky_org_id       text,
  email               text,
  status              text not null default 'linked' check (status in ('linked','revoked')),
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint account_links_user_provider_uk    unique (supabase_user_id, provider),
  constraint account_links_provider_telegram_uk unique (provider, telegram_id)
);

comment on table public.account_links is
  'Canonical SoT for external identity links (Telegram today). Written only by the MyFenrir writer via service_role; RLS gives each user SELECT on their own row.';

create index if not exists idx_account_links_frisky_user on public.account_links (frisky_user_id);
create index if not exists idx_account_links_telegram    on public.account_links (telegram_id);
create index if not exists idx_account_links_email       on public.account_links (lower(email));

alter table public.account_links enable row level security;

drop policy if exists account_links_select_own on public.account_links;
create policy account_links_select_own on public.account_links
  for select to authenticated
  using (supabase_user_id = (select auth.uid()));

revoke all on public.account_links from anon;
grant select on public.account_links to authenticated;
grant all    on public.account_links to service_role;

-- ---------------------------------------------------------------------------
-- 2) link_codes — single-use, short-lived deep-link codes (SoT copy)
-- ---------------------------------------------------------------------------
create table if not exists public.link_codes (
  code              text primary key,
  supabase_user_id  uuid not null references auth.users (id) on delete cascade,
  provider          text not null default 'telegram' check (provider in ('telegram')),
  frisky_user_id    text,
  frisky_org_id     text,
  email             text,
  status            text not null default 'pending' check (status in ('pending','consumed','expired')),
  telegram_id       bigint,
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  created_at        timestamptz not null default now()
);

comment on table public.link_codes is
  'Single-use, short-lived codes behind t.me/<bot>?start=link_<code>. SoT copy; Cloudflare D1 telegram_account_link_codes is a cache/queue mirror, not truth.';

create index if not exists idx_link_codes_user   on public.link_codes (supabase_user_id);
create index if not exists idx_link_codes_status on public.link_codes (status, expires_at);

alter table public.link_codes enable row level security;

drop policy if exists link_codes_select_own on public.link_codes;
create policy link_codes_select_own on public.link_codes
  for select to authenticated
  using (supabase_user_id = (select auth.uid()));

revoke all on public.link_codes from anon;
grant select on public.link_codes to authenticated;
grant all    on public.link_codes to service_role;

-- ---------------------------------------------------------------------------
-- 3) account_billing — canonical Stripe anchor (one user ⇒ one customer)
-- ---------------------------------------------------------------------------
create table if not exists public.account_billing (
  supabase_user_id   uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  frisky_user_id     text,
  frisky_org_id      text,
  email              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.account_billing is
  'Stripe anchor bound to the canonical Supabase identity. Mirrors the SAME stripe_customer_id the trial/billing system stores in D1 billing_customers — never a second customer.';

create index if not exists idx_account_billing_frisky_org on public.account_billing (frisky_org_id);
create index if not exists idx_account_billing_stripe     on public.account_billing (stripe_customer_id);

alter table public.account_billing enable row level security;

drop policy if exists account_billing_select_own on public.account_billing;
create policy account_billing_select_own on public.account_billing
  for select to authenticated
  using (supabase_user_id = (select auth.uid()));

revoke all on public.account_billing from anon;
grant select on public.account_billing to authenticated;
grant all    on public.account_billing to service_role;

-- ---------------------------------------------------------------------------
-- 4) updated_at touch trigger
-- ---------------------------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_account_links_touch on public.account_links;
create trigger trg_account_links_touch
  before update on public.account_links
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists trg_account_billing_touch on public.account_billing;
create trigger trg_account_billing_touch
  before update on public.account_billing
  for each row execute function public.tg_touch_updated_at();
