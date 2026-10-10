import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { saveOAuthState } from '../src/session.js';

const FLOW = 'f'.repeat(43);
const STATE = 's'.repeat(32);
const COMPLETE = `https://myfenrir.com/auth/coach/complete?flow=${FLOW}`;
function environment() {
  const records = new Map();
  return {
    BASE_URL: 'https://myfenrir.com', POST_LOGIN_REDIRECT: 'https://myfenrir.com/main',
    ALLOWED_REDIRECT_HOSTS: 'myfenrir.com,www.myfenrir.com,forge.friskydev.com',
    SESSION_SECRET: 'test-session-secret', GOOGLE_CLIENT_ID: 'test-google-client', GOOGLE_CLIENT_SECRET: 'test-google-secret',
    SESSIONS: { put: async (key, value) => { records.set(key, value); }, get: async (key) => records.get(key) ?? null, delete: async (key) => { records.delete(key); } },
  };
}
function callback(provider, parameters, post = false, accept = 'text/html') {
  const url = `https://myfenrir.com/auth/${provider}/callback`;
  const params = new URLSearchParams({ error: 'access_denied', state: STATE, error_description: 'Private raw provider error', ...parameters });
  return new Request(post ? url : `${url}?${params}`, { method: post ? 'POST' : 'GET', headers: { accept, ...(post ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, ...(post ? { body: params.toString() } : {}) });
}

test('actual Google start state returns cancellation only to its stored Coach broker completion', async () => {
  const env = environment();
  const start = await worker.fetch(new Request(`https://myfenrir.com/auth/google?redirect=${encodeURIComponent(COMPLETE)}`), env);
  assert.equal(start.status, 302);
  const providerUrl = new URL(start.headers.get('location'));
  const state = providerUrl.searchParams.get('state');
  assert.match(state, /^[A-Za-z0-9_-]{32}$/);
  const response = await worker.fetch(callback('google', { state, redirect: 'https://attacker.test/callback' }), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${COMPLETE}&error=access_denied`);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await worker.fetch(callback('google', { state }), env)).headers.get('location'), 'https://myfenrir.com/login?error=provider_error');
});

test('Apple form-post and Microsoft query cancellations use consumed matching provider state', async () => {
  for (const [provider, post] of [['apple', true], ['microsoft', false]]) {
    const env = environment();
    await saveOAuthState(env, STATE, { provider, returnTo: COMPLETE });
    const response = await worker.fetch(callback(provider, {}, post), env);
    assert.equal(response.headers.get('location'), `${COMPLETE}&error=access_denied`);
    assert.equal((await worker.fetch(callback(provider, {}, post), env)).headers.get('location'), 'https://myfenrir.com/login?error=provider_error');
  }
});

test('provider errors are normalized before leaving the authority for Coach', async () => {
  const env = environment();
  await saveOAuthState(env, STATE, { provider: 'google', returnTo: COMPLETE });
  const response = await worker.fetch(callback('google', { error: 'sensitive-provider-detail' }), env);
  assert.equal(response.headers.get('location'), `${COMPLETE}&error=provider_error`);
  assert.doesNotMatch(response.headers.get('location') + await response.text(), /sensitive|Private/);
});

test('invalid, expired, absent and wrong-provider state retain the existing MyFenrir default', async () => {
  for (const parameters of [{}, { state: '' }, { state: 'invalid' }, { state: 'x'.repeat(32) }]) {
    const env = environment();
    await saveOAuthState(env, STATE, { provider: 'apple', returnTo: COMPLETE });
    const response = await worker.fetch(callback('google', { ...parameters, redirect: COMPLETE }), env);
    assert.equal(response.headers.get('location'), 'https://myfenrir.com/login?error=provider_error');
  }
});

test('non-Coach, credentialed, extra-query and attacker stored destinations retain prior behavior', async () => {
  for (const returnTo of ['https://myfenrir.com/main', 'https://forge.friskydev.com/', 'https://evil.test/auth/coach/complete?flow=' + FLOW, COMPLETE + '&redirect=https://evil.test/', COMPLETE + '&flow=' + FLOW, COMPLETE + '#fragment', COMPLETE.replace('https://', 'https://user@'), COMPLETE.replace(FLOW, 'short')]) {
    const env = environment();
    await saveOAuthState(env, STATE, { provider: 'google', returnTo });
    const response = await worker.fetch(callback('google', { redirect: COMPLETE }), env);
    assert.equal(response.headers.get('location'), 'https://myfenrir.com/login?error=provider_error');
  }
});

test('ordinary JSON clients retain their existing provider-error contract', async () => {
  const response = await worker.fetch(callback('google', {}, false, 'application/json'), environment());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'provider_error', detail: 'access_denied', description: 'Private raw provider error' });
});
