-- Fenrir Protocol — master identity: omnichannel links + per-product registry.
--
-- Target project: FriskyDEV (ref yqevglppbhuoxxfsfnih) — the CANONICAL identity
-- provider. Master account id = auth.users.id (UUID).
--
-- ADDITIVE & IDEMPOTENT. Does NOT alter or drop any existing table. The legacy
-- public.telegram_identity_links keeps working untouched; a trigger mirrors it
-- into the new generalized public.account_channels so the Telegram bot needs no
-- code change. NOT auto-applied — apply with `supabase db push` after review,
-- same convention as the ClipsFlow migration.

-- ---------------------------------------------------------------------------
-- 1. Omnichannel link: a channel is a SWAPPABLE CHILD of the master account.
--    Linked once, re-linkable if lost (delete + re-insert), and the account
--    persists if a channel is dropped. Generalizes telegram_identity_links to
--    any channel (telegram, whatsapp, discord, signal, email, …).
-- ---------------------------------------------------------------------------
create table if not exists public.account_channels (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  channel_type    text not null,            -- 'telegram' | 'whatsapp' | 'discord' | ...
  channel_user_id text not null,            -- external id within that channel
  channel_handle  text,                     -- @username / display handle (optional)
  metadata        jsonb not null default '{}'::jsonb,
  linked_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One external channel identity maps to exactly one master account. To
  -- re-link to a different account, delete the row and insert a new one — the
  -- account itself is never touched, so it survives any channel change.
  unique (channel_type, channel_user_id)
);

create index if not exists account_channels_user_idx
  on public.account_channels (user_id);
create index if not exists account_channels_type_user_idx
  on public.account_channels (channel_type, user_id);

comment on table public.account_channels is
  'Fenrir Protocol omnichannel links: external channel identity -> master auth.users account. Swappable child; account persists if a channel is lost.';

-- Backfill existing Telegram links (no-op if already present).
insert into public.account_channels (user_id, channel_type, channel_user_id, channel_handle, linked_at, updated_at)
select t.user_id, 'telegram', t.telegram_user_id::text, nullif(t.telegram_username, ''), coalesce(t.created_at, now()), coalesce(t.updated_at, now())
from public.telegram_identity_links t
where t.user_id is not null
on conflict (channel_type, channel_user_id) do nothing;

-- Keep account_channels in sync when the existing Telegram bot writes/removes
-- telegram_identity_links — zero bot code change required.
create or replace function public.sync_telegram_identity_links_to_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    delete from public.account_channels
      where channel_type = 'telegram' and channel_user_id = old.telegram_user_id::text;
    return old;
  end if;

  insert into public.account_channels (user_id, channel_type, channel_user_id, channel_handle, updated_at)
    values (new.user_id, 'telegram', new.telegram_user_id::text, nullif(new.telegram_username, ''), now())
  on conflict (channel_type, channel_user_id)
    do update set user_id = excluded.user_id,
                  channel_handle = excluded.channel_handle,
                  updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_telegram_links on public.telegram_identity_links;
create trigger trg_sync_telegram_links
  after insert or update or delete on public.telegram_identity_links
  for each row execute function public.sync_telegram_identity_links_to_channels();

-- RLS: an account reads only its own channels (service role bypasses RLS).
alter table public.account_channels enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_channels' and policyname = 'account_channels_read_own'
  ) then
    create policy account_channels_read_own on public.account_channels
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Per-product registry: the contract catalog. Each Frisky product that
--    authenticates against the master account registers ONE row here. It does
--    NOT store per-user credentials — those live in each product's own schema
--    (e.g. clipsflow.accounts.client_id = 'cf_live_<32hex>'), keyed to
--    auth.users.id. This table is the catalog + onboarding contract.
-- ---------------------------------------------------------------------------
create table if not exists public.product_registry (
  concept_slug         text primary key,    -- 'clipsflow' | 'hostcasa' | 'fenrir-bridge' | ...
  display_name         text not null,
  client_id_prefix     text not null,       -- 'cf_live' -> per-account ids look like cf_live_<32hex>
  data_schema          text,                -- product-owned schema in THIS project, or null if product uses its own Supabase project
  data_supabase_ref    text,                -- null = this project (yqevglppbhuoxxfsfnih); else the product's own project ref (e.g. hostcasa)
  overview_rpc         text,                -- public.<product>_account_overview RPC, if exposed
  allowed_redirect_uris text[] not null default '{}',
  scopes               text[] not null default '{}',
  status               text not null default 'active',  -- 'active' | 'paused' | 'retired'
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.product_registry is
  'Fenrir Protocol product catalog: every product that authenticates against the master Frisky account (auth.users). Per-account client_ids live in each product schema, not here.';

-- Link to the existing app catalog when present (best-effort; app_concepts is
-- the human-facing concept list, product_registry is the integration contract).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'app_concepts')
     and not exists (select 1 from information_schema.table_constraints
             where constraint_name = 'product_registry_concept_fk') then
    begin
      alter table public.product_registry
        add constraint product_registry_concept_fk
        foreign key (concept_slug) references public.app_concepts (concept_slug)
        on delete cascade;
    exception when others then
      -- app_concepts.concept_slug may not be unique/PK in every environment; skip FK.
      null;
    end;
  end if;
end $$;

-- Seed the reference integration (ClipsFlow) + the bridge itself. Idempotent.
insert into public.product_registry
  (concept_slug, display_name, client_id_prefix, data_schema, data_supabase_ref, overview_rpc, scopes, status)
values
  ('fenrir-bridge', 'Fenrir Bridge (MyFenrir)', 'fb_live', null, null, null, array['identity','billing'], 'active'),
  ('clipsflow', 'ClipsFlow', 'cf_live', 'clipsflow', null, 'public.clipsflow_account_overview', array['identity','tier'], 'active')
on conflict (concept_slug) do nothing;
