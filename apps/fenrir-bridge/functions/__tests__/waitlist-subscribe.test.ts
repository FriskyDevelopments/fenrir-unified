import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("waitlist Pages functions do not loop with trailing-slash 308", () => {
  it("does not ship a waitlist.ts function that 302s to /waitlist/index.html", () => {
    expect(readFileSync(path.join(root, "functions/subscribe.ts"), "utf8")).toContain('Location: "/waitlist/"');
    expect(readFileSync(path.join(root, "functions/subscribe.ts"), "utf8")).not.toContain("/waitlist/index.html");
    try {
      const waitlist = readFileSync(path.join(root, "functions/waitlist.ts"), "utf8");
      expect(waitlist).not.toContain("/waitlist/index.html");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });
});
