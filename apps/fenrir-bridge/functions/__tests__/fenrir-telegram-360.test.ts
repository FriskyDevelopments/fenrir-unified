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
const apiSource = readFileSync(
  fileURLToPath(new URL("../../src/services/api.ts", import.meta.url)),
  "utf8",
);
const dashboard = readFileSync(
  fileURLToPath(new URL("../../src/routes/DashboardRoute.tsx", import.meta.url)),
  "utf8",
);

describe("MyFenrir 360 identity loop (sign-in → /main → Link Telegram ID)", () => {
  it("walkthrough step 1 opens /main, not Community Bridge dashboard", () => {
    expect(walkthrough).toContain("https://www.myfenrir.com/main");
    expect(walkthrough).toContain("Link Telegram ID");
    expect(walkthrough).not.toContain("https://communities.myfenrir.com/dashboard");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?start=account");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?startgroup=discover");
  });

  it("does not use Community Bridge 6-char paste as production linking", () => {
    expect(activate).toContain("https://www.myfenrir.com/main");
    expect(activate).toContain("if (!demo)");
    expect(activate).toContain("Link Telegram ID");
    expect(activate).toContain("there is no code to copy");
  });

  it("keeps the D1 Link Telegram ID generator on Fenrir /main", () => {
    expect(dashboard).toContain("async function linkTelegramIdentity()");
    expect(dashboard).toContain("telegramIdentityService.start()");
    expect(dashboard).toContain("window.open(result.url");
    expect(apiSource).toContain('pathname === "/api/telegram/link/start"');
  });

  it("Bot OS /link and Mini App open www.myfenrir.com/main", () => {
    expect(botOs).toContain('const MYFENRIR_APP_URL = "https://www.myfenrir.com/main"');
    expect(botOs).toContain('web_app: { url: MYFENRIR_APP_URL }');
    expect(botOs).toContain('tap \\"Link Telegram ID\\"');
    expect(botOs).toContain("there is no code to copy");
    expect(botOs).not.toContain("https://communities.myfenrir.com/dashboard");
    expect(botOs).not.toContain("https://www.myfenrir.com/gate/miniapp");
    expect(pagesWebhook).toContain('const MYFENRIR_APP_URL = "https://www.myfenrir.com/main"');
    expect(pagesWebhook).toContain("web_app: { url: MYFENRIR_APP_URL }");
    expect(pagesWebhook).toContain('tap \\"Link Telegram ID\\"');
    expect(pagesWebhook).not.toContain("https://communities.myfenrir.com/dashboard");
    expect(pagesWebhook).not.toContain("Continue Community Gate");
  });
});
