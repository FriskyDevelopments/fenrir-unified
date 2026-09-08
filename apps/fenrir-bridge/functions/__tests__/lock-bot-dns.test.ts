import { afterEach, describe, expect, it, vi } from "vitest";
import { expectedToken, verifyDns } from "../_lib/lock-bot/dns";

const domain = "example.com";
const chatId = 123;
const secret = "local-dns-verification-test";

function respondWith(payload: unknown) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
}

afterEach(() => vi.unstubAllGlobals());

describe("lock bot DNS verification", () => {
    it.each([null, [], { Answer: null }, { Answer: "invalid" }, { Answer: [null] }])(
        "returns a lookup verdict for malformed DNS payload %j", async (payload) => {
            respondWith(payload);
            await expect(verifyDns(domain, chatId, secret)).resolves.toEqual({ ok: false, reason: "lookup_failed" });
        },
    );

    it.each([{}, { Answer: [] }])("handles a missing TXT record %j", async (payload) => {
        respondWith(payload);
        await expect(verifyDns(domain, chatId, secret)).resolves.toEqual({ ok: false, reason: "record_missing" });
    });

    it.each([" ", ""])("joins TXT character strings with separator %j", async (separator) => {
        const token = await expectedToken(domain, chatId, secret);
        respondWith({ Answer: [{ data: `"fenrir-lock-"${separator}"${token.slice(12)}"` }] });
        await expect(verifyDns(domain, chatId, secret)).resolves.toEqual({ ok: true });
    });

    it("accepts one quoted TXT character string", async () => {
        const token = await expectedToken(domain, chatId, secret);
        respondWith({ Answer: [{ data: `"${token}"` }] });
        expect(await verifyDns(domain, chatId, secret)).toEqual({ ok: true });
    });

    it("preserves content whitespace and rejects unparsed trailing data", async () => {
        const token = await expectedToken(domain, chatId, secret);
        for (const data of [`"fenrir-lock- " "${token.slice(12)}"`, `"${token}" invalid`]) {
            respondWith({ Answer: [{ data }] });
            expect(await verifyDns(domain, chatId, secret)).toEqual({ ok: false, reason: "token_mismatch" });
        }
    });

    it("does not combine separate TXT records", async () => {
        const token = await expectedToken(domain, chatId, secret);
        respondWith({ Answer: [{ data: '"fenrir-lock-"' }, { data: `"${token.slice(12)}"` }] });
        expect(await verifyDns(domain, chatId, secret)).toEqual({ ok: false, reason: "token_mismatch" });
    });
});
