-- membership_celebrations — who has already been shown the moment.
--
-- The celebration must fire exactly once per person per membership, and it must
-- survive a cleared browser. Storing "seen" client-side would make it replayable
-- and device-local, so it lives here.
--
-- Keyed by USER, not org: on a multi-admin workspace each admin gets the moment
-- once, and one admin dismissing it does not silently consume it for everyone.

CREATE TABLE IF NOT EXISTS membership_celebrations (
  frisky_user_id   TEXT NOT NULL,
  subscription_id  TEXT NOT NULL,
  frisky_org_id    TEXT NOT NULL,
  seen_at          TEXT NOT NULL,
  PRIMARY KEY (frisky_user_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_celebrations_org
  ON membership_celebrations (frisky_org_id, seen_at DESC);

-- BACKFILL — the important half of this migration.
--
-- Without it, the day this ships every existing member opens the portal and is
-- told "YOU'RE IN THE PACK" as though they had just joined. That is precisely
-- the kind of false moment this whole change exists to remove.
--
-- So: everyone entitled at the instant this migration runs is recorded as
-- having already seen their current membership. Only entitlements confirmed
-- AFTER this point produce a celebration.
--
-- seen_at is marked 'backfill' rather than a timestamp so it is obvious in the
-- table that these rows are a deploy artefact and not a real view.
INSERT OR IGNORE INTO membership_celebrations (frisky_user_id, subscription_id, frisky_org_id, seen_at)
SELECT m.frisky_user_id, s.stripe_subscription_id, s.frisky_org_id, 'backfill'
  FROM billing_subscriptions s
  JOIN workspace_members m ON m.frisky_org_id = s.frisky_org_id
 WHERE s.status IN ('active', 'trialing', 'past_due');

-- Workspaces whose owner is not in workspace_members are covered too — the
-- owner is the person most likely to have paid, and missing them would be the
-- one case where a long-standing member gets a false welcome.
INSERT OR IGNORE INTO membership_celebrations (frisky_user_id, subscription_id, frisky_org_id, seen_at)
SELECT w.owner_user_id, s.stripe_subscription_id, s.frisky_org_id, 'backfill'
  FROM billing_subscriptions s
  JOIN workspaces w ON w.frisky_org_id = s.frisky_org_id
 WHERE s.status IN ('active', 'trialing', 'past_due');
