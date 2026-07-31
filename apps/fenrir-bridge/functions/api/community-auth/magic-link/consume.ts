import {
  communityAuthConfigured,
  communityAuthNotConfigured,
  communitySessionSetCookie,
  communitySql,
  createCommunitySessionPayload,
  createCommunitySessionRecord,
  ensureCommunityBrandPayload,
  ensureCommunityMembershipForEmail,
  normalizeCommunitySlugOrThrow,
  requestClientIp,
  requestUserAgent,
  sha256Hex,
  signCommunitySession
} from "../../../_lib/community-auth";
import { noStoreJson } from "../../../_lib/responses";

type MagicLinkConsume = {
  token?: unknown;
};

export async function onRequestPost(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured(context.env);

  const body = await context.request.json().catch(() => null) as MagicLinkConsume | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  return consumeMagicLink(context, token, false);
}

export async function onRequestGet(context: any) {
  if (!communityAuthConfigured(context.env)) return communityAuthNotConfigured(context.env);

  const url = new URL(context.request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  return consumeMagicLink(context, token, true);
}

async function consumeMagicLink(context: any, token: string, redirectAfter: boolean) {
  if (!token) return noStoreJson({ ok: false, error: "missing_token" }, { status: 400 });

  try {
    const tokenHash = await sha256Hex(token);
    const sql = await communitySql(context.env);
    const [link] = await sql`
      select id, email, community_slug, expires_at, used_at
      from fenrir_community_magic_links
      where token_hash = ${tokenHash}
      limit 1
    `;

    if (!link || link.used_at || new Date(link.expires_at).getTime() < Date.now()) {
      return noStoreJson({ ok: false, error: "magic_link_invalid_or_expired" }, { status: 400 });
    }

    const slug = normalizeCommunitySlugOrThrow(link.community_slug);
    const brand = await ensureCommunityBrandPayload(context.env, slug);
    if (!brand.communityOrgId) {
      return noStoreJson({ ok: false, error: "community_org_required" }, { status: 400 });
    }

    const email = String(link.email).trim().toLowerCase();
    const { user, membership } = await ensureCommunityMembershipForEmail(sql, email, brand.communityOrgId);

    await sql`
      update fenrir_community_magic_links
      set used_at = now()
      where id = ${link.id}
    `;

    const payload = createCommunitySessionPayload({
      userId: user.id,
      email: user.email,
      role: user.role,
      accessStatus: user.access_status,
      communitySlug: slug,
      communityOrgId: brand.communityOrgId
    });
    const session = await signCommunitySession(payload, context.env);
    const cookie = communitySessionSetCookie(session);

    await createCommunitySessionRecord(context.env, {
      userId: user.id,
      sessionHash: await sha256Hex(session),
      userAgent: requestUserAgent(context.request),
      ipHint: requestClientIp(context.request),
      expiresAt: new Date(payload.exp * 1000)
    });

    if (redirectAfter) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL(`/community/${slug}`, context.request.url).toString(),
          "Set-Cookie": cookie
        }
      });
    }

    return noStoreJson({
      ok: true,
      auth: {
        authenticated: true,
        product: "fenrir-community-gate",
        user: {
          id: user.id,
          email: user.email,
          name: user.display_name,
          role: user.role,
          accessStatus: user.access_status,
          membership: {
            role: membership.role,
            status: membership.status
          },
          orgId: brand.communityOrgId
        },
        communitySlug: slug,
        communityOrgId: brand.communityOrgId
      }
    }, {
      headers: {
        "Set-Cookie": cookie
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "community_auth_error";
    if (message === "invalid_community_slug") {
      return noStoreJson({ ok: false, error: "invalid_community_slug" }, { status: 400 });
    }
    if (message === "community_org_required") {
      return noStoreJson({ ok: false, error: "community_org_required" }, { status: 400 });
    }
    return noStoreJson({ ok: false, error: message }, { status: 400 });
  }
}
