import assert from "node:assert/strict";
import test from "node:test";

import {
  HOST_STANDARDS_VERSION,
  POLICY_TEMPLATES,
  getPolicyTemplate,
  needsHostStandardsAcceptance,
  ownerLanding,
} from "../src/lib/gate-onboarding.ts";

test("existing owners land on My Gates while first-time owners start setup", () => {
  assert.equal(ownerLanding(3), "/gates");
  assert.equal(ownerLanding(1), "/gates");
  assert.equal(ownerLanding(0), "/gate");
});

test("host standards are accepted once per account policy version", () => {
  assert.equal(needsHostStandardsAcceptance(null), true);
  assert.equal(needsHostStandardsAcceptance(HOST_STANDARDS_VERSION - 1), true);
  assert.equal(needsHostStandardsAcceptance(HOST_STANDARDS_VERSION), false);
});

test("the four required policy templates are selectable and complete", () => {
  assert.deepEqual(POLICY_TEMPLATES.map(({ label }) => label), [
    "Community Standards",
    "Creator-led",
    "Events",
    "Custom",
  ]);
  for (const template of POLICY_TEMPLATES) {
    assert.equal(getPolicyTemplate(template.id).id, template.id);
    assert.ok(template.rules.length > 40);
    assert.ok(template.disclaimer.length > 40);
  }
});
