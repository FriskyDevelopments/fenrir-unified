import { notifyHoneybadger } from '../../_lib/honeybadger';
import { noStoreJson } from '../../_lib/responses';

type ClientErrorBody = {
  name?: string;
  message?: string;
  stack?: string;
  source?: string;
  path?: string;
  userAgent?: string;
};

export async function onRequestPost(context: any) {
  const body = (await context.request.json().catch(() => null)) as ClientErrorBody | null;
  if (!body?.message) {
    return noStoreJson({ ok: false, error: 'missing_error_message' }, { status: 400 });
  }

  const error = new Error(String(body.message).slice(0, 1000));
  error.name = String(body.name || 'ClientError').slice(0, 120);
  error.stack = typeof body.stack === 'string' ? body.stack.slice(0, 12000) : '';

  const result = await notifyHoneybadger(context.env, {
    request: context.request,
    error,
    component: 'browser',
    action: 'client_error',
    tags: ['browser', 'fenrir'],
    context: {
      source: body.source,
      path: body.path,
      userAgent: body.userAgent,
    },
  }).catch(() => ({ ok: false, status: 0 }));

  return noStoreJson({ ok: true, reported: result.ok, status: result.status ?? null });
}
