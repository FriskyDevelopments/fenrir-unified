import { nanoid } from "nanoid";
import type { InviteLock } from "./types.js";

/**
 * Cloudflare D1 Database adapter for LockStore
 */
export class LockStore {
    constructor(private db: D1Database) {}

    /** Generate a new lock code e.g. "fnr-8x4m-k2p9" */
    private generateCode(): string {
        const id = nanoid(10); // 10-char nanoid ≈ 58 bits of entropy
        return `fnr-${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}`;
    }

    /** Ensure uniqueness (extremely unlikely collision, but belt-and-suspenders) */
    private async uniqueCode(): Promise<string> {
        let code: string;
        let isUnique = false;
        do {
            code = this.generateCode();
            const existing = await this.get(code);
            if (!existing) isUnique = true;
        } while (!isUnique);
        return code;
    }

    /** Create a new lock for a domain */
    async create(domain: string, chatId: number): Promise<InviteLock> {
        const id = await this.uniqueCode();
        const lock: InviteLock = {
            id,
            domain,
            chatId,
            createdAt: Date.now(),
            revoked: false,
        };

        await this.db
            .prepare(
                `INSERT INTO fenrir_locks (id, domain, chat_id, created_at, revoked) VALUES (?, ?, ?, ?, ?)`
            )
            .bind(lock.id, lock.domain, lock.chatId, lock.createdAt, lock.revoked ? 1 : 0)
            .run();

        return lock;
    }

    /** Rotate a lock: revoke old, create new */
    async rotate(lockId: string, chatId: number): Promise<{ old: InviteLock; fresh: InviteLock } | null> {
        const existing = await this.get(lockId);
        if (!existing || existing.revoked) return null;

        existing.revoked = true;

        const fresh: InviteLock = {
            id: await this.uniqueCode(),
            domain: existing.domain,
            chatId,
            createdAt: Date.now(),
            revoked: false,
            rotatedFrom: existing.id,
        };

        const batch = [
            this.db
                .prepare(`UPDATE fenrir_locks SET revoked = 1 WHERE id = ?`)
                .bind(existing.id),
            this.db
                .prepare(
                    `INSERT INTO fenrir_locks (id, domain, chat_id, created_at, revoked, rotated_from) VALUES (?, ?, ?, ?, ?, ?)`
                )
                .bind(fresh.id, fresh.domain, fresh.chatId, fresh.createdAt, fresh.revoked ? 1 : 0, fresh.rotatedFrom),
        ];

        await this.db.batch(batch);
        return { old: existing, fresh };
    }

    /** Revoke (soft-delete) a lock */
    async revoke(lockId: string): Promise<InviteLock | null> {
        const lock = await this.get(lockId);
        if (!lock || lock.revoked) return null;
        lock.revoked = true;

        await this.db
            .prepare(`UPDATE fenrir_locks SET revoked = 1 WHERE id = ?`)
            .bind(lock.id)
            .run();

        return lock;
    }

    /** Get a single lock by id */
    async get(lockId: string): Promise<InviteLock | undefined> {
        const row = await this.db
            .prepare(`SELECT * FROM fenrir_locks WHERE id = ?`)
            .bind(lockId)
            .first();

        if (!row) return undefined;
        return this.mapRow(row);
    }

    /** List all non-revoked locks for a user (chat) */
    async listActive(chatId: number): Promise<InviteLock[]> {
        const { results } = await this.db
            .prepare(`SELECT * FROM fenrir_locks WHERE chat_id = ? AND revoked = 0 ORDER BY created_at DESC`)
            .bind(chatId)
            .all();
        
        return results.map(row => this.mapRow(row));
    }

    /** List all locks for a user (including revoked) */
    async listAll(chatId: number): Promise<InviteLock[]> {
        const { results } = await this.db
            .prepare(`SELECT * FROM fenrir_locks WHERE chat_id = ? ORDER BY created_at DESC`)
            .bind(chatId)
            .all();

        return results.map(row => this.mapRow(row));
    }

    /** Count active locks for a chat */
    async countActive(chatId: number): Promise<number> {
        const row = await this.db
            .prepare(`SELECT COUNT(*) as count FROM fenrir_locks WHERE chat_id = ? AND revoked = 0`)
            .bind(chatId)
            .first();
        return (row?.count as number) || 0;
    }

    private mapRow(row: any): InviteLock {
        return {
            id: row.id,
            domain: row.domain,
            chatId: row.chat_id,
            createdAt: row.created_at,
            revoked: row.revoked === 1,
            rotatedFrom: row.rotated_from || undefined,
        };
    }
}
