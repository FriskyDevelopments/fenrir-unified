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
const fenrirLogin = readFileSync(
  fileURLToPath(new URL("../_lib/fenrir-login.ts", import.meta.url)),
  "utf8",
);
const appSource = readFileSync(
  fileURLToPath(new URL("../../src/App.tsx", import.meta.url)),
  "utf8",
);

describe("Community Bridge Telegram chain (after FriskyDev link)", () => {
  it("keeps walkthrough step 1 on FriskyDev link-start", () => {
    expect(walkthrough).toContain("https://www.myfenrir.com/api/telegram/link/start");
    expect(walkthrough).toContain("Link FriskyDev ID");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?start=account");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?startgroup=discover");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?start=mapping");
    expect(walkthrough).toContain("https://t.me/Myfenrir_bot?start=readiness");
  });

  it("does not send the walkthrough to www.myfenrir.com/main", () => {
    expect(walkthrough).not.toMatch(/https:\/\/www\.myfenrir\.com\/main/);
    expect(walkthrough).toContain("Never send this walkthrough to /main");
  });

  it("does not use Community Bridge 6-char paste as production linking", () => {
    expect(activate).toContain("https://www.myfenrir.com/api/telegram/link/start");
    expect(activate).toContain("if (!demo)");
    expect(activate).toContain("Continue securely");
  });

  it("preserves login ?next= for FriskyDev link-start", () => {
    expect(fenrirLogin).toContain('export const TELEGRAM_LINK_START_PATH = "/api/telegram/link/start"');
    expect(fenrirLogin).toContain("preservedLoginNext");
    expect(apiSource).toContain("preservedLoginNext");
    expect(apiSource).toContain("safeLoginNextPath");
    expect(appSource).toContain('"/api/telegram/link/start"');
  });

  it("Bot OS continues on communities.myfenrir.com after FriskyDev is linked", () => {
    expect(botOs).toContain('const FRISKY_TELEGRAM_LINK_START = "https://www.myfenrir.com/api/telegram/link/start"');
    expect(botOs).toContain(
      'const COMMUNITY_BRIDGE_CONTINUE_URL = "https://communities.myfenrir.com/gate?onboarding=1"',
    );
    expect(botOs).toContain("Continue Community Gate");
    expect(pagesWebhook).toContain("FRISKY_TELEGRAM_LINK_START");
    expect(pagesWebhook).toContain("COMMUNITY_BRIDGE_CONTINUE_URL");
    expect(pagesWebhook).not.toContain('const appUrl = "https://www.myfenrir.com/main"');
  });
});
