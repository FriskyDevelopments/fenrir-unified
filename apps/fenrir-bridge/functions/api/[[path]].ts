import { noStoreJson } from '../_lib/responses';

export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  return noStoreJson(
    {
      ok: false,
      error: 'api_route_not_found',
      path: url.pathname,
      source: 'fenrir-bridge-pages-functions',
    },
    { status: 404 }
  );
}
