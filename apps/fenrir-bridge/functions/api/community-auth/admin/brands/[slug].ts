import { readSession } from "../../../../_lib/auth";
import {
  assertBrandPayload,
  communityAuthConfigured,
  communityAuthNotConfigured,
  ensureCommunityBrandPayload,
  resolveCommunityAuthError,
  upsertCommunityBrand,
  verifyCommunityBrandWriteAuthorized
} from "../../../../_lib/community-auth";
import { noStoreJson } from "../../../../_lib/responses";

export async function onRequestGet(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured();

  try {
    const session = await readSession(context.request, context.env);
    const slug = String(context.params.slug ?? "");
    const authorization = await verifyCommunityBrandWriteAuthorized(session, context.env, slug);
    const brand = await ensureCommunityBrandPayload(context.env, slug);
    return noStoreJson({ ok: true, brand, authorization });
  } catch (error) {
    return resolveCommunityAuthError(error);
  }
}

export async function onRequestPut(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured();

  try {
    const session = await readSession(context.request, context.env);
    const slug = String(context.params.slug ?? "");
    const authorization = await verifyCommunityBrandWriteAuthorized(session, context.env, slug);
    const body = await context.request.json().catch(() => null);
    const payload = assertBrandPayload(body);
    const brand = await upsertCommunityBrand(context.env, slug, payload);
    return noStoreJson({ ok: true, brand, authorization });
  } catch (error) {
    return resolveCommunityAuthError(error);
  }
}
