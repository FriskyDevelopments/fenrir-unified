-- Fenrir Bridge Whop webhook idempotency ledger (Cloudflare D1)
-- Apply with: wrangler d1 execute fenrir-bridge --file=docs/whop-d1-schema.sql
-- Required BEFORE setting WHOP_BILLING_ENABLED=true: without this table the
-- webhook returns 500 so Whop retries, instead of granting twice or dropping.
-- billing_customers / billing_subscriptions are reused from
-- docs/stripe-d1-schema.sql; Whop ids are stored there with a `whop:` prefix.

CREATE TABLE IF NOT EXISTS whop_events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
