import type { BillingEnv } from "./billing-env";
import { effectiveBillingPlanFromRow, type BillingPlanKey, type PaidPlanKey } from "./plan-catalog";

export type BillingCustomerRow = {
  frisky_org_id: string;
  frisky_user_id: string;
  stripe_customer_id: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type BillingSubscriptionRow = {
  stripe_subscription_id: string;
  frisky_org_id: string;
  stripe_customer_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
};

export async function getCustomer(db: D1Database, orgId: string) {
  return await db
    .prepare(`SELECT * FROM billing_customers WHERE frisky_org_id = ?`)
    .bind(orgId)
    .first<BillingCustomerRow>();
}

export async function getPrimarySubscriptionForOrg(db: D1Database, orgId: string) {
  return await db
    .prepare(
      `SELECT * FROM billing_subscriptions
       WHERE frisky_org_id = ?
       ORDER BY
         CASE status
           WHEN 'active' THEN 0
           WHEN 'trialing' THEN 1
           WHEN 'past_due' THEN 2
           WHEN 'canceled' THEN 8
           ELSE 5
         END,
         updated_at DESC
       LIMIT 1`
    )
    .bind(orgId)
    .first<BillingSubscriptionRow>();
}

export async function getSubscriptionByStripeId(db: D1Database, stripeSubscriptionId: string) {
  return await db
    .prepare(`SELECT * FROM billing_subscriptions WHERE stripe_subscription_id = ?`)
    .bind(stripeSubscriptionId)
    .first<BillingSubscriptionRow>();
}

const nowIso = () => new Date().toISOString();

export async function upsertCustomer(
  db: D1Database,
  input: {
    frisky_org_id: string;
    frisky_user_id: string;
    stripe_customer_id: string;
    email: string;
  }
) {
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO billing_customers (
        frisky_org_id, frisky_user_id, stripe_customer_id, email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(frisky_org_id) DO UPDATE SET
        frisky_user_id = excluded.frisky_user_id,
        stripe_customer_id = excluded.stripe_customer_id,
        email = excluded.email,
        updated_at = excluded.updated_at`
    )
    .bind(input.frisky_org_id, input.frisky_user_id, input.stripe_customer_id, input.email, ts, ts)
    .run();
}

export async function upsertSubscription(
  db: D1Database,
  input: {
    stripe_subscription_id: string;
    frisky_org_id: string;
    stripe_customer_id: string;
    plan: PaidPlanKey;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  }
) {
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO billing_subscriptions (
        stripe_subscription_id,
        frisky_org_id,
        stripe_customer_id,
        plan,
        status,
        current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stripe_subscription_id) DO UPDATE SET
        frisky_org_id = excluded.frisky_org_id,
        stripe_customer_id = excluded.stripe_customer_id,
        plan = excluded.plan,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        updated_at = excluded.updated_at`
    )
    .bind(
      input.stripe_subscription_id,
      input.frisky_org_id,
      input.stripe_customer_id,
      input.plan,
      input.status,
      input.current_period_end,
      input.cancel_at_period_end ? 1 : 0,
      ts,
      ts
    )
    .run();
}

export async function tryClaimStripeEvent(db: D1Database, eventId: string) {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO stripe_events (id, received_at) VALUES (?, ?)`)
    .bind(eventId, nowIso())
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function releaseStripeEvent(db: D1Database, eventId: string) {
  await db.prepare(`DELETE FROM stripe_events WHERE id = ?`).bind(eventId).run();
}

export async function resolveBillingForOrg(env: BillingEnv, orgId: string) {
  if (!env.DB) {
    return { customer: null as BillingCustomerRow | null, subscription: null as BillingSubscriptionRow | null };
  }
  const customer = await getCustomer(env.DB, orgId);
  const subscription = await getPrimarySubscriptionForOrg(env.DB, orgId);
  return { customer, subscription };
}

export async function effectiveOrgBillingPlan(env: BillingEnv, orgId: string): Promise<BillingPlanKey> {
  if (!env.DB) return "free";
  const sub = await getPrimarySubscriptionForOrg(env.DB, orgId);
  return effectiveBillingPlanFromRow(sub);
}
