create extension if not exists pgcrypto;

create table if not exists fenrir_community_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  role text not null default 'member'
    check (role in ('platform_admin', 'community_owner', 'community_staff', 'member')),
  access_status text not null default 'pending'
    check (access_status in ('pending', 'active', 'paused', 'denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fenrir_community_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references fenrir_community_users(id) on delete cascade,
  session_hash text not null unique,
  user_agent text,
  ip_hint text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists fenrir_community_magic_links (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  community_slug text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists fenrir_community_oauth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references fenrir_community_users(id) on delete cascade,
  provider text not null check (provider in ('google', 'apple', 'microsoft')),
  provider_subject text not null,
  provider_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_subject)
);

create table if not exists fenrir_community_orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  owner_user_id uuid references fenrir_community_users(id) on delete set null,
  plan text not null default 'free' check (plan in ('free', 'pro', 'agency')),
  billing_status text not null default 'trial'
    check (billing_status in ('trial', 'active', 'paused', 'cancelled')),
  max_communities integer not null default 1,
  max_invites integer not null default 25,
  branding_limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fenrir_community_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references fenrir_community_users(id) on delete cascade,
  org_id uuid not null references fenrir_community_orgs(id) on delete cascade,
  role text not null default 'member'
    check (role in ('community_owner', 'community_staff', 'member')),
  status text not null default 'active'
    check (status in ('pending', 'active', 'paused', 'denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, org_id)
);

create table if not exists fenrir_gate_communities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references fenrir_community_orgs(id) on delete cascade,
  slug text not null unique,
  name text not null,
  logo_url text,
  mascot_url text,
  background_url text,
  primary_color text not null,
  secondary_color text not null,
  accent_color text not null,
  headline text not null,
  subheadline text not null,
  invite_prefix text not null,
  enabled_auth_providers text[] not null default array['google'],
  default_access_state text not null default 'pending'
    check (default_access_state in ('pending', 'active', 'denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fenrir_community_sessions_user
  on fenrir_community_sessions(user_id);

create index if not exists idx_fenrir_community_magic_links_email
  on fenrir_community_magic_links(email);

create index if not exists idx_fenrir_community_memberships_user
  on fenrir_community_memberships(user_id);
