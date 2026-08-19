-- membership_confirmations — the delivery log for the confirmation moment.
--
-- Purely additive. Touches no existing table, adds no foreign key, and is
-- never read or written by the charge path. Its only job is to make the
-- confirmation exactly-once per (org, subscription): both rails may call the
-- hook, and the reconciler cron may reach the same row independently, so the
-- writer needs somewhere durable to claim the send.
--
-- It also records FAILURES with a reason. A membership we could not confirm
-- (no email on file, provider rejected) stays visible here instead of
-- disappearing — that is the whole point of not failing silently.

CREATE TABLE IF NOT EXISTS membership_confirmations (
  frisky_org_id     TEXT NOT NULL,
  subscription_id   TEXT NOT NULL,

  -- pending | sent | skipped | failed
  --   skipped = deliberately not sent, with a reason (e.g. no_email_on_file)
  --   failed  = we tried and the provider rejected it
  status            TEXT NOT NULL,
  reason            TEXT,

  -- What we resolved at send time, kept for audit: which table gave us the
  -- address, and the plan/rail we told the member they had.
  contact_source    TEXT,
  plan              TEXT,
  rail              TEXT,

  provider_message_id TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,

  PRIMARY KEY (frisky_org_id, subscription_id)
);

-- The reconciler sweeps by recency; this keeps that scan cheap.
CREATE INDEX IF NOT EXISTS idx_membership_confirmations_updated
  ON membership_confirmations (updated_at DESC);

-- Operator view: what did we fail to deliver, and why.
CREATE INDEX IF NOT EXISTS idx_membership_confirmations_status
  ON membership_confirmations (status, updated_at DESC);
