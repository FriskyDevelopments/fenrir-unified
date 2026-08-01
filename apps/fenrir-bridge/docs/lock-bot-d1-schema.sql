CREATE TABLE IF NOT EXISTS fenrir_locks (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    chat_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    rotated_from TEXT
);

CREATE INDEX IF NOT EXISTS idx_fenrir_locks_chat_id ON fenrir_locks(chat_id);
