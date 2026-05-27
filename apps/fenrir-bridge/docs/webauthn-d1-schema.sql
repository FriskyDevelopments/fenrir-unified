-- Fenrir Bridge WebAuthn (passkey) credentials — Cloudflare D1
-- Apply with: wrangler d1 execute fenrir-bridge --remote --file=docs/webauthn-d1-schema.sql

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  credential_id TEXT PRIMARY KEY,
  frisky_user_id TEXT NOT NULL,
  frisky_org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  public_key_b64 TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user
  ON webauthn_credentials (frisky_user_id);
