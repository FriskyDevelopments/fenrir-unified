import { readSession } from '../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../_lib/billing-env';
import { signedMediaProxyPath } from '../_lib/media-proxy';
import {
  addAudit,
  cleanSlug,
  createProductId,
  getDomainForOrg,
  mapRoom,
  publicUrl,
} from '../_lib/product-db';
import { noStoreJson } from '../_lib/responses';

const providers = new Set(['zoom', 'webex', 'whereby', 'google_meet', 'other']);

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session)
    return noStoreJson({ ok: false, error: 'authentication_required' }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request
    .json<{
      domainId?: unknown;
      slug?: unknown;
      title?: unknown;
      provider?: unknown;
      targetUrl?: unknown;
      coverImageUrl?: unknown;
    }>()
    .catch(() => null);
  const domainId = typeof body?.domainId === 'string' ? body.domainId : '';
  const domain = await getDomainForOrg(context.env.DB, session.frisky_org_id, domainId);
  if (!domain) return noStoreJson({ ok: false, error: 'domain_not_found' }, { status: 404 });

  const targetUrl = typeof body?.targetUrl === 'string' ? body.targetUrl.trim() : '';
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return noStoreJson({ ok: false, error: 'invalid_target_url' }, { status: 400 });
  }

  const slug = cleanSlug(typeof body?.slug === 'string' ? body.slug : 'room', 'room');
  const provider =
    typeof body?.provider === 'string' && providers.has(body.provider) ? body.provider : 'other';
  const title =
    typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : `${slug} Live Room`;
  const requestedCoverImageUrl =
    typeof body?.coverImageUrl === 'string' ? body.coverImageUrl.trim() : '';
  const coverImageUrl = requestedCoverImageUrl
    ? await signedMediaProxyPath(requestedCoverImageUrl, context.env)
    : '';
  if (requestedCoverImageUrl && !coverImageUrl) {
    return noStoreJson({ ok: false, error: 'invalid_cover_image_url' }, { status: 400 });
  }
  const roomId = createProductId('room', slug);
  const ts = new Date().toISOString();

  await context.env.DB.prepare(
    `INSERT INTO frisky_live_rooms (
        id, org_id, domain_id, slug, title, provider, target_url, public_url,
        cover_image_url, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
  )
    .bind(
      roomId,
      session.frisky_org_id,
      domain.id,
      slug,
      title,
      provider,
      targetUrl,
      publicUrl(domain.domain, slug),
      coverImageUrl,
      ts
    )
    .run();

  await addAudit(context.env.DB, session, 'live_room_created', 'FriskyLiveRoom', roomId, {
    provider,
    slug,
  });
  const row = await context.env.DB.prepare(`SELECT * FROM frisky_live_rooms WHERE id = ?`)
    .bind(roomId)
    .first<any>();
  return noStoreJson({ ok: true, data: mapRoom(row) });
};
