/**
 * Lock store — dual-mode: D1 (production) | in-memory (fallback/dev).
 *
 * Production uses Cloudflare D1 (SQLite via env.DB binding).
 * When env.DB is undefined, falls back to an in-memory Map
 * (useful for testing, but data does not survive cold starts).
 *
 * Schema: see docs/lock-bot-d1-schema.sql
 */

export interface InviteLock {
    id: string;
    domain: string;
    chatId: number;
    /** ISO-8601 (e.g. "2026-06-19T12:34:56.789Z"). Must be zero-padded + T separator so ORDER BY sorts lexicographically. Never switch to epoch millis here. */
    createdAt: string;
    revoked: boolean;
    rotatedFrom?: string;
}

// ── D1 row shape (snake_case → camelCase) ────────────────
interface D1Row {
    id: string;
    domain: string;
    chat_id: number;
    created_at: string;
    revoked: number;
    rotated_from: string | null;
}

function rowToLock(row: D1Row): InviteLock {
    return {
        id: row.id,
        domain: row.domain,
        chatId: row.chat_id,
        createdAt: row.created_at,
        revoked: row.revoked === 1,
        rotatedFrom: row.rotated_from ?? undefined,
    };
}

// ── ID generation ─────────────────────────────────────────
function generateId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const parts: string[] = [];
    for (let i = 0; i < 3; i++) {
        let s = "";
        for (let j = 0; j < 4; j++) s += chars[Math.floor(Math.random() * chars.length)];
        parts.push(s);
    }
    return `fnr-${parts.join("-")}`;
}

// ── In-memory fallback store ──────────────────────────────
class MemStore {
    private locks = new Map<string, InviteLock>();
    get(lockId: string): InviteLock | undefined {
        return this.locks.get(lockId);
    }
    set(lock: InviteLock): void {
        this.locks.set(lock.id, lock);
    }
    listActive(chatId: number): InviteLock[] {
        const r: InviteLock[] = [];
        for (const l of this.locks.values()) {
            if (l.chatId === chatId && !l.revoked) r.push(l);
        }
        return r;
    }
}
const mem = new MemStore();

// ── Type helpers ──────────────────────────────────────────
interface EnvMaybe {
    DB?: unknown;
}

function hasDB(env?: EnvMaybe): boolean {
    return Boolean(env?.DB);
}

// ── Public API ────────────────────────────────────────────

/** Create a new lock. */
export async function createLock(
    domain: string,
    chatId: number,
    env?: EnvMaybe,
): Promise<InviteLock> {
    const now = new Date().toISOString();

    if (hasDB(env)) {
        const db = env.DB as any;
        for (let attempt = 0; attempt < 5; attempt++) {
            const id = generateId();
            const hit = await db
                .prepare("SELECT id FROM invite_locks WHERE id = ?")
                .bind(id)
                .first();
            if (!hit) {
                await db
                    .prepare(
                        "INSERT INTO invite_locks (id, domain, chat_id, created_at, revoked) VALUES (?, ?, ?, ?, 0)",
                    )
                    .bind(id, domain, chatId, now)
                    .run();
                return { id, domain, chatId, createdAt: now, revoked: false };
            }
        }
        throw new Error("failed to generate unique lock id after 5 attempts");
    }

    // In-memory fallback
    let id: string;
    do {
        id = generateId();
    } while (mem.get(id));
    const lock: InviteLock = { id, domain, chatId, createdAt: now, revoked: false };
    mem.set(lock);
    return lock;
}

/** Get a lock by ID. */
export async function getLock(
    lockId: string,
    env?: EnvMaybe,
): Promise<InviteLock | undefined> {
    if (hasDB(env)) {
        const db = env.DB as any;
        const row: D1Row | null = await db
            .prepare("SELECT * FROM invite_locks WHERE id = ?")
            .bind(lockId)
            .first();
        return row ? rowToLock(row) : undefined;
    }
    return mem.get(lockId);
}

/**
 * Rotate a lock: revoke old, create fresh.
 * Returns { old, fresh } or null if lock not found / already revoked.
 */
export async function rotateLock(
    lockId: string,
    chatId: number,
    env?: EnvMaybe,
): Promise<{ old: InviteLock; fresh: InviteLock } | null> {
    const existing = await getLock(lockId, env);
    if (!existing || existing.revoked) return null;

    const now = new Date().toISOString();

    if (hasDB(env)) {
        const db = env.DB as any;

        for (let attempt = 0; attempt < 5; attempt++) {
            const freshId = generateId();

            // Atomic batch: UPDATE (revoke old) + INSERT (create fresh)
            // If either fails, both roll back — no half-state.
            try {
                await db.batch([
                    db
                        .prepare("UPDATE invite_locks SET revoked = 1 WHERE id = ?")
                        .bind(lockId),
                    db
                        .prepare(
                            "INSERT INTO invite_locks (id, domain, chat_id, created_at, revoked, rotated_from) VALUES (?, ?, ?, ?, 0, ?)",
                        )
                        .bind(freshId, existing.domain, chatId, now, lockId),
                ]);

                const fresh: InviteLock = {
                    id: freshId,
                    domain: existing.domain,
                    chatId,
                    createdAt: now,
                    revoked: false,
                    rotatedFrom: lockId,
                };
                return { old: { ...existing, revoked: true }, fresh };
            } catch (batchErr) {
                // SQLITE_CONSTRAINT_UNIQUE on freshId collision — retry
                // Other errors bubble up to the outer try/catch in handleUpdate
                const msg = String(batchErr);
                if (!msg.includes("UNIQUE") && !msg.includes("SQLITE_CONSTRAINT")) {
                    throw batchErr;
                }
                // Collision — loop to regenerate freshId
            }
        }
        throw new Error("failed to generate unique lock id after 5 attempts");
    }

    // In-memory fallback
    existing.revoked = true;
    let freshId: string;
    do {
        freshId = generateId();
    } while (mem.get(freshId));
    const fresh: InviteLock = {
        id: freshId,
        domain: existing.domain,
        chatId,
        createdAt: now,
        revoked: false,
        rotatedFrom: lockId,
    };
    mem.set(fresh);
    return { old: existing, fresh };
}

/** Revoke (soft-delete) a lock. Returns the updated lock or null. */
export async function revokeLock(
    lockId: string,
    env?: EnvMaybe,
): Promise<InviteLock | null> {
    const existing = await getLock(lockId, env);
    if (!existing || existing.revoked) return null;

    if (hasDB(env)) {
        const db = env.DB as any;
        await db
            .prepare("UPDATE invite_locks SET revoked = 1 WHERE id = ?")
            .bind(lockId)
            .run();
    }

    existing.revoked = true;
    return existing;
}

/** List active (non-revoked) locks for a chat. */
export async function listActiveLocks(
    chatId: number,
    env?: EnvMaybe,
): Promise<InviteLock[]> {
    if (hasDB(env)) {
        const db = env.DB as any;
        const { results } = await db
            .prepare(
                "SELECT * FROM invite_locks WHERE chat_id = ? AND revoked = 0 ORDER BY created_at DESC",
            )
            .bind(chatId)
            .all<D1Row>();
        return (results ?? []).map(rowToLock);
    }
    return mem.listActive(chatId);
}

/** Count active locks for a chat. */
export async function countActiveLocks(
    chatId: number,
    env?: EnvMaybe,
): Promise<number> {
    if (hasDB(env)) {
        const db = env.DB as any;
        const row: { count: number } | null = await db
            .prepare(
                "SELECT COUNT(*) as count FROM invite_locks WHERE chat_id = ? AND revoked = 0",
            )
            .bind(chatId)
            .first();
        return row?.count ?? 0;
    }
    return mem.listActive(chatId).length;
}
