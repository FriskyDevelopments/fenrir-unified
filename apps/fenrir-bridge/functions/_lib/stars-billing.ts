import type { BillingEnv } from "./billing-env";
import { upsertSubscription } from "./billing-db";
import type { PaidPlanKey } from "./plan-catalog";

export function starsGrantedPlan(env: BillingEnv): PaidPlanKey {
  const raw = env.FENRIR_STARS_PLAN?.trim().toLowerCase();
  if (raw === "pro") return "pro";
  if (raw === "operator") return "operator";
  return "starter";
}

export async function applyStarsEntitlementForTelegramUser(
  db: D1Database,
  env: BillingEnv,
  telegramUserId: string,
  input: { starsAmount: number; payload: string; chargeId: string }
) {
  const link = await db
    .prepare(
      `SELECT frisky_org_id, frisky_user_id, email
       FROM telegram_identity_links
       WHERE telegram_user_id = ?
       LIMIT 1`
    )
    .bind(telegramUserId)
    .first<{ frisky_org_id: string; frisky_user_id: string; email: string }>();

  const plan = starsGrantedPlan(env);
  const subscriptionId = `stars:${telegramUserId}`;

  if (!link) {
    await db
      .prepare(
        `UPDATE telegram_stars_entitlements
         SET frisky_org_id = NULL,
             frisky_user_id = NULL,
             plan = ?,
             updated_at = ?
         WHERE telegram_user_id = ?`
      )
      .bind(plan, new Date().toISOString(), telegramUserId)
      .run();
    return { applied: false as const, reason: "telegram_not_linked" as const, plan };
  }

  await upsertSubscription(db, {
    stripe_subscription_id: subscriptionId,
    frisky_org_id: link.frisky_org_id,
    stripe_customer_id: `stars_${telegramUserId}`,
    plan,
    status: "active",
    current_period_end: null,
    cancel_at_period_end: false
  });

  await db
    .prepare(
      `UPDATE telegram_stars_entitlements
       SET frisky_org_id = ?, frisky_user_id = ?, plan = ?, updated_at = ?
       WHERE telegram_user_id = ?`
    )
    .bind(link.frisky_org_id, link.frisky_user_id, plan, new Date().toISOString(), telegramUserId)
    .run();

  return {
    applied: true as const,
    friskyOrgId: link.frisky_org_id,
    friskyUserId: link.frisky_user_id,
    plan,
    payload: input.payload,
    chargeId: input.chargeId,
    starsAmount: input.starsAmount
  };
}

export async function syncPendingStarsForFriskyUser(db: D1Database, env: BillingEnv, friskyUserId: string) {
  const link = await db
    .prepare(`SELECT telegram_user_id FROM telegram_identity_links WHERE frisky_user_id = ? LIMIT 1`)
    .bind(friskyUserId)
    .first<{ telegram_user_id: string }>();
  const entitlement = await db
    .prepare(
      `SELECT telegram_user_id, status, stars_amount, payload, telegram_payment_charge_id
       FROM telegram_stars_entitlements
       WHERE status = 'active'
         AND (frisky_user_id = ? OR telegram_user_id = ?)
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .bind(friskyUserId, link?.telegram_user_id ?? "")
    .first<{
      telegram_user_id: string;
      status: string;
      stars_amount: number;
      payload: string;
      telegram_payment_charge_id: string;
    }>();

  if (!entitlement) return { applied: false as const };

  return applyStarsEntitlementForTelegramUser(db, env, entitlement.telegram_user_id, {
    starsAmount: entitlement.stars_amount,
    payload: entitlement.payload,
    chargeId: entitlement.telegram_payment_charge_id
  });
}
