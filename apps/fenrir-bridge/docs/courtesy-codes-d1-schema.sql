-- Fenrir Bridge — owner-generated single-use courtesy codes (Cloudflare D1)
-- Apply with: wrangler d1 execute fenrir-bridge --remote --file=docs/courtesy-codes-d1-schema.sql
--
-- Threat model (Mistral hardening):
--  * Only the HMAC-SHA256 hash of a code is ever stored (code_hash PRIMARY KEY);
--    the plaintext is shown to the owner exactly once and never persisted.
--  * Redemption is a single atomic UPDATE ... WHERE status='unused' RETURNING,
--    guaranteeing single use (no check-then-write / replay).
--  * courtesy_audit is an append-only trail of every generation and redemption
--    attempt (actor identity, code_hash, origin, server timestamp).

CREATE TABLE IF NOT EXISTS courtesy_codes (
  code_hash TEXT PRIMARY KEY,
  duration_days INTEGER NOT NULL CHECK (duration_days IN (30, 90, 180)),
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'revoked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  code_expires_at TEXT,
  redeemed_by_telegram_user_id TEXT,
  redeemed_at TEXT,
  courtesy_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_courtesy_codes_status ON courtesy_codes (status);
CREATE INDEX IF NOT EXISTS idx_courtesy_codes_redeemer ON courtesy_codes (redeemed_by_telegram_user_id);

CREATE TABLE IF NOT EXISTS courtesy_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,          -- generate | redeem | redeem_fail
  actor_id TEXT NOT NULL,        -- telegram user id (jwt sub equivalent on this rail)
  actor_kind TEXT NOT NULL,      -- owner | user
  code_hash TEXT,                -- HMAC of the code (never the plaintext)
  origin TEXT,                   -- rail the attempt arrived on (telegram)
  server_ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_courtesy_audit_actor ON courtesy_audit (actor_id, server_ts);
CREATE INDEX IF NOT EXISTS idx_courtesy_audit_code ON courtesy_audit (code_hash);
