import {
  communityAuthConfigured,
  communityAuthNotConfigured,
  ensureCommunityBrandPayload,
  resolveCommunityAuthError,
} from '../../../_lib/community-auth';
import { noStoreJson } from '../../../_lib/responses';

export async function onRequestGet(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured(context.env);

  try {
    const slug = String(context.params.slug ?? '');
    const brand = await ensureCommunityBrandPayload(context.env, slug);
    return noStoreJson({ ok: true, brand });
  } catch (error) {
    return resolveCommunityAuthError(error);
  }
}
