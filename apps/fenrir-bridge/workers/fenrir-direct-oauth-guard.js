const pagesOrigin = 'https://fenrir-bridge.pages.dev';

const jsonHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Fenrir-Edge': 'direct-oauth-guard',
};

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init.headers || {}),
    },
  });
}

function disabledDirectOauth(pathname) {
  const route = pathname.includes('/callback/') ? 'callback' : 'login';
  return json(
    {
      ok: false,
      error: 'direct_oauth_disabled',
      detail: `Register OAuth callbacks in Supabase and use the SPA callback route instead of /api/auth/${route}/:provider.`,
    },
    { status: 410 }
  );
}

async function proxyPagesRoot(request) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, pagesOrigin);
  const proxied = new Request(target, request);
  return fetch(proxied);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...jsonHeaders,
          'Access-Control-Allow-Origin': url.origin,
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
      });
    }

    if (
      url.pathname.startsWith('/api/auth/login/') ||
      url.pathname.startsWith('/api/auth/callback/')
    ) {
      return disabledDirectOauth(url.pathname);
    }

    return proxyPagesRoot(request);
  },
};
