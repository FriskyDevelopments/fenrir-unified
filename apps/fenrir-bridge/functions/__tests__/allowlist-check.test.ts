import { beforeEach, describe, expect, it, vi } from "vitest";

import { onRequestPost as allowlistCheck } from "../api/internal/community/allowlist-check";

// Same in-memory Neon fake used by the community OAuth tests: the tagged
// template resolves through a swappable handler so the real handler code runs
// with no database and no network.
const dbState = vi.hoisted(() => ({
  handler: (_query: string, _values: unknown[]) => [] as Array<Record<string, unknown>>
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" $ ");
      return Promise.resolve(dbState.handler(query, values));
    };
    return sql;
  }
}));

const SECRET = "internal-secret-value";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NEON_DATABASE_URL: "postgres://test-db/neon",
    FENRIR_GATEKEEPER_INTERNAL_SECRET: SECRET,
    ...overrides
  };
}

function makeContext(options: {
  env?: Record<string, string | undefined>;
  authorization?: string | null;
  body?: string;
}) {
  const headers = new Headers();
  if (options.authorization !== null) {
    headers.set("authorization", options.authorization ?? `Bearer ${SECRET}`);
  }
  const request = new Request("https://www.myfenrir.com/api/internal/community/allowlist-check", {
    method: "POST",
    headers,
    body: options.body ?? "{}"
  });
  return { request, env: options.env ?? baseEnv() } as unknown as Parameters<typeof allowlistCheck>[0];
}

const validBody = JSON.stringify({ community_slug: "neon-nexus", email: "wolf@example.test" });

beforeEach(() => {
  dbState.handler = () => [{ allowed: true }];
});

describe("allowlist-check internal endpoint", () => {
  it("returns 401 when the internal secret is not configured", async () => {
    const response = await allowlistCheck(
      makeContext({ env: baseEnv({ FENRIR_GATEKEEPER_INTERNAL_SECRET: undefined }), body: validBody })
    );
    expect(response.status).toBe(401);
  });

  it("returns 401 when the authorization header is missing", async () => {
    const response = await allowlistCheck(makeContext({ authorization: null, body: validBody }));
    expect(response.status).toBe(401);
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const response = await allowlistCheck(
      makeContext({ authorization: "Bearer not-the-secret", body: validBody })
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    const response = await allowlistCheck(makeContext({ body: "{not json" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "invalid_json" });
  });

  it("returns 400 when slug or email is missing", async () => {
    const missingEmail = await allowlistCheck(
      makeContext({ body: JSON.stringify({ community_slug: "neon-nexus" }) })
    );
    expect(missingEmail.status).toBe(400);
    const missingSlug = await allowlistCheck(
      makeContext({ body: JSON.stringify({ email: "wolf@example.test" }) })
    );
    expect(missingSlug.status).toBe(400);
  });

  it("returns 503 when the Neon URL is not configured", async () => {
    const response = await allowlistCheck(
      makeContext({ env: baseEnv({ NEON_DATABASE_URL: "  " }), body: validBody })
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "neon_not_configured" });
  });

  it("returns allowed: true with the echoed slug for an active membership", async () => {
    dbState.handler = () => [{ allowed: true }];
    const response = await allowlistCheck(makeContext({ body: validBody }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, allowed: true, community_slug: "neon-nexus" });
  });

  it("returns allowed: false when no active membership exists", async () => {
    dbState.handler = () => [{ allowed: false }];
    const response = await allowlistCheck(makeContext({ body: validBody }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, allowed: false, community_slug: "neon-nexus" });
  });

  it("normalizes slug and email case/whitespace before querying", async () => {
    let captured: unknown[] = [];
    dbState.handler = (_query, values) => {
      captured = values;
      return [{ allowed: true }];
    };
    const response = await allowlistCheck(
      makeContext({
        body: JSON.stringify({ community_slug: "  Neon-Nexus  ", email: "  Wolf@Example.TEST " })
      })
    );
    expect(response.status).toBe(200);
    expect(captured).toContain("neon-nexus");
    expect(captured).toContain("wolf@example.test");
    expect(await response.json()).toMatchObject({ community_slug: "neon-nexus" });
  });
});
