import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLock, getLock, listActiveLocks, rotateLock } from "../_lib/lock-bot/store";

// Execute the real SQL against Miniflare's D1 binding, including transaction
// rollback and changes(); a query-shape mock cannot verify these guarantees.
describe("lock bot D1 rotation", () => {
    let runtime: Miniflare;
    let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;

    beforeAll(async () => {
        runtime = new Miniflare({
            modules: true,
            script: "export default { fetch() { return new Response('local test'); } }",
            compatibilityDate: "2026-05-01",
            d1Databases: ["DB"],
        });
        db = await runtime.getD1Database("DB");
        const schema = readFileSync(new URL("../../docs/lock-bot-d1-schema.sql", import.meta.url), "utf8");
        // D1 exec expects each complete statement on one line.
        await db.exec(schema.replace(/--[^\n]*/g, "").split(";").map((sql) => sql.replace(/\s+/g, " ").trim()).filter(Boolean).join(";\n") + ";");
    });
    beforeEach(async () => { await db.prepare("DELETE FROM invite_locks").run(); });
    afterAll(async () => { await runtime?.dispose(); });

    it("allows exactly one concurrent rotation after both callers read an active lock", async () => {
        const original = await createLock("example.com", 123, { DB: db });
        let reads = 0;
        let release!: () => void;
        const bothRead = new Promise<void>((resolve) => { release = resolve; });
        const racingDb = {
            prepare(sql: string) {
                if (sql !== "SELECT * FROM invite_locks WHERE id = ?") return db.prepare(sql);
                return {
                    bind(...values: unknown[]) {
                        return {
                            async first() {
                                const row = await db.prepare(sql).bind(...values).first();
                                if (++reads === 2) release();
                                await bothRead;
                                return row;
                            },
                        };
                    },
                };
            },
            batch: db.batch.bind(db),
        };
        const results = await Promise.all([
            rotateLock(original.id, 123, { DB: racingDb }),
            rotateLock(original.id, 123, { DB: racingDb }),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
        expect(results.filter((result) => result === null)).toHaveLength(1);
        const active = await listActiveLocks(123, { DB: db });
        expect(active).toHaveLength(1);
        expect(active[0].rotatedFrom).toBe(original.id);
        expect(await getLock(original.id, { DB: db })).toMatchObject({ revoked: true });
        expect(await db.prepare("SELECT COUNT(*) AS total FROM invite_locks").first("total")).toBe(2);
    });

    it("does not rotate a revoked lock or a lock owned by another chat", async () => {
        const original = await createLock("example.com", 123, { DB: db });
        expect(await rotateLock(original.id, 456, { DB: db })).toBeNull();
        expect(await getLock(original.id, { DB: db })).toMatchObject({ revoked: false });
        expect(await rotateLock(original.id, 123, { DB: db })).not.toBeNull();
        expect(await rotateLock(original.id, 123, { DB: db })).toBeNull();
        expect(await listActiveLocks(123, { DB: db })).toHaveLength(1);
    });

    it("rolls back revocation if insertion fails", async () => {
        const original = await createLock("example.com", 123, { DB: db });
        await db.exec("CREATE TRIGGER fail_rotation BEFORE INSERT ON invite_locks WHEN NEW.rotated_from IS NOT NULL BEGIN SELECT RAISE(ABORT, 'rotation deliberately failed'); END;");
        try {
            await expect(rotateLock(original.id, 123, { DB: db })).rejects.toThrow();
            expect(await getLock(original.id, { DB: db })).toMatchObject({ revoked: false });
            expect(await listActiveLocks(123, { DB: db })).toHaveLength(1);
        } finally {
            await db.exec("DROP TRIGGER fail_rotation;");
        }
    });
});
