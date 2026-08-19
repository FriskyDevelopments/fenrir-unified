import { describe, expect, it } from "vitest";
import { botMenuKeyboard, modularMenuText } from "../../workers/fenrir-stars-payments.js";

describe("member-facing bot menu", () => {
  it("explains the Gate journey with one consistent plan model", () => {
    const menu = modularMenuText("/menu", { status: "inactive" });

    expect(menu).toContain("Create a Gate");
    expect(menu).toContain("Link and verify your group");
    expect(menu).toContain("The Pack is US$15/month");
    expect(menu).not.toContain("Founder Deal");
    expect(menu).not.toContain("MOD 01");
  });

  it("does not offer a paid activation to an already-active member", () => {
    expect(botMenuKeyboard({ status: "inactive" }).flat()).toContainEqual({
      text: "Activate The Pack · Stars",
      callback_data: "fenrir_subscribe"
    });
    expect(botMenuKeyboard({ status: "active" }).flat()).not.toContainEqual({
      text: "Activate The Pack · Stars",
      callback_data: "fenrir_subscribe"
    });
  });
});
