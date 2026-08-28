import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { authErrorCopy, loginPageErrorMessage, parseAuthError } from "../../src/services/authErrors";
import { PRODUCTION_AUTH_ORIGIN, resolveAuthOrigin } from "../../src/services/authOrigin";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Fenrir go-live auth contract (Folios#29 bits on myfenrir.com)", () => {
  it("canonicalizes www.myfenrir.com to the apex in Pages _redirects", () => {
    const redirects = readFileSync(path.join(root, "public/_redirects"), "utf8");
    expect(redirects).toMatch(/https:\/\/www\.myfenrir\.com\/\*\s+https:\/\/myfenrir\.com\/:splat\s+301/);
    expect(redirects).not.toMatch(/https:\/\/myfenrir\.com\/\*\s+https:\/\/www\.myfenrir\.com/);
  });

  it("flips fenrir-redirects from apex→www to www→apex", () => {
    const worker = readFileSync(path.join(root, "workers/fenrir-redirects/worker.js"), "utf8");
    expect(worker).toContain('url.hostname === "www.myfenrir.com"');
    expect(worker).toContain('url.hostname = "myfenrir.com"');
    expect(worker).not.toMatch(/url\.hostname === "myfenrir\.com"[\s\S]*www\.myfenrir\.com/);
  });

  it("keeps Fenrir session cookies host-only and routes off folios.works", () => {
    const wrangler = readFileSync(path.join(root, "wrangler.fenrir-auth.jsonc"), "utf8");
    expect(wrangler).not.toContain('"COOKIE_DOMAIN"');
    expect(wrangler).toContain('"pattern": "myfenrir.com/auth/*"');
    expect(wrangler).toContain('"pattern": "www.myfenrir.com/auth/*"');
    expect(wrangler).not.toMatch(/"pattern":\s*"[^"]*folios\.works/);
  });

  it("sends www SPA auth calls to the apex Worker", () => {
    expect(PRODUCTION_AUTH_ORIGIN).toBe("https://myfenrir.com");
    expect(resolveAuthOrigin("", "www.myfenrir.com")).toBe("https://myfenrir.com");
    expect(resolveAuthOrigin("", "myfenrir.com")).toBe("");
    expect(resolveAuthOrigin("https://auth.example", "www.myfenrir.com")).toBe("https://auth.example");
  });

  it("maps Worker HTML error codes onto /login copy", () => {
    expect(parseAuthError(null)).toBeNull();
    expect(parseAuthError("token_exchange_failed")).toBe("token_exchange_failed");
    expect(parseAuthError("totally-new-code")).toBe("unknown");
    expect(loginPageErrorMessage("?error=provider_error")).toMatch(/denied or cancelled/i);
    expect(loginPageErrorMessage("?auth_error=direct_oauth_disabled")).toMatch(/retired/i);
    expect(authErrorCopy("unknown")).not.toMatch(/password|contraseña/i);
  });
});
