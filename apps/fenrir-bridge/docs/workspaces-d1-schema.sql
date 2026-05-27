-- Fenrir Bridge app users + workspaces — Cloudflare D1
-- Apply with: wrangler d1 execute fenrir-bridge --remote --file=docs/workspaces-d1-schema.sql

CREATE TABLE IF NOT EXISTS app_users (
  frisky_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  auth_provider TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email
  ON app_users (email);

CREATE TABLE IF NOT EXISTS workspaces (
  frisky_org_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
  ON workspaces (owner_user_id);

CREATE TABLE IF NOT EXISTS workspace_members (
  frisky_org_id TEXT NOT NULL,
  frisky_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'user')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (frisky_org_id, frisky_user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
  ON workspace_members (frisky_user_id);
