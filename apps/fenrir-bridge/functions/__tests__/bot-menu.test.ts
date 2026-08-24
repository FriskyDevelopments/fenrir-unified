import { describe, expect, it } from "vitest";
import { botMenuKeyboard, modularMenuText } from "../../workers/fenrir-stars-payments.js";

describe("member-facing bot menu", () => {
  it("explains the Gate journey with one consistent plan model", () => {
    const menu = modularMenuText("/menu", { status: "inactive" });

    expect(menu).toContain("Create a Gate");
    expect(menu).toContain("Link and verify your group");
    expect(menu).toContain("The Pack: US$14.99/month");
    expect(menu).not.toContain("Founder Deal");
    expect(menu).not.toContain("MOD 01");
  });

  it("does not offer a paid activation to an already-active member", () => {
    expect(botMenuKeyboard({ status: "inactive" }).flat()).toContainEqual({
      text: "⭐ Activate The Pack · Stars",
      callback_data: "fenrir_subscribe",
      style: "primary"
    });
    expect(botMenuKeyboard({ status: "active" }).flat()).not.toContainEqual({
      text: "⭐ Activate The Pack · Stars",
      callback_data: "fenrir_subscribe",
      style: "primary"
    });
  });

  it("uses semantic color treatments for the Bot OS action boxes", () => {
    expect(botMenuKeyboard({ status: "active" }).flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: "fenrir_setup", style: "primary" }),
        expect.objectContaining({ callback_data: "fenrir_status", style: "success" })
      ])
    );
  });
});
