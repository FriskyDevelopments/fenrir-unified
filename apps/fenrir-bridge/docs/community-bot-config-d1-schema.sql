-- Fenrir Bridge — per-community bot config (Cloudflare D1)
-- Apply: wrangler d1 execute fenrir-bridge --remote --file=docs/community-bot-config-d1-schema.sql
--
-- One row per community (keyed by the Telegram group chat id). keyboard_show_pct
-- controls how often the ambient MEMBER PROFILE / RULES / STAFF button panel is
-- auto-shown (0-100, default 50). Explicit /community, /profile, /rules, /staff
-- always work regardless of this value — only the ambient auto-show is throttled.

CREATE TABLE IF NOT EXISTS community_bot_config (
  chat_id TEXT PRIMARY KEY,
  keyboard_show_pct INTEGER NOT NULL DEFAULT 50 CHECK (keyboard_show_pct BETWEEN 0 AND 100),
  updated_at TEXT
);
