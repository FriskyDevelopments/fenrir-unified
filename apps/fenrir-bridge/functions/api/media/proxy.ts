import { fetchProxiedImage, verifyMediaProxyRequest } from '../../_lib/media-proxy';

type MediaEnv = {
  SESSION_SECRET?: string;
};

export const onRequestGet: PagesFunction<MediaEnv> = async (context) => {
  let target = '';
  try {
    target = await verifyMediaProxyRequest(context.request, context.env);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'media_proxy_failed' },
      { status: 503 }
    );
  }

  if (!target) {
    return Response.json(
      { ok: false, error: 'invalid_media_proxy_signature' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return fetchProxiedImage(target);
};
