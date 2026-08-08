-- Fenrir Lock Bot invite locks — Cloudflare D1
-- Apply with: wrangler d1 execute fenrir-bridge --remote --file=docs/lock-bot-d1-schema.sql
CREATE TABLE IF NOT EXISTS invite_locks (
    id TEXT PRIMARY KEY,
    -- e.g. "fnr-8x4m-k2p9"
    domain TEXT NOT NULL,
    -- e.g. "example.com"
    chat_id INTEGER NOT NULL,
    -- Telegram chat ID of the owner
    created_at TEXT NOT NULL,
    -- ISO-8601 timestamp
    revoked INTEGER NOT NULL DEFAULT 0,
    -- 0 = active, 1 = revoked
    rotated_from TEXT -- previous lock id if this is a rotated successor
);
CREATE INDEX IF NOT EXISTS idx_invite_locks_chat ON invite_locks (chat_id, revoked);
CREATE INDEX IF NOT EXISTS idx_invite_locks_domain ON invite_locks (domain, revoked);