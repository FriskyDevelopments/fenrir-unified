import { beforeEach, describe, expect, it, vi } from "vitest";

import { onRequestGet as securityReport } from "../api/community-gate/admin/security-report";

// We exercise the REAL authorization path (requireCommunityGateUser +
// assertCommunityStaff) end-to-end. The only fakes are:
//   1. the Neon driver (in-memory tagged-template), and
//   2. a signed community session cookie minted with the real signer.
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

import {
  communitySessionSetCookie,
  createCommunitySessionPayload,
  signCommunitySession,
  type CommunitySessionPayload
} from "../_lib/community-auth";

const SECRET = "community-auth-secret";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NEON_DATABASE_URL: "postgres://test-db/neon",
    FENRIR_COMMUNITY_AUTH_SECRET: SECRET,
    FIREBASE_PROJECT_ID: "test-firebase-project",
    ...overrides
  };
}

async function signedSessionCookie(role: CommunitySessionPayload["role"], accessStatus: CommunitySessionPayload["access_status"]) {
  const payload = createCommunitySessionPayload({
    userId: "user-1",
    email: "staff@example.test",
    role,
    accessStatus
  });
  const token = await signCommunitySession(payload, baseEnv());
  return communitySessionSetCookie(token);
}

function makeRequest(slug: string, cookie?: string) {
  const url = `https://www.myfenrir.com/api/community-gate/admin/security-report?communitySlug=${slug}`;
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  return new Request(url, { method: "GET", headers });
}

beforeEach(() => {
  dbState.handler = (query) => {
    if (query.includes("from communities")) return [{ id: "community-1", name: "Fenrir" }];
    if (query.includes("insert into profiles")) {
      return [{ id: "profile-1", auth_subject: "user-1", email: "staff@example.test", display_name: "Staff", role: "member", status: "active" }];
    }
    if (query.includes("from community_memberships")) {
      // Staff-lookup query (assertCommunityStaff): return a row => caller is staff.
      return [{ role: "community_staff", status: "active", community_id: "community-1", community_slug: "fenrir" }];
    }
    if (query.includes("from verification_sessions")) return [{ total_sessions: 0 }];
    return [];
  };
});

describe("community-gate security-report authorization", () => {
  it("rejects an unauthenticated caller", async () => {
    const response = await securityReport({ request: makeRequest("fenrir"), env: baseEnv() } as any);
    const body = (await response.json()) as any;
    expect(body.authenticated).toBe(false);
    expect(body.ok).toBe(true);
  });

  it("rejects an authenticated non-staff member (IDOR fix regression)", async () => {
    const cookie = await signedSessionCookie("member", "active");
    // No community_memberships row for this user => not staff => rejected.
    dbState.handler = (query) => {
      if (query.includes("from communities")) return [{ id: "community-1", name: "Fenrir" }];
      if (query.includes("insert into profiles")) {
        return [{ id: "profile-1", auth_subject: "user-1", email: "staff@example.test", display_name: "Staff", role: "member", status: "active" }];
      }
      if (query.includes("from community_memberships")) return []; // not staff
      if (query.includes("from verification_sessions")) return [{ total_sessions: 0 }];
      return [];
    };
    const response = await securityReport({ request: makeRequest("fenrir", cookie), env: baseEnv() } as any);
    expect(response.status).toBe(401);
  });

  it("allows a community staff member and returns the report", async () => {
    const cookie = await signedSessionCookie("community_staff", "active");
    const response = await securityReport({ request: makeRequest("fenrir", cookie), env: baseEnv() } as any);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.community.slug).toBe("fenrir");
  });
});
