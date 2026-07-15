import { readSession } from '../../../_lib/auth';
import { dbNotConfiguredResponse, type BillingEnv } from '../../../_lib/billing-env';
import { resolvePublicBridge } from '../../../_lib/product-db';
import { noStoreJson } from '../../../_lib/responses';

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  if (!context.env.DB) return dbNotConfiguredResponse();
  const hostname = new URL(context.request.url).hostname;
  const slug = String(context.params.slug ?? '')
    .trim()
    .toLowerCase();
  const resolved = await resolvePublicBridge(context.env.DB, hostname, slug);
  if (!resolved)
    return noStoreJson({ ok: false, error: 'public_lock_unavailable' }, { status: 404 });

  const session = await readSession(context.request, context.env).catch(() => null);
  const ownsBridge = session?.frisky_org_id === resolved.bridge.orgId;
  return noStoreJson({
    ok: true,
    bridge: resolved.bridge,
    invite: ownsBridge ? resolved.invite : null,
    access: {
      inviteAvailable: ownsBridge,
      reason: ownsBridge ? 'owner_session' : 'server_side_access_required',
    },
  });
};
