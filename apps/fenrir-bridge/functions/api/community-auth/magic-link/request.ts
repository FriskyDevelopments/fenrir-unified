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
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured();

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
  const consumeLink = `${origin}/api/community-auth/magic-link/consume?token=${encodeURIComponent(token)}`;

  let delivery: "sent" | "pending_provider" = "pending_provider";
  let message = "Magic-link token created in Neon. Email delivery provider is not wired yet.";
  const resendKey = typeof context.env.RESEND_API_KEY === "string" ? context.env.RESEND_API_KEY.trim() : "";
  if (resendKey) {
    const from = typeof context.env.RESEND_FROM_EMAIL === "string" && context.env.RESEND_FROM_EMAIL.trim()
      ? context.env.RESEND_FROM_EMAIL.trim()
      : "Fenrir <noreply@myfenrir.com>";
    const sendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Your sign-in link for ${brand.name}`,
        text: `Tap to enter ${brand.name}:\n\n${consumeLink}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`
      })
    }).catch(() => null);
    if (sendResponse?.ok) {
      delivery = "sent";
      message = "Check your inbox — your sign-in link is on the way.";
    } else {
      message = "Magic-link token created, but the email provider rejected the send. Try again or contact the community owner.";
    }
  }

  return noStoreJson({
    ok: true,
    delivery,
    brandConfigured,
    linkId: link?.id,
    expiresAt: link?.expires_at,
    message,
    ...(devReturnLink ? { devLink: consumeLink } : {})
  });
}
