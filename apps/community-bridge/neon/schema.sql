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
  rules_text text not null default '',
  disclaimer_text text not null default '',
  policy_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Existing Quality databases are upgraded safely by the application as well;
-- these remain here for fresh installs and operator-run schema updates.
alter table cb_gate_configs add column if not exists rules_text text not null default '';
alter table cb_gate_configs add column if not exists disclaimer_text text not null default '';
alter table cb_gate_configs add column if not exists policy_version integer not null default 1;
create index if not exists cb_gate_configs_owner_idx on cb_gate_configs (user_id, brand_id);

create table if not exists cb_gate_views (
  id uuid primary key default gen_random_uuid(),
  gate_id uuid not null references cb_gate_configs (id) on delete cascade,
  visitor_key text not null,
  referrer_host text,
  viewed_at timestamptz not null default now(),
  unique (gate_id, visitor_key)
);
create index if not exists cb_gate_views_gate_time_idx on cb_gate_views (gate_id, viewed_at);

-- Rotatable, revocable access links. The token is the only public identifier;
-- rotating a Gate revokes the previous token before a replacement is issued.
create table if not exists cb_gate_invites (
  token text primary key,
  gate_id uuid not null references cb_gate_configs(id) on delete cascade,
  status text not null check (status in ('active', 'revoked')) default 'active',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists cb_gate_invites_one_active_per_gate
  on cb_gate_invites (gate_id) where status = 'active';

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Identidad de comunidad: mapeo persistente Authentik `sub` → `user_id`.
-- Community Bridge es UNA organización de comunidad. La identidad OIDC nueva
-- (Authentik) se traduce a la clave de propiedad ya existente (`user_id`), que
-- es la MISMA que viven en cb_gate_configs.user_id, public.user_roles.user_id
-- y public.account_links.supabase_user_id. No se fabrica una sesión de Supabase
-- para ocultar esta migración: el vínculo queda explícito y persistente aquí.
create table if not exists cb_identity_map (
  authentik_sub text primary key,
  user_id uuid not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cb_identity_map_user_idx on cb_identity_map (user_id);
create index if not exists cb_identity_map_email_idx on cb_identity_map (lower(email));

-- Evidencia de migración: un dueño existente conserva sus Gates tras el primer
-- login Authentik. Su `sub` queda mapeado al MISMO `user_id` que ya tenían sus
-- Gates (reconciliado por email contra la identidad Supabase), de modo que:
--
--   select m.authentik_sub, m.user_id, count(g.id) as gates
--   from cb_identity_map m
--   left join cb_gate_configs g on g.user_id = m.user_id
--   group by m.authentik_sub, m.user_id;
--
-- La fila de un dueño existente debe mostrar el mismo número de Gates que antes
-- de la migración (nunca 0 para quien ya tenía Gates).
