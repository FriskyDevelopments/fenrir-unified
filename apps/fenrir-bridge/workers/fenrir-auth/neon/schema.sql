-- Fenrir Better Auth identity (dedicated Neon). Identity-only: users + sessions.
-- No KYC/KYB, CFDI, invoices, MCP, or Folios billing tables.

create extension if not exists pgcrypto;

create table if not exists users (
  id             text primary key,             -- "<provider>:<sub>"
  provider       text not null,                -- google | microsoft | apple
  sub            text not null,
  email          text,
  email_verified boolean,
  name           text,
  picture        text,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz not null default now(),
  unique (provider, sub)
);

create table if not exists sessions (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text,
  ip          text
);
create index if not exists sessions_user_idx    on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

create extension if not exists pg_cron;

select cron.schedule(
  'fenrir-auth-purge-expired-sessions',
  '17 * * * *',
  $$delete from public.sessions where expires_at <= now()$$
);
