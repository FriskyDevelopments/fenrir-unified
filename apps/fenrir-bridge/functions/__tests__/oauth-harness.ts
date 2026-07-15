// Shared, network-free test harness for the OAuth auth flows.
//
// Everything here runs on Web Crypto + Node globals (fetch/Request/Response,
// btoa/atob, crypto.subtle) so the suites need no real provider, no Supabase,
// and no Neon — only deterministic in-memory fakes.

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** A self-signed RS256 id_token plus the JWKS document that validates it. */
export type IdTokenFixture = {
  idToken: string;
  jwks: { keys: JsonWebKey[] };
};

/**
 * Mint an RS256-signed OIDC id_token and the matching JWKS, exactly as the real
 * `verifyIdToken` expects (alg RS256, kid lookup, RSA key, signature + claims).
 */
export async function mintIdToken(claims: Record<string, unknown>): Promise<IdTokenFixture> {
  const kid = 'test-key-1';
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );
  const idToken = `${signingInput}.${base64Url(new Uint8Array(signature))}`;

  const jwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  return { idToken, jwks: { keys: [jwk] } };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export type RouteMatcher = {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
  /** populated as the router observes traffic */
  calls: Array<{ url: string; init?: RequestInit }>;
};

export type FetchRouter = {
  fetch: typeof fetch;
  routes: RouteMatcher[];
  /** every request the router saw, in order */
  calls: Array<{ url: string; init?: RequestInit }>;
};

/**
 * Build a fake `fetch` that dispatches by URL substring. Any unmatched request
 * throws — a test that hits the real network fails loudly instead of hanging.
 */
export function buildFetchRouter(
  routes: Array<{
    when: string;
    respond: (url: string, init?: RequestInit) => Response | Promise<Response>;
  }>
): FetchRouter {
  const calls: FetchRouter['calls'] = [];
  const wrapped: RouteMatcher[] = routes.map((route) => ({
    match: (url) => url.includes(route.when),
    respond: route.respond,
    calls: [],
  }));

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const effectiveInit = input instanceof Request ? input : init;
    calls.push({ url, init: effectiveInit as RequestInit });
    const route = wrapped.find((candidate) => candidate.match(url, effectiveInit as RequestInit));
    if (!route) {
      throw new Error(`Unexpected network call in test: ${url}`);
    }
    route.calls.push({ url, init: effectiveInit as RequestInit });
    return route.respond(url, effectiveInit as RequestInit);
  }) as typeof fetch;

  return { fetch: fakeFetch, routes: wrapped, calls };
}

/** Turn a `Set-Cookie` header value into a request-ready `name=value` pair. */
export function cookiePair(setCookieHeader: string) {
  return setCookieHeader.split(';', 1)[0];
}

/** Collect every Set-Cookie value from a Response (handles getSetCookie + fallback). */
export function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    const all = headers.getSetCookie();
    if (all.length) return all;
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

/** True if any Set-Cookie on the response sets a non-empty value for `name`. */
export function hasCookieSet(response: Response, name: string) {
  return setCookies(response).some((cookie) => {
    const pair = cookiePair(cookie);
    return pair.startsWith(`${name}=`) && pair.slice(name.length + 1).length > 0;
  });
}
