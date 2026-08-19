/**
 * The honesty contract for membership-facts.
 *
 * These tests exist to stop a well-meaning future change from turning an
 * unknown into a plausible-looking default. Every assertion below is really
 * asserting one rule: we would rather say "we don't know" than say something
 * the database does not support.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain-JS module shared with the worker runtime.
import {
  getMembershipFacts,
  limitsForPlan,
  planDisplayName,
  railFromSubscriptionId,
  resolveContact,
} from "../../workers/_lib/membership-facts.js";

/** Minimal D1 stub: matches a query by substring, returns a canned row. */
function stubDb(routes: Array<{ match: string; row: unknown }>) {
  return {
    prepare(sql: string) {
      const hit = routes.find((r) => sql.includes(r.match));
      const make = () => ({
        first: async () => hit?.row ?? null,
        all: async () => ({ results: hit?.row ? [hit.row] : [] }),
        run: async () => ({ success: true, meta: { changes: 1 } }),
      });
      return { bind: () => make(), ...make() };
    },
  };
}

const activeSub = {
  stripe_subscription_id: "stars:8820331947",
  frisky_org_id: "org_1",
  stripe_customer_id: "stars_8820331947",
  plan: "standard",
  status: "active",
  current_period_end: null,
  cancel_at_period_end: 0,
  created_at: "2026-07-24T13:47:02.184Z",
  updated_at: "2026-07-24T13:47:02.184Z",
};

describe("plan naming", () => {
  it("names `standard` as The Pack — the key the Stars rail actually writes", () => {
    expect(planDisplayName("standard")).toBe("The Pack");
  });

  it("returns null for an unknown plan rather than inventing a product name", () => {
    expect(planDisplayName("enterprise_ultra")).toBeNull();
    expect(planDisplayName(null)).toBeNull();
  });
});

describe("limits", () => {
  it("gives The Pack unlimited locks, multi-admin, audit logs and custom domain", () => {
    expect(limitsForPlan("standard")).toEqual({
      maxTelegramLocks: null, locksUnlimited: true, multiAdmin: true, auditLogs: true, customDomain: true,
    });
  });

  it("returns null for an unknown plan instead of falling back to a default allowance", () => {
    expect(limitsForPlan("mystery")).toBeNull();
  });
});

describe("rail attribution", () => {
  it("reads the rail from the id we mint", () => {
    expect(railFromSubscriptionId("stars:123").key).toBe("telegram_stars");
    expect(railFromSubscriptionId("courtesy:welcome").key).toBe("courtesy");
    expect(railFromSubscriptionId("referral:abc").key).toBe("referral");
    expect(railFromSubscriptionId("sub_1234").key).toBe("stripe");
  });

  it("labels an unrecognised id as unknown rather than guessing Stripe", () => {
    expect(railFromSubscriptionId("weird_thing")).toEqual({ key: "unknown", label: null });
  });
});

describe("identity resolution", () => {
  it("prefers the Telegram-linked address — the trap that breaks email lookups", async () => {
    // Francisco's Telegram is bound to an Apple private-relay alias that matches
    // no other record. Resolving by org and walking the link table is what makes
    // this work; resolving "by email" is what silently fails for Stars buyers.
    const db = stubDb([
      { match: "telegram_identity_links", row: { email: "5ccsgzpgsk@privaterelay.appleid.com", telegram_user_id: "8581086019" } },
      { match: "billing_customers", row: { email: "billing@example.com" } },
    ]);
    const contact = await resolveContact(db, "org_1");
    expect(contact.email).toBe("5ccsgzpgsk@privaterelay.appleid.com");
    expect(contact.source).toBe("telegram_identity_links");
    expect(contact.telegramUserId).toBe("8581086019");
  });

  it("falls back to the workspace owner when there is no Telegram or billing row", async () => {
    const db = stubDb([{ match: "workspaces w", row: { email: "owner@example.com" } }]);
    const contact = await resolveContact(db, "org_1");
    expect(contact.email).toBe("owner@example.com");
    expect(contact.source).toBe("workspaces.owner");
  });

  it("reports no_email_on_file instead of failing silently", async () => {
    // This is the live state of both real Stars buyers: entitlement exists,
    // frisky_org_id is NULL, no link row, so there is genuinely no address.
    const contact = await resolveContact(stubDb([]), "org_unlinked");
    expect(contact.email).toBeNull();
    expect(contact.reason).toBe("no_email_on_file");
  });
});

describe("getMembershipFacts", () => {
  it("never invents a renewal date when the rail recorded none", async () => {
    const db = stubDb([
      { match: "FROM billing_subscriptions", row: activeSub },
      { match: "telegram_stars_entitlements", row: { stars_amount: 1150, currency: "XTR" } },
      { match: "telegram_identity_links", row: { email: "a@b.com", telegram_user_id: "1" } },
    ]);
    const facts = await getMembershipFacts(db, "org_1");
    expect(facts.entitled).toBe(true);
    expect(facts.term.currentPeriodEnd).toBeNull();
    expect(facts.term.known).toBe(false);
    expect(facts.term.reason).toBe("no_period_end_recorded");
  });

  it("reports the real Stars amount", async () => {
    const db = stubDb([
      { match: "FROM billing_subscriptions", row: activeSub },
      { match: "telegram_stars_entitlements", row: { stars_amount: 1150, currency: "XTR" } },
      { match: "telegram_identity_links", row: { email: "a@b.com", telegram_user_id: "1" } },
    ]);
    const facts = await getMembershipFacts(db, "org_1");
    expect(facts.amount.charged).toBe(true);
    expect(facts.amount.display).toContain("1,150");
  });

  it("admits it cannot substantiate a Stripe amount", async () => {
    // billing_subscriptions has no amount/currency column. Printing $14.99 from
    // the pricing page would be a guess about what this member was charged.
    const db = stubDb([
      { match: "FROM billing_subscriptions", row: { ...activeSub, stripe_subscription_id: "sub_123" } },
      { match: "telegram_identity_links", row: { email: "a@b.com", telegram_user_id: "1" } },
    ]);
    const facts = await getMembershipFacts(db, "org_1");
    expect(facts.amount.display).toBeNull();
    expect(facts.amount.reason).toBe("amount_not_recorded_in_bridge");
  });

  it("states no charge for a courtesy grant rather than leaving it unknown", async () => {
    const db = stubDb([
      { match: "FROM billing_subscriptions", row: { ...activeSub, stripe_subscription_id: "courtesy:welcome" } },
      { match: "telegram_identity_links", row: { email: "a@b.com", telegram_user_id: "1" } },
    ]);
    const facts = await getMembershipFacts(db, "org_1");
    expect(facts.amount.charged).toBe(false);
    expect(facts.amount.display).toBe("No charge — granted");
  });

  it("flags past_due as needing attention instead of showing a clean active", async () => {
    const db = stubDb([
      { match: "FROM billing_subscriptions", row: { ...activeSub, status: "past_due" } },
      { match: "telegram_identity_links", row: { email: "a@b.com", telegram_user_id: "1" } },
    ]);
    const facts = await getMembershipFacts(db, "org_1");
    expect(facts.status.raw).toBe("past_due");
    expect(facts.status.needsAttention).toBe(true);
  });

  it("marks an unrecognised plan and withholds its limits", async () => {
    const db = stubDb([
      { match: "FROM billing_subscriptions", row: { ...activeSub, plan: "mystery_tier" } },
      { match: "telegram_identity_links", row: { email: "a@b.com", telegram_user_id: "1" } },
    ]);
    const facts = await getMembershipFacts(db, "org_1");
    expect(facts.plan.recognised).toBe(false);
    expect(facts.plan.display).toBeNull();
    expect(facts.limits).toBeNull();
  });

  it("reports no entitlement rather than a free-plan fiction", async () => {
    const facts = await getMembershipFacts(stubDb([]), "org_none");
    expect(facts.entitled).toBe(false);
    expect(facts.reason).toBe("no_active_subscription");
  });

  it("refuses to answer without an org id", async () => {
    const facts = await getMembershipFacts(stubDb([]), "");
    expect(facts.ok).toBe(false);
    expect(facts.reason).toBe("no_org_id");
  });
});
