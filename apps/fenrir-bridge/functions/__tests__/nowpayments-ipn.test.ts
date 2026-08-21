import { describe, expect, it, vi } from "vitest";
import worker from "../../workers/fenrir-stars-payments.js";

const ipnSecret = "test-nowpayments-ipn-secret";
const userId = "11111111-1111-4111-8111-111111111111";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = sortDeep((value as Record<string, unknown>)[key]);
    return result;
  }, {});
}

async function signedIpnRequest(body: Record<string, unknown>) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ipnSecret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(sortDeep(body)))));
  const hex = [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request("https://worker.test/api/nowpayments/ipn", { method: "POST", headers: { "content-type": "application/json", "x-nowpayments-sig": hex }, body: JSON.stringify(body) });
}

function confirmedInvoice(overrides: Record<string, unknown> = {}) {
  return { payment_id: "payment_pack_123", payment_status: "confirmed", order_id: `mf-${userId}-1724200000000`, price_amount: 14.99, price_currency: "usd", ...overrides };
}

function subscriptionDb() {
  const subscriptions = new Map<string, unknown[]>();
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  return { subscriptions, writes, DB: { prepare: vi.fn((sql: string) => ({ bind: (...params: unknown[]) => ({ run: async () => { writes.push({ sql, params }); subscriptions.set(String(params[0]), params); return { success: true }; } }) })) } };
}

describe("NOWPayments IPN Pack validation", () => {
  it("activates a signed, confirmed US$14.99 Pack invoice", async () => {
    const db = subscriptionDb();
    const response = await worker.fetch(await signedIpnRequest(confirmedInvoice()), { NOWPAYMENTS_IPN_SECRET: ipnSecret, DB: db.DB });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, activated: true });
    expect(db.subscriptions.get("nowpayments:payment_pack_123")?.slice(0, 3)).toEqual(["nowpayments:payment_pack_123", userId, "nowpayments_payment_pack_123"]);
  });

  it("rejects a signed callback whose Pack amount was altered", async () => {
    const db = subscriptionDb();
    const response = await worker.fetch(await signedIpnRequest(confirmedInvoice({ price_amount: 14.98 })), { NOWPAYMENTS_IPN_SECRET: ipnSecret, DB: db.DB });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_order" });
    expect(db.writes).toHaveLength(0);
  });

  it("keeps duplicate confirmed callbacks idempotent", async () => {
    const db = subscriptionDb();
    const invoice = confirmedInvoice();
    const env = { NOWPAYMENTS_IPN_SECRET: ipnSecret, DB: db.DB };
    await expect(worker.fetch(await signedIpnRequest(invoice), env).then((response) => response.json())).resolves.toEqual({ ok: true, activated: true });
    await expect(worker.fetch(await signedIpnRequest(invoice), env).then((response) => response.json())).resolves.toEqual({ ok: true, activated: true });
    expect(db.writes).toHaveLength(2);
    expect(db.subscriptions).toHaveLength(1);
    expect(db.writes.every(({ params }) => params[0] === "nowpayments:payment_pack_123")).toBe(true);
    expect(db.writes.every(({ sql }) => sql.includes("ON CONFLICT(stripe_subscription_id) DO UPDATE SET"))).toBe(true);
  });
});
