-- Fenrir Bridge core product state — Cloudflare D1
-- Apply with: wrangler d1 execute fenrir-bridge --remote --file=docs/product-d1-schema.sql

CREATE TABLE IF NOT EXISTS frisky_domains (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  txt_record_name TEXT NOT NULL,
  txt_record_value TEXT NOT NULL,
  cname_host TEXT NOT NULL,
  cname_target TEXT NOT NULL,
  status TEXT NOT NULL,
  dns_provider TEXT NOT NULL,
  certificate_status TEXT NOT NULL,
  cloudflare_hostname_id TEXT,
  cloudflare_nameservers TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frisky_domains_org_domain
  ON frisky_domains (org_id, domain);

CREATE TABLE IF NOT EXISTS frisky_bridges (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  public_url TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  telegram_group_name TEXT NOT NULL,
  telegram_group_image_url TEXT NOT NULL,
  current_invite_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frisky_bridges_org_domain_slug
  ON frisky_bridges (org_id, domain_id, slug);

CREATE INDEX IF NOT EXISTS idx_frisky_bridges_slug_status
  ON frisky_bridges (slug, status);

CREATE TABLE IF NOT EXISTS frisky_invites (
  id TEXT PRIMARY KEY,
  bridge_id TEXT NOT NULL,
  invite_link TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frisky_invites_bridge
  ON frisky_invites (bridge_id);

CREATE TABLE IF NOT EXISTS frisky_live_rooms (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  target_url TEXT NOT NULL,
  public_url TEXT NOT NULL,
  cover_image_url TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frisky_live_rooms_org_domain_slug
  ON frisky_live_rooms (org_id, domain_id, slug);

CREATE INDEX IF NOT EXISTS idx_frisky_live_rooms_slug_status
  ON frisky_live_rooms (slug, status);

CREATE TABLE IF NOT EXISTS telegram_permission_checks (
  org_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  bot_is_admin INTEGER NOT NULL,
  can_invite_users INTEGER NOT NULL,
  can_revoke_links INTEGER NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (org_id, chat_id)
);

CREATE TABLE IF NOT EXISTS frisky_audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_frisky_audit_logs_org_created
  ON frisky_audit_logs (org_id, created_at);

CREATE TABLE IF NOT EXISTS frisky_waitlist_entries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  interest TEXT NOT NULL,
  telegram_handle TEXT,
  message TEXT,
  source TEXT NOT NULL,
  page_path TEXT NOT NULL,
  referrer TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_frisky_waitlist_entries_status_created
  ON frisky_waitlist_entries (status, created_at);
