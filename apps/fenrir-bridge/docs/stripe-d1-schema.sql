-- Fenrir Bridge Stripe + billing state (Cloudflare D1)
-- Apply with: wrangler d1 execute fenrir-bridge --file=docs/stripe-d1-schema.sql

CREATE TABLE IF NOT EXISTS billing_customers (
  frisky_org_id TEXT PRIMARY KEY,
  frisky_user_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe
  ON billing_customers (stripe_customer_id);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  frisky_org_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org
  ON billing_subscriptions (frisky_org_id);

CREATE TABLE IF NOT EXISTS billing_courtesy_redemptions (code TEXT PRIMARY KEY, frisky_org_id TEXT NOT NULL, frisky_user_id TEXT NOT NULL, redeemed_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS billing_courtesy_codes (
  code TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  courtesy_type TEXT NOT NULL CHECK (courtesy_type IN ('card','non_card')),
  duration_days INTEGER NOT NULL,
  community_name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','redeemed','expired','revoked')),
  redeemed_at TEXT,
  redeemed_by_user_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_billing_courtesy_codes_email ON billing_courtesy_codes (email);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_stars_orders (
  payload TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  telegram_payment_charge_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_stars_orders_user
  ON telegram_stars_orders (telegram_user_id);

CREATE TABLE IF NOT EXISTS telegram_stars_entitlements (
  telegram_user_id TEXT PRIMARY KEY,
  telegram_chat_id TEXT NOT NULL,
  frisky_org_id TEXT,
  frisky_user_id TEXT,
  plan TEXT,
  status TEXT NOT NULL,
  stars_amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  telegram_payment_charge_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_stars_entitlements_org
  ON telegram_stars_entitlements (frisky_org_id);
