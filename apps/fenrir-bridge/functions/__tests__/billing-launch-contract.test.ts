import { describe, expect, it } from "vitest";
import { isCardBillingEnabled } from "../_lib/billing-env";

describe("billing launch contract", () => {
  it("keeps card checkout off unless an operator explicitly enables it", () => {
    expect(isCardBillingEnabled({})).toBe(false);
    expect(isCardBillingEnabled({ CARD_BILLING_ENABLED: "false" })).toBe(false);
    expect(isCardBillingEnabled({ CARD_BILLING_ENABLED: "1" })).toBe(false);
    expect(isCardBillingEnabled({ CARD_BILLING_ENABLED: "TRUE" })).toBe(true);
  });
});
