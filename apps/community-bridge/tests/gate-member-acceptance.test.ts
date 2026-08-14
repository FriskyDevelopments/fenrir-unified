import assert from "node:assert/strict";
import test from "node:test";

import { changedGateRuleKeys } from "../src/lib/gate-member-acceptance.ts";

test("a first-time member reviews every Gate rule screen", () => {
  assert.deepEqual(changedGateRuleKeys({ currentVersion: 1, currentRulesText: "rules", currentDisclaimerText: "notice", previous: null }), [
    "arrival", "safety", "respect", "privacy", "participation", "ready",
  ]);
});

test("a returning member skips an already accepted rules version", () => {
  assert.deepEqual(changedGateRuleKeys({
    currentVersion: 2,
    currentRulesText: "same rules",
    currentDisclaimerText: "same notice",
    previous: { rulesVersion: 2, rulesText: "same rules", disclaimerText: "same notice" },
  }), []);
});

test("a returning member sees only fields changed in a new rules version", () => {
  assert.deepEqual(changedGateRuleKeys({
    currentVersion: 3,
    currentRulesText: "new rules",
    currentDisclaimerText: "same notice",
    previous: { rulesVersion: 2, rulesText: "old rules", disclaimerText: "same notice" },
  }), ["ready"]);
  assert.deepEqual(changedGateRuleKeys({
    currentVersion: 4,
    currentRulesText: "new rules",
    currentDisclaimerText: "new notice",
    previous: { rulesVersion: 3, rulesText: "new rules", disclaimerText: "old notice" },
  }), ["arrival"]);
});
