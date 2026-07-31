import {
  communityAuthConfigured,
  communityAuthNotConfigured,
  ensureCommunityBrandPayload,
  resolveCommunityAuthError
} from "../../../_lib/community-auth";
import { availableCommunityAuthProviders } from "../../../_lib/community-oauth";
import { noStoreJson } from "../../../_lib/responses";

export async function onRequestGet(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured(context.env);

  try {
    const slug = String(context.params.slug ?? "");
    const brand = await ensureCommunityBrandPayload(context.env, slug);
    return noStoreJson({
      ok: true,
      brand: { ...brand, available_auth_providers: availableCommunityAuthProviders(context.env) }
    });
  } catch (error) {
    return resolveCommunityAuthError(error, context.env);
  }
}
