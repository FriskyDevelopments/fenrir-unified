import { neonSql } from "./neon.server";
import type { EntitlementStore, FounderEntitlement } from "./stripe-webhook";

export async function ensureBillingTables(sql = neonSql()): Promise<void> {
  await sql`create table if not exists cb_billing_entitlements (
    user_id uuid primary key,
    stripe_customer_id text,
    stripe_subscription_id text unique,
    offer text not null,
    status text not null,
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists cb_stripe_events (
    event_id text primary key,
    processed_at timestamptz not null default now()
  )`;
}

export function neonEntitlementStore(sql = neonSql()): EntitlementStore {
  return {
    async hasProcessedEvent(eventId) {
      const rows = (await sql`select event_id from cb_stripe_events where event_id = ${eventId} limit 1`) as Record<string, unknown>[];
      return rows.length > 0;
    },
    async apply(eventId: string, entitlement: FounderEntitlement) {
      await sql.transaction([
        sql`insert into cb_billing_entitlements (user_id, stripe_customer_id, stripe_subscription_id, offer, status)
            values (${entitlement.userId}, ${entitlement.customerId}, ${entitlement.subscriptionId}, ${entitlement.offer}, ${entitlement.status})
            on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id,
              stripe_subscription_id = excluded.stripe_subscription_id, offer = excluded.offer,
              status = excluded.status, updated_at = now()`,
        sql`insert into cb_stripe_events (event_id) values (${eventId}) on conflict do nothing`,
      ]);
    },
  };
}

export async function founderCheckoutEligibility(userId: string): Promise<{ eligible: boolean; reason?: string }> {
  const sql = neonSql();
  await ensureBillingTables(sql);
  const rows = (await sql`select status from cb_billing_entitlements where user_id = ${userId} limit 1`) as Record<string, unknown>[];
  return rows[0]?.["status"] === "active"
    ? { eligible: false, reason: "Founder membership is already active" }
    : { eligible: true };
}
