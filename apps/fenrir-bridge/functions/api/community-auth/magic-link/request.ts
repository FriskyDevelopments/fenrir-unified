import {
  communityAuthConfigured,
  communityAuthNotConfigured,
  communityBrandConfigured,
  communitySql,
  ensureCommunityBrandPayload,
  ensureCommunityMembershipForEmail,
  newToken,
  normalizeCommunitySlug,
  sha256Hex,
  siteOrigin
} from "../../../_lib/community-auth";
import { noStoreJson } from "../../../_lib/responses";

type MagicLinkRequest = {
  email?: unknown;
  slug?: unknown;
};

export async function onRequestPost(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured(context.env);

  const body = await context.request.json().catch(() => null) as MagicLinkRequest | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const slug = normalizeCommunitySlug(body?.slug);

  if (!slug) {
    return noStoreJson({ ok: false, error: "invalid_community_slug" }, { status: 400 });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return noStoreJson({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const brand = await ensureCommunityBrandPayload(context.env, slug);
  if (!brand?.communityOrgId) {
    return noStoreJson({ ok: false, error: "community_org_required" }, { status: 400 });
  }

  const sql = await communitySql(context.env);
  await ensureCommunityMembershipForEmail(sql, email, brand.communityOrgId);

  const token = newToken();
  const tokenHash = await sha256Hex(token);
  const [link] = await sql`
    insert into fenrir_community_magic_links (email, community_slug, token_hash, expires_at)
    values (${email}, ${slug}, ${tokenHash}, now() + interval '15 minutes')
    on conflict (token_hash) do update set created_at = now(), expires_at = now() + interval '15 minutes'
    returning id, expires_at
  `;

  const brandConfigured = await communityBrandConfigured(context.env);
  const origin = siteOrigin(context.request, context.env);
  const devReturnLink = context.env.FENRIR_COMMUNITY_AUTH_DEV_RETURN_LINK === "true";
  return noStoreJson({
    ok: true,
    delivery: "pending_provider",
    brandConfigured,
    linkId: link?.id,
    expiresAt: link?.expires_at,
    message: "Magic-link token created in Neon. Email delivery provider is not wired yet.",
    ...(devReturnLink ? { devLink: `${origin}/api/community-auth/magic-link/consume?token=${encodeURIComponent(token)}` } : {})
  });
}
