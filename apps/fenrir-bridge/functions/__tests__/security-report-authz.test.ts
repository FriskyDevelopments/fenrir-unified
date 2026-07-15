import { afterEach, describe, expect, it, vi } from 'vitest';

import { onRequestGet as securityReport } from '../api/community-gate/admin/security-report';

// Regression: the community-gate security report (per-community moderation
// analytics) previously only checked that *some* Fenrir session existed — any
// logged-in user could read ANY community's report by passing its slug (IDOR).
// It must now require the caller to be staff of the requested community, and it
// must never reach the data store before that check passes.

const env = {
  FENRIR_COMMUNITY_AUTH_SECRET: 'community-auth-secret',
  NEON_DATABASE_URL: 'postgres://user:pass@neon.example.test/db',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function get(slug: string, cookie?: string) {
  return new Request(
    `https://app.example.test/api/community-gate/admin/security-report?communitySlug=${slug}`,
    { headers: cookie ? { Cookie: cookie } : {} }
  );
}

describe('security-report authorization', () => {
  it('rejects an unauthenticated caller and never queries the data store', async () => {
    // Any network/DB call would be a leak: the authz gate must short-circuit first.
    const fetchMock = vi.fn(async () => {
      throw new Error('data store must not be reached before authorization');
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await securityReport({ request: get('fenrir'), env });
    const body = (await response.json()) as {
      ok: boolean;
      authenticated?: boolean;
      error?: string;
    };

    // No session cookie => requireCommunityGateUser throws missing_community_session,
    // which authErrorResponse renders as an unauthenticated (not staff-authorized) result.
    expect(body.ok === false || body.authenticated === false).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing/invalid community slug', async () => {
    const response = await securityReport({ request: get(''), env });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('communitySlug_required');
  });

  it('reports not-configured when the gate env is absent', async () => {
    const response = await securityReport({ request: get('fenrir'), env: {} });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('community_gate_not_configured');
  });
});
