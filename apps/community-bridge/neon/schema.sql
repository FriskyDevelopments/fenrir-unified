-- Community Bridge — schema canónico en Neon (aditivo, idempotente).
-- Identidad/roles viven en Supabase Auth; aquí solo datos de comunidad.
-- Aplicar: psql "$NEON_DATABASE_URL" -f neon/schema.sql

create extension if not exists pgcrypto;

create table if not exists cb_gate_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  brand_id text not null,
  community_id text,
  slug text not null unique,
  preset text not null,
  headline text not null,
  subheadline text not null default '',
  logo_url text,
  mascot_url text,
  background_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cb_gate_configs_owner_idx on cb_gate_configs (user_id, brand_id);

-- A Gate belongs to a community; chat platforms are replaceable destinations.
-- Telegram is active today. Discord and future adapters can attach without
-- changing the Gate slug, QR, ownership or community limits.
create table if not exists cb_community_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  community_id text not null,
  provider text not null check (provider in ('telegram', 'discord', 'whatsapp', 'slack', 'other')),
  adapter_version text not null default 'v1',
  setup_mode text not null default 'custom' check (setup_mode in ('bot_admin', 'oauth', 'provider_account', 'custom')),
  external_id text,
  display_name text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'paused', 'revoked')),
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, community_id, provider, external_id)
);

-- Existing installs receive the adapter fields without recreating the table.
alter table cb_community_destinations add column if not exists adapter_version text not null default 'v1';
alter table cb_community_destinations
  add column if not exists setup_mode text not null default 'custom'
  check (setup_mode in ('bot_admin', 'oauth', 'provider_account', 'custom'));

-- Widen the original Telegram/Discord constraint on existing databases.
alter table cb_community_destinations
  drop constraint if exists cb_community_destinations_provider_check;
alter table cb_community_destinations
  add constraint cb_community_destinations_provider_check
  check (provider in ('telegram', 'discord', 'whatsapp', 'slack', 'other'));
create index if not exists cb_community_destinations_owner_idx
  on cb_community_destinations (user_id, community_id, status);

create table if not exists cb_gate_views (
  id uuid primary key default gen_random_uuid(),
  gate_id uuid not null references cb_gate_configs (id) on delete cascade,
  visitor_key text not null,
  referrer_host text,
  viewed_at timestamptz not null default now(),
  unique (gate_id, visitor_key)
);
create index if not exists cb_gate_views_gate_time_idx on cb_gate_views (gate_id, viewed_at);

-- Community access is deliberately separate from moderation. A Gate visitor can
-- request entry; the Gate owner can grant, deny, revoke, and audit that decision
-- without storing Telegram invite URLs or copying identity records.
create table if not exists cb_gate_access_requests (
  id uuid primary key default gen_random_uuid(),
  gate_id uuid not null references cb_gate_configs (id) on delete cascade,
  owner_id uuid not null,
  community_id text not null,
  applicant_id uuid not null,
  telegram_user_id bigint not null,
  applicant_email text,
  applicant_name text,
  status text not null default 'pending'
    check (status in ('pending', 'granted', 'denied', 'revoked')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  decision_note text,
  last_invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gate_id, applicant_id)
);
create index if not exists cb_gate_access_requests_owner_queue_idx
  on cb_gate_access_requests (owner_id, status, requested_at);
create index if not exists cb_gate_access_requests_applicant_idx
  on cb_gate_access_requests (applicant_id, status, updated_at desc);

create table if not exists cb_brand_tenants (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null unique,
  name text not null,
  tagline text not null default '',
  hostnames jsonb not null default '[]'::jsonb,
  providers jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  logo_url text,
  wordmark_url text,
  community_id text not null,
  community_label text,
  gate_preset text not null default 'fenrir-dark',
  terminal_command text not null default 'login',
  login_headline text not null default '',
  login_subheadline text not null default '',
  login_signin_label text not null default 'Continue with',
  login_signup_label text not null default '',
  login_forgot_label text not null default '',
  login_terminal_header text not null default '',
  login_terminal_lines jsonb not null default '[]'::jsonb,
  activate_headline text not null default '',
  activate_subheadline text not null default '',
  activate_steps_title text not null default '',
  activate_bot_label text not null default '',
  activate_submit_label text not null default '',
  activate_success_headline text not null default '',
  after_login_path text not null default '/dashboard',
  oauth_return_path text not null default '/auth/callback',
  site_url text,
  terms_url text,
  privacy_url text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cb_brand_tenants_active_idx on cb_brand_tenants (is_active, name);

create table if not exists cb_brand_tenant_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  brand_id text not null,
  tenant_name text,
  action text not null check (action in ('created', 'updated', 'deleted')),
  actor_id uuid not null,
  actor_email text,
  changes jsonb not null default '[]'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists cb_brand_tenant_audit_time_idx on cb_brand_tenant_audit (created_at desc);

-- Cola de revisión humana. La incertidumbre del clasificador NO se resuelve
-- rechazando: aterriza aquí y decide una persona.
-- Lo que el clasificador marca como `reject` (edad claramente por debajo del
-- mínimo) NO entra aquí: se bloquea de inmediato, nadie tiene que mirarlo.
create table if not exists cb_moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  community_id text not null,
  -- Referencia al objeto, nunca la imagen: el material dudoso no se copia a
  -- otra tabla. Se apunta a donde ya vive.
  subject_ref text not null,
  subject_kind text not null check (subject_kind in ('gate_media', 'brand_asset', 'telegram_photo', 'username')),
  reason text not null check (reason in ('no_age_reading', 'age_near_threshold', 'reported', 'other')),
  apparent_age int,
  explicit boolean,
  classifier_model text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists cb_moderation_reviews_queue_idx
  on cb_moderation_reviews (community_id, status, created_at);

-- Términos bloqueados en nombres de usuario / handles.
-- En tabla y no en código A PROPÓSITO: los términos codificados rotan
-- constantemente y hay que poder añadirlos sin desplegar.
create table if not exists cb_blocked_terms (
  id uuid primary key default gen_random_uuid(),
  -- Se compara en minúsculas y sin separadores, así que guardar así.
  term text not null unique,
  -- `substring` atrapa variantes pegadas; `word` evita falsos positivos en
  -- términos cortos que aparecen dentro de palabras legítimas.
  match_kind text not null default 'substring' check (match_kind in ('substring', 'word')),
  severity text not null default 'block' check (severity in ('block', 'review')),
  note text,
  added_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists cb_blocked_terms_kind_idx on cb_blocked_terms (match_kind);
