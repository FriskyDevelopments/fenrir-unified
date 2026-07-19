/**
 * Lock store — currently in-memory (per-isolate).
 *
 * For production, swap this with D1 (Cloudflare's SQLite):
 *   const lock = await env.DB.prepare("SELECT * FROM invite_locks WHERE id = ?").bind(lockId).first<InviteLock>();
 *
 * See: docs/telegram-identity-d1-schema.sql for the project's D1 conventions.
 */

export interface InviteLock {
    id: string;
    domain: string;
    chatId: number;
    createdAt: number;
    revoked: boolean;
    rotatedFrom?: string;
}

function generateId(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const parts: string[] = [];
    for (let i = 0; i < 3; i++) {
        let s = "";
        for (let j = 0; j < 4; j++) {
            s += chars[Math.floor(Math.random() * chars.length)];
        }
        parts.push(s);
    }
    return `fnr-${parts.join("-")}`;
}

class LockStore {
    private locks = new Map<string, InviteLock>();

    create(domain: string, chatId: number): InviteLock {
        let id: string;
        do { id = generateId(); } while (this.locks.has(id));
        const lock: InviteLock = { id, domain, chatId, createdAt: Date.now(), revoked: false };
        this.locks.set(id, lock);
        return lock;
    }

    rotate(lockId: string, chatId: number): { old: InviteLock; fresh: InviteLock } | null {
        const existing = this.locks.get(lockId);
        if (!existing || existing.revoked) return null;
        existing.revoked = true;
        let id: string;
        do { id = generateId(); } while (this.locks.has(id));
        const fresh: InviteLock = {
            id, domain: existing.domain, chatId,
            createdAt: Date.now(), revoked: false, rotatedFrom: existing.id,
        };
        this.locks.set(id, fresh);
        return { old: existing, fresh };
    }

    revoke(lockId: string): InviteLock | null {
        const lock = this.locks.get(lockId);
        if (!lock || lock.revoked) return null;
        lock.revoked = true;
        return lock;
    }

    get(lockId: string): InviteLock | undefined {
        return this.locks.get(lockId);
    }

    listActive(chatId: number): InviteLock[] {
        const result: InviteLock[] = [];
        for (const lock of this.locks.values()) {
            if (lock.chatId === chatId && !lock.revoked) result.push(lock);
        }
        return result;
    }

    countActive(chatId: number): number {
        return this.listActive(chatId).length;
    }
}

export const lockStore = new LockStore();
