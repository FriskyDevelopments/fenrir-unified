import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const DB = source("../_lib/trials-db.ts");
const VERIFY = source("../api/trial/verify.ts");
const REDEEM = source("../api/trial/redeem.ts");
const WEBHOOK = source("../api/stripe/webhook.ts");
const CONVERT = source("../api/trial/convert.ts");

describe("trial concurrency contract", () => {
  it("allows only pending_card to win the activation transition", () => {
    const activation = DB.slice(DB.indexOf("export async function activateTrial"));
    expect(activation).toContain("WHERE id = ? AND status = 'pending_card'");
  });

  it("does not overwrite an already active trial during concurrent redemption", () => {
    expect(DB).toContain("WHERE trials.status NOT IN ('active', 'converted')");
    expect(REDEEM).toContain("await releaseInviteUse(db, code)");
    expect(REDEEM).toContain('error: "trial_already_active"');
  });

  it("returns the losing invite claim in both activation paths", () => {
    expect(VERIFY).toContain("if (!activated)");
    expect(VERIFY).toContain("await releaseInviteUse(db, trial.code)");
    expect(WEBHOOK).toContain("if (!activated) await releaseInviteUse(db, trial.code)");
  });

  it("deduplicates trial conversion in D1, Stripe history, and Stripe idempotency", () => {
    expect(CONVERT).toContain("getPrimarySubscriptionForOrg");
    expect(CONVERT).toContain('candidate.metadata?.trial_id === trial.id');
    expect(CONVERT).toContain("idempotencyKey: `myfenrir_trial_conversion:${trial.id}`");
    expect(CONVERT).toContain("await upsertSubscription(db");
  });
});
