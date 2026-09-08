import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_lib/lock-bot/handlers.js", () => ({ handleUpdate: vi.fn() }));
import { handleUpdate } from "../_lib/lock-bot/handlers.js";
import { onRequestPost } from "../api/lock-bot/webhook";

function callWebhook(secret: string | undefined, received?: string) {
    const headers = new Headers({ "content-type": "application/json" });
    if (received !== undefined) headers.set("x-telegram-bot-api-secret-token", received);
    return onRequestPost({
        env: { LOCK_BOT_TOKEN: "local-test-bot", LOCK_BOT_WEBHOOK_SECRET: secret },
        request: new Request("https://example.com/api/lock-bot/webhook", {
            method: "POST", headers, body: JSON.stringify({ update_id: 1 }),
        }),
    } as Parameters<typeof onRequestPost>[0]);
}

beforeEach(() => {
    vi.mocked(handleUpdate).mockResolvedValue(Response.json({ ok: true }));
});

describe("lock bot webhook authentication", () => {
    it.each([undefined, "", "   "])("fails closed when its secret is %j", async (secret) => {
        const response = await callWebhook(secret);
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ error: "lock_bot_not_configured" });
        expect(handleUpdate).not.toHaveBeenCalled();
    });

    it.each([undefined, "incorrect"])("rejects a missing or mismatched header %j", async (received) => {
        expect((await callWebhook("local-webhook-test", received)).status).toBe(401);
        expect(handleUpdate).not.toHaveBeenCalled();
    });

    it("dispatches only after the configured secret matches", async () => {
        expect((await callWebhook("local-webhook-test", "local-webhook-test")).status).toBe(200);
        expect(handleUpdate).toHaveBeenCalledExactlyOnceWith(
            { LOCK_BOT_TOKEN: "local-test-bot", LOCK_BOT_WEBHOOK_SECRET: "local-webhook-test" },
            { update_id: 1 },
        );
    });
});
