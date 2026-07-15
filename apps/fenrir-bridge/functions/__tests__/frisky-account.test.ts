import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAccountByEmail,
  resolveFriskyAccountId,
  type SupabaseAdminEnv,
} from '../_lib/frisky-account';

// The keystone of the Fenrir Protocol: a verified email always collapses onto
// ONE Supabase auth.users UUID, regardless of which login channel produced it.
// The Supabase admin auth API is stubbed so these run hermetically.

const env: SupabaseAdminEnv = {
  SUPABASE_URL: 'https://yqevglppbhuoxxfsfnih.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
};

const UUID = '11111111-2222-3333-4444-555555555555';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveFriskyAccountId', () => {
  it('returns the existing auth.users UUID when the email is already an account', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.method ?? 'GET').toBe('GET');
      expect(url).toContain('/auth/v1/admin/users?email=');
      return jsonResponse({ users: [{ id: UUID, email: 'babaji@example.test' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const id = await resolveFriskyAccountId(env, 'Babaji@Example.test');
    expect(id).toBe(UUID);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no create when one already exists
  });

  it('creates the account (email_confirm) when the email is new, then returns its UUID', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url.includes('?email=') ? 'lookup' : 'create'}`);
      if (method === 'GET') return jsonResponse({ users: [] }); // not found
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ email: 'new@example.test', email_confirm: true });
      return jsonResponse({ id: UUID, email: 'new@example.test' }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    const id = await resolveFriskyAccountId(env, 'new@example.test');
    expect(id).toBe(UUID);
    expect(calls).toEqual(['GET lookup', 'POST create']);
  });

  it("re-reads after a create race (duplicate email) and returns the winner's UUID", async () => {
    let creates = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        creates += 1;
        return jsonResponse({ msg: 'email exists' }, 422); // lost the race
      }
      // first lookup empty, second lookup (post-race) finds the row
      return jsonResponse({
        users: creates === 0 ? [] : [{ id: UUID, email: 'race@example.test' }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const id = await resolveFriskyAccountId(env, 'race@example.test');
    expect(id).toBe(UUID);
  });

  it('returns null (and never throws) when the admin API is not configured', async () => {
    const id = await resolveFriskyAccountId({}, 'anyone@example.test');
    expect(id).toBeNull();
  });

  it('getAccountByEmail is read-only and returns null on a non-account', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ users: [] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getAccountByEmail(env, 'ghost@example.test')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT collapse a new email onto an arbitrary account when GoTrue ignores the ?email= filter', async () => {
    // Regression: some GoTrue versions ignore the `?email=` query filter and
    // return the full, paginated user list. The old `?? users[0]` fallback
    // would then resolve a brand-new email to whoever happened to be first,
    // cross-wiring two humans onto one master identity.
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        // Filter ignored: returns unrelated accounts, none matching the query email.
        return jsonResponse({
          users: [
            { id: 'aaaa1111-0000-0000-0000-000000000000', email: 'someone-else@example.test' },
            { id: 'bbbb2222-0000-0000-0000-000000000000', email: 'another@example.test' },
          ],
        });
      }
      // Because lookup returned no exact match, resolve must CREATE the account.
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ email: 'fresh@example.test', email_confirm: true });
      return jsonResponse({ id: UUID, email: 'fresh@example.test' }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    // getAccountByEmail must NOT return one of the unrelated accounts.
    expect(await getAccountByEmail(env, 'fresh@example.test')).toBeNull();

    // resolveFriskyAccountId must create a fresh account, never adopt users[0].
    const id = await resolveFriskyAccountId(env, 'fresh@example.test');
    expect(id).toBe(UUID);
    expect(id).not.toBe('aaaa1111-0000-0000-0000-000000000000');
  });

  it('matches the exact email even when the filtered list contains other rows', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        users: [
          { id: 'cccc3333-0000-0000-0000-000000000000', email: 'noise@example.test' },
          { id: UUID, email: 'Target@Example.test' },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const account = await getAccountByEmail(env, 'target@example.test');
    expect(account?.id).toBe(UUID);
    expect(account?.email).toBe('target@example.test'); // normalized lowercase
  });
});
