create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_provider text not null default 'supabase',
  auth_subject uuid not null unique,
  email text not null unique,
  display_name text,
  role text not null default 'member'
    check (role in ('platform_admin', 'community_owner', 'community_staff', 'member')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  owner_profile_id uuid references profiles(id) on delete set null,
  logo_url text,
  mascot_url text,
  background_url text,
  primary_color text not null default '#0d1b1e',
  secondary_color text not null default '#2dd4bf',
  accent_color text not null default '#f59e0b',
  headline text not null default 'Verify access.',
  subheadline text not null default 'Fenrir checks the invite before opening the gate.',
  invite_prefix text not null default 'fenrir',
  enabled_auth_providers text[] not null default array['google'],
  default_access_state text not null default 'pending'
    check (default_access_state in ('pending', 'active', 'denied')),
  plan text not null default 'free'
    check (plan in ('free', 'pro', 'agency')),
  billing_status text not null default 'trial'
    check (billing_status in ('trial', 'active', 'paused', 'cancelled')),
  max_invites integer not null default 25,
  branding_limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists community_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  role text not null default 'member'
    check (role in ('community_owner', 'community_staff', 'member')),
  status text not null default 'active'
    check (status in ('pending', 'active', 'paused', 'denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, community_id)
);

create table if not exists invite_codes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  code text not null unique,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'revoked')),
  max_usages integer,
  usage_count integer not null default 0,
  expires_at timestamptz,
  invited_email_or_handle text,
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz,
  check (max_usages is null or max_usages > 0),
  check (usage_count >= 0)
);

create table if not exists verification_sessions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references invite_codes(id) on delete set null,
  community_id uuid not null references communities(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'granted', 'denied', 'flagged', 'expired')),
  ip_address text,
  user_agent text,
  decision_reason text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  actor_profile_id uuid references profiles(id) on delete set null,
  community_id uuid references communities(id) on delete set null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_auth_subject on profiles(auth_subject);
create index if not exists idx_communities_slug on communities(slug);
create index if not exists idx_memberships_profile on community_memberships(profile_id);
create index if not exists idx_invite_codes_community on invite_codes(community_id);
create index if not exists idx_verification_sessions_profile on verification_sessions(profile_id);
create index if not exists idx_audit_logs_community_created on audit_logs(community_id, created_at desc);

create or replace function consume_invite_code(
  p_code text,
  p_community_slug text,
  p_auth_subject uuid,
  p_email text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns table (
  ok boolean,
  decision text,
  session_id uuid,
  community_id uuid,
  profile_id uuid,
  invite_id uuid
)
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
  v_community_id uuid;
  v_invite_id uuid;
  v_session_id uuid;
begin
  insert into profiles (auth_subject, email)
  values (p_auth_subject, lower(p_email))
  on conflict (auth_subject)
  do update set
    email = excluded.email,
    updated_at = now()
  returning id into v_profile_id;

  select id into v_community_id
  from communities
  where slug = p_community_slug;

  if v_community_id is null then
    insert into audit_logs (event, actor_profile_id, metadata)
    values ('INVITE_DENIED', v_profile_id, jsonb_build_object(
      'reason', 'community_not_found',
      'code', p_code,
      'community_slug', p_community_slug
    ));

    ok := false;
    decision := 'community_not_found';
    session_id := null;
    community_id := null;
    profile_id := v_profile_id;
    invite_id := null;
    return next;
    return;
  end if;

  update invite_codes
  set
    usage_count = usage_count + 1,
    used_at = now()
  where code = p_code
    and community_id = v_community_id
    and status = 'active'
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (max_usages is null or usage_count < max_usages)
  returning id into v_invite_id;

  if v_invite_id is null then
    insert into audit_logs (event, actor_profile_id, community_id, metadata)
    values ('INVITE_DENIED', v_profile_id, v_community_id, jsonb_build_object(
      'reason', 'invalid_expired_revoked_or_exhausted',
      'code', p_code
    ));

    insert into verification_sessions (
      community_id,
      profile_id,
      status,
      ip_address,
      user_agent,
      decision_reason
    )
    values (
      v_community_id,
      v_profile_id,
      'denied',
      p_ip_address,
      p_user_agent,
      'invalid_expired_revoked_or_exhausted'
    )
    returning id into v_session_id;

    ok := false;
    decision := 'denied';
    session_id := v_session_id;
    community_id := v_community_id;
    profile_id := v_profile_id;
    invite_id := null;
    return next;
    return;
  end if;

  insert into verification_sessions (
    invite_id,
    community_id,
    profile_id,
    status,
    ip_address,
    user_agent
  )
  values (
    v_invite_id,
    v_community_id,
    v_profile_id,
    'pending',
    p_ip_address,
    p_user_agent
  )
  returning id into v_session_id;

  insert into audit_logs (event, actor_profile_id, community_id, target_id, metadata)
  values
    ('INVITE_RESOLVED', v_profile_id, v_community_id, v_invite_id, jsonb_build_object('code', p_code)),
    ('SESSION_CREATED', v_profile_id, v_community_id, v_session_id, jsonb_build_object('invite_id', v_invite_id));

  ok := true;
  decision := 'pending_verification';
  session_id := v_session_id;
  community_id := v_community_id;
  profile_id := v_profile_id;
  invite_id := v_invite_id;
  return next;
end;
$$;

insert into communities (slug, name, headline, subheadline, invite_prefix)
values
  ('fenrir', 'Fenrir Protocol', 'Verify access.', 'Fenrir checks the invite before opening the gate.', 'fenrir'),
  ('stix-magic', 'STIX MΛGIC', 'Enter the magic gate.', 'Access is verified before the room opens.', 'stix'),
  ('clipsflow', 'ClipsFlow', 'Unlock the creator room.', 'Fenrir checks your invite and routes you safely.', 'clips'),
  ('lupita', 'Lupita', 'Verify your route.', 'The gate confirms access before sending you onward.', 'lupita'),
  ('friendr', 'FriendR', 'Join with a clean signal.', 'Your invite is checked before access is granted.', 'friendr')
on conflict (slug) do nothing;
