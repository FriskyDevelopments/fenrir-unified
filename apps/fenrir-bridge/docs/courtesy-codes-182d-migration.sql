-- Fenrir Bridge — widen the courtesy code window to include the canonical
-- 6-month tier (182 days).
--
-- Why 182 and not 180: 182 is the number the crypto ladder already uses for
-- `half` (NOWPAYMENTS_LADDER.half.days in workers/fenrir-stars-payments.js).
-- One number for "6 months" across every rail, so a courtesy grant and a paid
-- crypto grant land on the same date arithmetic.
--
-- SQLite cannot ALTER a CHECK constraint, so this is the canonical 12-step
-- table rebuild. It is ADDITIVE: 30/90/180 stay legal, 182 is added. Existing
-- rows are copied verbatim — nothing is dropped, nothing is rewritten.
--
-- Apply with:
--   wrangler d1 execute fenrir-bridge --remote --file=docs/courtesy-codes-182d-migration.sql

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS courtesy_codes_new (
  code_hash TEXT PRIMARY KEY,
  duration_days INTEGER NOT NULL CHECK (duration_days IN (30, 90, 180, 182)),
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'revoked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  code_expires_at TEXT,
  redeemed_by_telegram_user_id TEXT,
  redeemed_at TEXT,
  courtesy_until TEXT
);

INSERT INTO courtesy_codes_new (
  code_hash, duration_days, status, created_by, created_at,
  code_expires_at, redeemed_by_telegram_user_id, redeemed_at, courtesy_until
)
SELECT
  code_hash, duration_days, status, created_by, created_at,
  code_expires_at, redeemed_by_telegram_user_id, redeemed_at, courtesy_until
FROM courtesy_codes;

DROP TABLE courtesy_codes;

ALTER TABLE courtesy_codes_new RENAME TO courtesy_codes;

CREATE INDEX IF NOT EXISTS idx_courtesy_codes_status ON courtesy_codes (status);
CREATE INDEX IF NOT EXISTS idx_courtesy_codes_redeemer ON courtesy_codes (redeemed_by_telegram_user_id);

PRAGMA foreign_keys = ON;
