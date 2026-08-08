import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  allowed: true,
  calls: [] as Array<{ query: string; values: unknown[] }>
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    dbState.calls.push({ query: strings.join(" $ "), values });
    return Promise.resolve([{ allowed: dbState.allowed }]);
  }
}));

import { onRequestPost } from "../api/internal/community/allowlist-check";

const SECRET = "test-gatekeeper-secret";

function context(body: unknown, overrides: Record<string, unknown> = {}) {
  return {
    request: new Request("https://www.example.test/api/internal/community/allowlist-check", {
      method: "POST",
      headers: { Authorization: "Bearer " + SECRET, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    env: {
      FENRIR_GATEKEEPER_INTERNAL_SECRET: SECRET,
      NEON_DATABASE_URL: "postgres://test-db/neon",
      ...overrides
    }
  };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  dbState.allowed = true;
  dbState.calls = [];
});

describe("internal community allowlist contract", () => {
  it("rejects incorrect credentials before touching Neon", async () => {
    const requestContext = context({ community_slug: "neon-nexus", email: "alice@example.test" });
    requestContext.request = new Request(requestContext.request, { headers: { Authorization: "Bearer wrong" } });

    const response = await onRequestPost(requestContext as never);

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ ok: false, error: "unauthorized" });
    expect(dbState.calls).toHaveLength(0);
  });

  it("rejects malformed and incomplete requests", async () => {
    const malformed = new Request("https://www.example.test/api/internal/community/allowlist-check", {
      method: "POST",
      headers: { Authorization: "Bearer " + SECRET },
      body: "not-json"
    });
    const malformedResponse = await onRequestPost({ request: malformed, env: context({}).env } as never);
    expect(malformedResponse.status).toBe(400);
    expect(await json(malformedResponse)).toEqual({ ok: false, error: "invalid_json" });

    const incompleteResponse = await onRequestPost(context({ community_slug: "neon-nexus" }) as never);
    expect(incompleteResponse.status).toBe(400);
    expect(await json(incompleteResponse)).toEqual({ ok: false, error: "invalid_request" });
    expect(dbState.calls).toHaveLength(0);
  });

  it("normalizes the lookup and returns the Neon decision", async () => {
    dbState.allowed = false;
    const response = await onRequestPost(context({ community_slug: " Neon-Nexus ", email: " Alice@Example.Test " }) as never);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ ok: true, allowed: false, community_slug: "neon-nexus" });
    expect(dbState.calls).toHaveLength(1);
    expect(dbState.calls[0]?.values).toEqual(["neon-nexus", "alice@example.test"]);
  });

  it("fails closed when Neon is not configured", async () => {
    const response = await onRequestPost(context({ community_slug: "neon-nexus", email: "alice@example.test" }, { NEON_DATABASE_URL: " " }) as never);

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ ok: false, error: "neon_not_configured" });
    expect(dbState.calls).toHaveLength(0);
  });
});
