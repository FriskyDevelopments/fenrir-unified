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

  it("never states the plan and the upgrade demand in the same card", () => {
    // Regression: step 3 was fixed copy, so an operator with The Pack active
    // read "Plan: The Pack · active" and "Linking a community requires The Pack"
    // in one message — and reasonably concluded the payment never applied.
    const active = modularMenuText("/menu", { status: "active" });

    expect(active).toContain("The Pack · active");
    expect(active).not.toContain("Linking a community requires The Pack");
    expect(active).toContain("Your plan already covers this");

    // "quiero" is one of the spanishIntent triggers; "menu" keeps it on the menu.
    const spanish = modularMenuText("quiero el menu", { status: "active" });
    expect(spanish).toContain("The Pack · activo");
    expect(spanish).not.toContain("Enlazar una comunidad requiere The Pack");

    // The unpaid card must still ask for the money.
    const free = modularMenuText("/menu", { status: "inactive" });
    expect(free).toContain("Linking a community requires The Pack");
    expect(free).not.toContain("The Pack · active");
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
