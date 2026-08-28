import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const walkthrough = readFileSync(
  fileURLToPath(new URL("../../../community-bridge/src/components/gate/community-bot-walkthrough.tsx", import.meta.url)),
  "utf8",
);
const botOs = readFileSync(
  fileURLToPath(new URL("../../workers/fenrir-stars-payments.js", import.meta.url)),
  "utf8",
);
const pagesWebhook = readFileSync(
  fileURLToPath(new URL("../api/telegram/webhook.ts", import.meta.url)),
  "utf8",
);
const activate = readFileSync(
  fileURLToPath(new URL("../../../community-bridge/src/routes/activate.tsx", import.meta.url)),
  "utf8",
);

describe("Community Bridge Telegram chain (after identity is linked)", () => {
  it("keeps group/mapping/readiness on @Myfenrir_bot, not the 6-char paste", () => {
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?start=account");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?startgroup=discover");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?start=mapping");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?start=readiness");
    expect(activate).toContain("if (!demo)");
  });

  it("does not send identity linking to communities.myfenrir.com/dashboard", () => {
    expect(botOs).not.toContain("https://communities.myfenrir.com/dashboard");
    expect(pagesWebhook).not.toContain("https://communities.myfenrir.com/dashboard");
    expect(walkthrough).not.toContain("https://communities.myfenrir.com/dashboard");
  });
});
