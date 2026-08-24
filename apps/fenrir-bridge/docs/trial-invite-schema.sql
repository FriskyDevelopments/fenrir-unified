-- MyFenrir Trial + Invite Code system (Cloudflare D1, fenrir-bridge)
--
-- Lives in the SAME D1 database as docs/stripe-d1-schema.sql (binding: DB,
-- database_name: fenrir-bridge). Stores ONLY Stripe object IDs — never card
-- numbers, CVCs, or any PAN data. Card capture happens client-side via
-- Stripe.js using a SetupIntent; the raw card never touches the Worker.
--
-- Apply with:
--   Local  : wrangler d1 execute fenrir-bridge --file=docs/trial-invite-schema.sql
--   Prod   : wrangler d1 execute fenrir-bridge --remote --file=docs/trial-invite-schema.sql
--
-- Naming note: this table is intentionally named `trial_invite_codes` (not the
-- bare `invite_codes` from the original design doc) to avoid colliding with the
-- two pre-existing "code" systems in this repo:
--   1. Community Gate membership invites in Neon (consume_invite_code RPC)
--   2. billing_courtesy_codes in D1 (docs/stripe-d1-schema.sql)
-- The column contract (code, require_card, duration_days, max_uses, used_count,
-- expires_at) matches the design; extra columns are additive.

CREATE TABLE IF NOT EXISTS trial_invite_codes (
  code           TEXT PRIMARY KEY,
  require_card   INTEGER NOT NULL DEFAULT 0 CHECK (require_card IN (0, 1)),
  duration_days  INTEGER NOT NULL CHECK (duration_days > 0),
  max_uses       INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count     INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  plan           TEXT,                 -- optional paid plan offered at conversion: starter|pro|operator
  note           TEXT,                 -- admin-facing label / campaign name
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by     TEXT NOT NULL,        -- admin frisky_user_id or email that minted the code
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  expires_at     TEXT                  -- ISO8601 redemption deadline for the code itself (nullable)
);

CREATE INDEX IF NOT EXISTS idx_trial_invite_codes_status ON trial_invite_codes (status);

CREATE TABLE IF NOT EXISTS trials (
  id                     TEXT PRIMARY KEY,       -- uuid
  frisky_org_id          TEXT NOT NULL,          -- from the authenticated session (billing key)
  frisky_user_id         TEXT NOT NULL,          -- "user_id" in the design; matches billing_customers
  user_email             TEXT,
  code                   TEXT NOT NULL,          -- trial_invite_codes.code that started this trial
  status                 TEXT NOT NULL DEFAULT 'pending_card'
                           CHECK (status IN ('pending_card', 'active', 'converted', 'expired', 'canceled')),
  card_on_file           INTEGER NOT NULL DEFAULT 0 CHECK (card_on_file IN (0, 1)),
  stripe_customer_id     TEXT,                   -- Stripe Customer id ONLY (no card data)
  stripe_setup_intent_id TEXT,                   -- Stripe SetupIntent id ONLY
  plan                   TEXT,                   -- plan to convert into (nullable)
  started_at             TEXT,
  ends_at                TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  UNIQUE (frisky_org_id, code)                   -- one redemption of a given code per org
);

CREATE INDEX IF NOT EXISTS idx_trials_org          ON trials (frisky_org_id);
CREATE INDEX IF NOT EXISTS idx_trials_status       ON trials (status);
CREATE INDEX IF NOT EXISTS idx_trials_setup_intent ON trials (stripe_setup_intent_id);
