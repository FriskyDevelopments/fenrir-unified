-- Fenrir Telegram identity links — Cloudflare D1
-- Apply with: wrangler d1 execute fenrir-bridge --remote --file=docs/telegram-identity-d1-schema.sql

CREATE TABLE IF NOT EXISTS telegram_account_link_codes (
  code TEXT PRIMARY KEY,
  frisky_user_id TEXT NOT NULL,
  frisky_org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_account_link_codes_user
  ON telegram_account_link_codes (frisky_user_id, status);

CREATE TABLE IF NOT EXISTS telegram_identity_links (
  telegram_user_id TEXT PRIMARY KEY,
  frisky_user_id TEXT NOT NULL,
  frisky_org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_identity_links_frisky_user
  ON telegram_identity_links (frisky_user_id);
