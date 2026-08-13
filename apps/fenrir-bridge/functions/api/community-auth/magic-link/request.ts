import { sendMyFenrirEmail } from "../../../_lib/myfenrir-emails";
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
  const magicLink = `${origin}/api/community-auth/magic-link/consume?token=${encodeURIComponent(token)}`;
  // Branded delivery via the dedicated myfenrir-emails Worker when configured
  // (MYFENRIR_EMAILS_URL/_TOKEN); otherwise this gracefully falls back to the
  // Pages EMAIL binding with a compact on-brand shell. Same response contract
  // and error codes as before, so existing callers/tests keep working.
  const emailResult = await sendMyFenrirEmail(context.env, {
    template: "acceso",
    to: email,
    subject: "Tu acceso a MyFenrir",
    data: {
      url: magicLink,
      minutos: 15,
      comunidad: (brand as any)?.displayName ?? (brand as any)?.name ?? undefined,
      email
    }
  });
  if (!emailResult.ok) {
    const notConfigured = emailResult.error === "email_not_configured";
    if (!notConfigured) console.error("MyFenrir email send failed", emailResult.error);
    return noStoreJson(
      {
        ok: false,
        error: notConfigured ? "email_service_not_configured" : "email_delivery_failed",
        linkId: link?.id,
        expiresAt: link?.expires_at
      },
      { status: notConfigured ? 503 : 502 }
    );
  }
  return noStoreJson({
    ok: true,
    delivery: emailResult.via === "worker" ? "myfenrir_emails_worker" : "cloudflare_email_service",
    brandConfigured,
    linkId: link?.id,
    expiresAt: link?.expires_at,
    message: "Magic link sent.",
    ...(devReturnLink ? { devLink: magicLink } : {})
  });
}
