-- Fenrir Stars entitlement lockdown — additive, non-destructive D1 migration for `fenrir-bridge`.
-- Authored 2026-07-05. Safe against live data: 0 entitlement rows at authoring time, so the
-- new UNIQUE indexes cannot conflict. The index statements are IF NOT EXISTS (re-runnable);
-- SQLite has no "ADD COLUMN IF NOT EXISTS", so if the three enrichment columns already exist,
-- skip section 1 and run sections 2-4 only.

-- 1. Entitlement enrichment columns referenced by functions/_lib/stars-billing.ts but never
--    applied to the live table. Their absence made the post-payment enrichment UPDATE throw
--    "no such column: frisky_org_id" (swallowed by the handler try/catch), leaving paid
--    entitlements un-enriched and billing_subscriptions only partially written.
ALTER TABLE telegram_stars_entitlements ADD COLUMN frisky_org_id TEXT;
ALTER TABLE telegram_stars_entitlements ADD COLUMN frisky_user_id TEXT;
ALTER TABLE telegram_stars_entitlements ADD COLUMN plan TEXT;

-- 2. Idempotency / replay protection: one Telegram charge id maps to exactly one entitlement.
--    Backs the charge-id no-op guard in the webhook handlers against re-delivered payments.
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_stars_entitlements_charge
  ON telegram_stars_entitlements (telegram_payment_charge_id);

-- 3. Charge-id audit + replay lookups on the orders side. The column is nullable, and SQLite
--    treats NULLs as distinct in a UNIQUE index, so multiple pending (NULL) orders stay legal;
--    only a duplicate real charge id is rejected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_stars_orders_charge
  ON telegram_stars_orders (telegram_payment_charge_id);

-- 4. Enrichment lookups by workspace.
CREATE INDEX IF NOT EXISTS idx_telegram_stars_entitlements_org
  ON telegram_stars_entitlements (frisky_org_id);
