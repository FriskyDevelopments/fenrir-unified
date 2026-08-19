/**
 * membership-facts — the single honest description of what a member actually has.
 *
 * WHY THIS EXISTS
 * Both charge rails (Telegram Stars, Stripe) and both grant rails (courtesy,
 * referral) write into D1 `billing_subscriptions`. Nothing read that row and
 * turned it into one truthful sentence, so every surface invented its own
 * version: the bot printed "Status: pending" off a table it should not consult,
 * the portal printed a raw `plan` key that is not even in its Plan union, and
 * the welcome email promised "6 MONTHS ON US" that no row backs.
 *
 * This module is the fix. It resolves facts and, critically, it is allowed to
 * answer "unknown". A field the backend cannot substantiate comes back as null
 * plus a machine-readable reason, and callers must render that reason. Nothing
 * here ever fabricates a status, an amount, or an expiry date.
 *
 * READ-ONLY. Never writes. Never touches the charge path.
 */

/** Statuses that mean "this person has access right now".
 *  Mirrors functions/_lib/plan-catalog.ts effectiveBillingPlanFromRow. */
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

/** plan key -> what a human should be told they bought. `standard` is the key
 *  the Stars/Community rails actually write; "The Pack" is its product name.
 *  Verified in wrangler.fenrir-stars.toml: FENRIR_STARS_PLAN = "standard". */
const PLAN_DISPLAY = {
  standard: "The Pack",
  starter: "Starter",
  pro: "Pro",
  operator: "Operator",
  free: "Free",
};

/** Plans that unlock the full community set.
 *  Mirrors plan-catalog.ts limitsForPlan (case "standard": case "operator":). */
const FULL_ACCESS_PLANS = new Set(["standard", "operator"]);

/** Which rail produced this row, read from the primary key we mint ourselves. */
export function railFromSubscriptionId(subscriptionId) {
  const id = String(subscriptionId || "");
  if (id.startsWith("stars:")) return { key: "telegram_stars", label: "Telegram Stars" };
  if (id.startsWith("courtesy:")) return { key: "courtesy", label: "Courtesy grant" };
  if (id.startsWith("referral:")) return { key: "referral", label: "Referral reward" };
  if (id.startsWith("sub_")) return { key: "stripe", label: "Stripe" };
  return { key: "unknown", label: null };
}

export function planDisplayName(plan) {
  const key = String(plan || "").trim().toLowerCase();
  return PLAN_DISPLAY[key] ?? null;
}

/** Feature limits for a plan. Returns null (not a guess) for unknown plans, so
 *  the UI prints "not on file" instead of inventing an allowance. */
export function limitsForPlan(plan) {
  const key = String(plan || "").trim().toLowerCase();
  if (FULL_ACCESS_PLANS.has(key)) {
    return { maxTelegramLocks: null, locksUnlimited: true, multiAdmin: true, auditLogs: true, customDomain: true };
  }
  if (key === "pro") {
    return { maxTelegramLocks: 10, locksUnlimited: false, multiAdmin: true, auditLogs: true, customDomain: false };
  }
  if (key === "starter") {
    return { maxTelegramLocks: 3, locksUnlimited: false, multiAdmin: false, auditLogs: false, customDomain: false };
  }
  if (key === "free") {
    return { maxTelegramLocks: 1, locksUnlimited: false, multiAdmin: false, auditLogs: false, customDomain: false };
  }
  return null;
}

const isoNow = () => new Date().toISOString();

/**
 * Resolve the contact address for an org, in descending order of authority.
 *
 * The identity split is the trap here. `app_users` is keyed by slug
 * (frisky_usr_*), Community Bridge wants a Supabase UUID, and existing Stars
 * rows carry frisky_org_id = NULL. Resolving "by email" is exactly what breaks
 * Telegram buyers, whose address is an Apple private-relay alias that matches
 * nothing else. So we resolve by ORG and walk real foreign keys:
 *
 *   1. telegram_identity_links.email  — the address the member proved on the
 *      Telegram link handshake. Most authoritative for a Stars purchase.
 *   2. billing_customers.email        — the address Stripe billed.
 *   3. workspaces.owner_user_id -> app_users.email — org owner of record.
 *
 * Returns { email: null, reason } when nothing resolves. Callers MUST surface
 * that reason. Silently dropping the send is the failure mode we are removing.
 */
export async function resolveContact(db, friskyOrgId) {
  const orgId = String(friskyOrgId || "").trim();
  if (!orgId) return { email: null, source: null, reason: "no_org_id" };

  const viaTelegram = await db
    .prepare(`SELECT email, telegram_user_id FROM telegram_identity_links WHERE frisky_org_id = ? AND email <> '' LIMIT 1`)
    .bind(orgId)
    .first();
  if (viaTelegram?.email) {
    return { email: viaTelegram.email, source: "telegram_identity_links", telegramUserId: viaTelegram.telegram_user_id ?? null, reason: null };
  }

  const viaBilling = await db
    .prepare(`SELECT email FROM billing_customers WHERE frisky_org_id = ? AND email <> '' LIMIT 1`)
    .bind(orgId)
    .first();
  if (viaBilling?.email) return { email: viaBilling.email, source: "billing_customers", telegramUserId: null, reason: null };

  const viaOwner = await db
    .prepare(
      `SELECT u.email AS email FROM workspaces w
         JOIN app_users u ON u.frisky_user_id = w.owner_user_id
        WHERE w.frisky_org_id = ? AND u.email <> '' LIMIT 1`
    )
    .bind(orgId)
    .first();
  if (viaOwner?.email) return { email: viaOwner.email, source: "workspaces.owner", telegramUserId: null, reason: null };

  return { email: null, source: null, telegramUserId: null, reason: "no_email_on_file" };
}

/**
 * What did this member actually pay?
 *
 * Stars: telegram_stars_entitlements.stars_amount is a real, recorded figure.
 * Courtesy/referral: nothing was charged — that is a fact, not an unknown.
 * Stripe: `billing_subscriptions` has NO amount or currency column, so the
 *   bridge genuinely does not know. We say so rather than printing a price
 *   from the marketing page that may not be what this member was charged.
 */
export async function resolveAmount(db, { subscriptionId, rail, friskyOrgId }) {
  if (rail === "courtesy" || rail === "referral") {
    return { charged: false, amount: null, currency: null, display: "No charge — granted", reason: null };
  }

  if (rail === "telegram_stars") {
    const row = await db
      .prepare(
        `SELECT stars_amount, currency FROM telegram_stars_entitlements
          WHERE frisky_org_id = ?1 OR telegram_user_id = ?2 LIMIT 1`
      )
      .bind(String(friskyOrgId || ""), String(subscriptionId || "").replace(/^stars:/, ""))
      .first();
    if (row?.stars_amount != null) {
      return {
        charged: true,
        amount: Number(row.stars_amount),
        currency: "XTR",
        display: `${Number(row.stars_amount).toLocaleString("en-US")} ⭐ Telegram Stars`,
        reason: null,
      };
    }
    return { charged: true, amount: null, currency: null, display: null, reason: "stars_row_missing" };
  }

  if (rail === "stripe") {
    // Deliberately not guessed. The $14.99 founder / $19.99 standard figures
    // live on the pricing page, not in this row, and we must not tell someone
    // they paid an amount we cannot prove. Reading it needs the Stripe API.
    return { charged: true, amount: null, currency: null, display: null, reason: "amount_not_recorded_in_bridge" };
  }

  return { charged: null, amount: null, currency: null, display: null, reason: "unknown_rail" };
}

/**
 * The whole truth about one org's membership.
 *
 * Every consumer — portal, email, celebration, bot — renders THIS. One shape,
 * one set of unknowns, so the surfaces can no longer disagree with each other.
 */
export async function getMembershipFacts(db, friskyOrgId, options = {}) {
  const now = options.now ?? isoNow();
  const orgId = String(friskyOrgId || "").trim();
  if (!orgId) {
    return { ok: false, entitled: false, reason: "no_org_id", checkedAt: now };
  }

  // Most recently updated row that is both a live status AND not past its term.
  // current_period_end IS NULL is treated as "no term recorded" (the Stars rail
  // writes NULL), never as "expired" and never as "forever".
  const row = await db
    .prepare(
      `SELECT stripe_subscription_id, frisky_org_id, stripe_customer_id, plan, status,
              current_period_end, cancel_at_period_end, created_at, updated_at
         FROM billing_subscriptions
        WHERE frisky_org_id = ?1
          AND status IN ('active','trialing','past_due')
          AND (current_period_end IS NULL OR current_period_end > ?2)
        ORDER BY updated_at DESC
        LIMIT 1`
    )
    .bind(orgId, now)
    .first();

  if (!row) {
    return {
      ok: true,
      entitled: false,
      reason: "no_active_subscription",
      friskyOrgId: orgId,
      checkedAt: now,
    };
  }

  const rail = railFromSubscriptionId(row.stripe_subscription_id);
  const planKey = String(row.plan || "").trim().toLowerCase();
  const display = planDisplayName(planKey);
  const limits = limitsForPlan(planKey);
  const [contact, amount] = await Promise.all([
    resolveContact(db, orgId),
    resolveAmount(db, { subscriptionId: row.stripe_subscription_id, rail: rail.key, friskyOrgId: orgId }),
  ]);

  return {
    ok: true,
    entitled: true,
    friskyOrgId: orgId,
    subscriptionId: row.stripe_subscription_id,
    checkedAt: now,

    plan: {
      key: planKey || null,
      // null display => the UI must say "unrecognised plan", not guess a name.
      display,
      recognised: Boolean(display),
    },

    status: {
      // The raw backend word. Surfaces render this, never a prettier synonym.
      raw: row.status,
      // past_due still grants access but is NOT a clean "active" — say so.
      needsAttention: row.status === "past_due",
      cancelAtPeriodEnd: Number(row.cancel_at_period_end) === 1,
    },

    term: {
      currentPeriodEnd: row.current_period_end ?? null,
      // The honest distinction the old email erased: "no term on file" is not
      // the same as "runs forever", and neither is a date we may print.
      known: Boolean(row.current_period_end),
      reason: row.current_period_end ? null : "no_period_end_recorded",
    },

    rail,
    amount,
    limits, // null for an unrecognised plan — render "not on file"
    contact,
    startedAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}
