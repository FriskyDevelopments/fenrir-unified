/**
 * Fast origin health for uptime checks (avoids SPA fallback on /healthz).
 * Cloudflare 522 = edge could not get a timely response from origin; use this
 * path in monitoring instead of `/`.
 */
export const onRequestGet: PagesFunction = async () => {
  return new Response('ok\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

export const onRequestHead: PagesFunction = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
};
