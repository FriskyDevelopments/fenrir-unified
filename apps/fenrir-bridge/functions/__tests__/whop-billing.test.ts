import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { onRequestPost as whopWebhook } from "../api/whop/webhook";
import {
  isWhopBillingEnabled,
  paidPlanFromWhopVariantId,
  parseWhopEvent,
  periodEndForWhopMembership,
  planFromWhopMembership,
  verifyWhopSignature
} from "../_lib/whop";

const SECRET = "ws_test_secret";
const ENV = {
  WHOP_BILLING_ENABLED: "true",
  WHOP_WEBHOOK_SECRET: SECRET,
  WHOP_STARTER_PLAN_ID: "plan_starter",
  WHOP_PRO_PLAN_ID: "plan_pro",
  WHOP_OPERATOR_PLAN_ID: "plan_operator"
} as const;

function sign(body: string, id = "msg_test_1", timestamp = String(Math.floor(Date.now() / 1000))) {
  const sig = createHmac("sha256", SECRET)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-signature": `v1,${sig}`,
    "webhook-timestamp": timestamp,
    "content-type": "application/json"
  });
}

function membershipEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test_1",
    type: "membership.activated",
    data: {
      id: "mem_123",
      status: "active",
      user_id: "user_1",
      member_id: "mber_1",
      product_id: "prod_1",
      variant_id: "plan_pro",
      cancel_at_period_end: false,
      current_period_end: "2026-12-02T00:00:00.000Z",
      billing_period_days: 30,
      metadata: { frisky_org_id: "org_1", frisky_user_id: "user_1", plan: "pro", email: "a@example.com" },
      ...overrides
    }
  };
}

/** Minimal D1 fake: tracks whop_events claims and records every write. */
function fakeDb() {
  const claimed = new Set<string>();
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              writes.push({ sql, params });
              if (sql.includes("INTO whop_events")) {
                const id = String(params[0]);
                if (claimed.has(id)) return { success: true, meta: { changes: 0 } };
                claimed.add(id);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              return null;
            }
          };
        }
      };
    }
  };
  return { db: db as unknown as D1Database, writes };
}

describe("whop signature + plan mapping", () => {
  it("accepts a valid signature and rejects tampering and stale timestamps", async () => {
    const body = JSON.stringify(membershipEvent());
    const headers = sign(body);
    expect(await verifyWhopSignature(body, headers, SECRET)).toBe(true);
    expect(await verifyWhopSignature(body + " ", headers, SECRET)).toBe(false);
    const stale = sign(body, "msg_test_1", String(Math.floor(Date.now() / 1000) - 1000));
    expect(await verifyWhopSignature(body, stale, SECRET)).toBe(false);
    expect(await verifyWhopSignature(body, new Headers(), SECRET)).toBe(false);
  });

  it("keeps Whop gated by its own flag, independent of Stripe", () => {
    expect(isWhopBillingEnabled({})).toBe(false);
    expect(isWhopBillingEnabled({ WHOP_BILLING_ENABLED: "true" })).toBe(true);
    expect(isWhopBillingEnabled({ CARD_BILLING_ENABLED: "true" })).toBe(false);
  });

  it("maps variant ids to plans, falling back to checkout metadata", () => {
    expect(paidPlanFromWhopVariantId(ENV, "plan_pro")).toBe("pro");
    expect(paidPlanFromWhopVariantId(ENV, "plan_unknown")).toBeNull();
    expect(planFromWhopMembership(ENV, { id: "mem_x", status: "active", variant_id: "plan_unknown", metadata: { plan: "starter" } })).toBe("starter");
  });

  it("never writes a NULL period end for an active membership", () => {
    const withEnd = periodEndForWhopMembership({ id: "m", status: "active", current_period_end: "2026-12-02T00:00:00.000Z" });
    expect(withEnd).toBe("2026-12-02T00:00:00.000Z");
    const fallback = periodEndForWhopMembership({ id: "m", status: "active", current_period_end: null });
    expect(fallback).not.toBeNull();
    expect(periodEndForWhopMembership({ id: "m", status: "canceled", current_period_end: null })).toBeNull();
  });

  it("rejects malformed events", () => {
    expect(parseWhopEvent("not json")).toBeNull();
    expect(parseWhopEvent(JSON.stringify({ type: "membership.activated", data: { id: "mem_1" } }))).toBeNull();
  });
});

describe("whop webhook handler", () => {
  it("returns 409 when disabled and 503 when the secret is missing", async () => {
    const { db } = fakeDb();
    const body = JSON.stringify(membershipEvent());
    const disabled = await whopWebhook({ request: new Request("https://myfenrir.com/api/whop/webhook", { method: "POST", headers: sign(body), body }), env: { DB: db } as never });
    expect(disabled.status).toBe(409);
    const noSecret = await whopWebhook({ request: new Request("https://myfenrir.com/api/whop/webhook", { method: "POST", headers: sign(body), body }), env: { DB: db, WHOP_BILLING_ENABLED: "true" } as never });
    expect(noSecret.status).toBe(503);
  });

  it("rejects an invalid signature with 400", async () => {
    const { db } = fakeDb();
    const body = JSON.stringify(membershipEvent());
    const res = await whopWebhook({ request: new Request("https://myfenrir.com/api/whop/webhook", { method: "POST", headers: new Headers({ "webhook-id": "msg_test_1", "webhook-signature": "v1,bogus", "webhook-timestamp": String(Math.floor(Date.now() / 1000)) }), body }), env: { DB: db, ...ENV } as never });
    expect(res.status).toBe(400);
  });

  it("grants a pro membership once, then reports the repeat as duplicate", async () => {
    const { db, writes } = fakeDb();
    const body = JSON.stringify(membershipEvent());
    const req = () => new Request("https://myfenrir.com/api/whop/webhook", { method: "POST", headers: sign(body), body });
    const first = await whopWebhook({ request: req(), env: { DB: db, ...ENV } as never });
    expect(first.status).toBe(200);
    const subscriptionWrite = writes.find((w) => w.sql.includes("INTO billing_subscriptions"));
    expect(subscriptionWrite).toBeDefined();
    // whop: prefix + pro plan in the subscription row binds
    expect(JSON.stringify(subscriptionWrite?.params)).toContain("whop:mem_123");
    expect(JSON.stringify(subscriptionWrite?.params)).toContain("pro");
    const second = await whopWebhook({ request: req(), env: { DB: db, ...ENV } as never });
    expect((await second.json() as { duplicate?: boolean }).duplicate).toBe(true);
  });

  it("grants nothing when checkout metadata has no org", async () => {
    const { db, writes } = fakeDb();
    const event = membershipEvent({ metadata: {} });
    const body = JSON.stringify(event);
    const res = await whopWebhook({ request: new Request("https://myfenrir.com/api/whop/webhook", { method: "POST", headers: sign(body), body }), env: { DB: db, ...ENV } as never });
    expect(res.status).toBe(200);
    expect(writes.some((w) => w.sql.includes("INTO billing_subscriptions"))).toBe(false);
  });

  it("acknowledges payment.failed without revoking (no subscription write)", async () => {
    const { db, writes } = fakeDb();
    const event = { ...membershipEvent(), id: "msg_pay_1", type: "payment.failed" };
    const body = JSON.stringify(event);
    const res = await whopWebhook({ request: new Request("https://myfenrir.com/api/whop/webhook", { method: "POST", headers: sign(body, "msg_pay_1"), body }), env: { DB: db, ...ENV } as never });
    expect(res.status).toBe(200);
    expect(writes.some((w) => w.sql.includes("INTO billing_subscriptions"))).toBe(false);
  });
});
