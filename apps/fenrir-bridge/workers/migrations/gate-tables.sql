-- Fenrir Gate: per-group configuration and approval log
-- Run against the D1 database bound to the fenrir-stars-payments worker.

CREATE TABLE IF NOT EXISTS gate_groups (
  chat_id TEXT PRIMARY KEY,
  group_name TEXT,
  welcome_text TEXT,
  accent_color TEXT DEFAULT '#F59E0B',
  logo_url TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gate_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  UNIQUE(chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gate_approvals_chat ON gate_approvals(chat_id);
CREATE INDEX IF NOT EXISTS idx_gate_approvals_user ON gate_approvals(user_id);
