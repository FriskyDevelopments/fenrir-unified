import { noStoreJson } from '../_lib/responses';

const healthPayload = (request: Request) => ({
  ok: true,
  service: 'fenrir-bridge-pages-functions',
  path: new URL(request.url).pathname,
  routeContract: {
    apiReturnsJson: true,
    unknownApiReturnsJson404: true,
    spaFallbackOwnsApi: false,
  },
});

export async function onRequestGet(context: any) {
  return noStoreJson(healthPayload(context.request));
}

export async function onRequestHead() {
  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
