-- MyFenrir Referral Program v1 — Cloudflare D1 (database: fenrir-bridge)
-- Apply with:
--   wrangler d1 execute fenrir-bridge --remote --file=docs/referral-d1-schema.sql
-- Bound to the fenrir-stars-payments worker as env.DB.
--
-- Design notes:
-- * referral_codes: one MULTI-USE code per referrer (UNIQUE(referrer_id) is the
--   creation rate-limit — a referrer can never mint more than one code). Unlike
--   courtesy codes, a referral code is a *shareable public token*, so it is
--   stored in plaintext (it is not a secret).
-- * referrals: attribution ledger. UNIQUE(referred_id) enforces first-touch and
--   dedupe (one referral per referred user). status pending->converted is flipped
--   exactly once by a guarded UPDATE, so a paid conversion rewards the referrer
--   exactly once even under webhook retries. referred_id holds a Telegram user id
--   for the Stars rail, or 'org:<frisky_org_id>' for the Stripe/web rail.

CREATE TABLE IF NOT EXISTS referral_codes (
  ref_code TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL UNIQUE,   -- Telegram user id of the referrer
  frisky_user_id TEXT,                -- snapshot of linked MyFenrir identity (if any)
  frisky_org_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_referrer
  ON referral_codes (referrer_id);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_code TEXT NOT NULL,
  referrer_id TEXT NOT NULL,          -- Telegram user id of the referrer
  referred_id TEXT NOT NULL UNIQUE,   -- Telegram user id, or 'org:<frisky_org_id>' (Stripe/web)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted')),
  reward_status TEXT NOT NULL DEFAULT 'none' CHECK (reward_status IN ('none', 'granted')),
  reward_days INTEGER,
  conversion_event TEXT,              -- 'stars' | 'stripe'
  created_at TEXT NOT NULL,
  converted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status);
