import { describe, expect, it } from "vitest";

import {
  cookieHeader,
  createSessionPayload,
  readSession,
  sessionCookieName,
  sessionSetCookie,
  signSession,
  type AuthEnv
} from "../_lib/auth";

// readSession is called by ~20 API endpoints (including /api/auth/me, which the
// SPA polls on every page load). A malformed but signature-valid cookie must
// resolve to "not authenticated" (null), NEVER throw — a thrown JSON.parse would
// 500 every one of those endpoints and lock a user out of the whole app.

const env: AuthEnv = { SESSION_SECRET: "test-session-secret" };

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(sig));
}

function requestWithSession(token: string) {
  return new Request("https://app.example.test/api/auth/me", {
    headers: { Cookie: cookieHeader(sessionCookieName(), token, 3600).split(";", 1)[0] }
  });
}

describe("readSession resilience", () => {
  it("returns a valid session for a well-formed signed cookie", async () => {
    const payload = createSessionPayload({
      email: "user@example.test",
      name: "User",
      provider: "workos",
      identityId: "workos:abc"
    });
    const token = await signSession(payload, env);
    const session = await readSession(requestWithSession(token), env);
    expect(session?.email).toBe("user@example.test");
  });

  it("returns null (does not throw) for a signature-valid token whose body is not JSON", async () => {
    // Sign garbage bytes with the REAL secret: the signature check passes, but
    // JSON.parse on the decoded body would throw without the try/catch guard.
    const encoded = base64Url(new TextEncoder().encode("this-is-not-json{{{"));
    const signature = await hmac(env.SESSION_SECRET!, encoded);
    const token = `${encoded}.${signature}`;
    await expect(readSession(requestWithSession(token), env)).resolves.toBeNull();
  });

  it("returns null for a signature-valid token whose JSON body is not an object", async () => {
    const encoded = base64Url(new TextEncoder().encode("\"just-a-string\""));
    const signature = await hmac(env.SESSION_SECRET!, encoded);
    const token = `${encoded}.${signature}`;
    await expect(readSession(requestWithSession(token), env)).resolves.toBeNull();
  });

  it("returns null for a tampered signature", async () => {
    const payload = createSessionPayload({
      email: "user@example.test",
      name: "User",
      provider: "workos",
      identityId: "workos:abc"
    });
    const token = await signSession(payload, env);
    const [encoded] = token.split(".");
    const forged = `${encoded}.AAAAforgedsignatureAAAA`;
    await expect(readSession(requestWithSession(forged), env)).resolves.toBeNull();
  });

  it("returns null when there is no cookie at all", async () => {
    const request = new Request("https://app.example.test/api/auth/me");
    await expect(readSession(request, env)).resolves.toBeNull();
  });

  it("returns null for an expired session", async () => {
    const payload = createSessionPayload({
      email: "user@example.test",
      name: "User",
      provider: "workos",
      identityId: "workos:abc"
    });
    payload.exp = Math.floor(Date.now() / 1000) - 10; // already expired
    const token = await signSession(payload, env);
    await expect(readSession(requestWithSession(token), env)).resolves.toBeNull();
  });
});

describe("session payload shape", () => {
  it("includes frisky_account_id only when provided, and always carries the legacy ids", () => {
    const withAccount = createSessionPayload({
      email: "a@example.test",
      name: "A",
      provider: "workos",
      identityId: "workos:1",
      friskyAccountId: "11111111-2222-3333-4444-555555555555"
    });
    expect(withAccount.frisky_account_id).toBe("11111111-2222-3333-4444-555555555555");
    expect(withAccount.frisky_user_id).toMatch(/^frisky_usr_/);
    expect(withAccount.frisky_org_id).toMatch(/^frisky_org_/);

    const withoutAccount = createSessionPayload({
      email: "b@example.test",
      name: "B",
      provider: "google",
      identityId: "google:2"
    });
    expect("frisky_account_id" in withoutAccount).toBe(false);
  });
});

describe("session cookie flags", () => {
  it("sets HttpOnly, Secure, and SameSite=Lax", () => {
    const header = sessionSetCookie("token-value");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
  });
});
