import {
  authErrorResponse,
  clientIp,
  communityGateConfigured,
  communityGateNotConfigured,
  communityGateSql,
  parseInviteCode,
  parseSlug,
  requireCommunityGateUser,
  userAgent
} from "../../../_lib/community-gate";
import { noStoreJson } from "../../../_lib/responses";

type VerifyBody = {
  code?: unknown;
  token?: unknown;
  communitySlug?: unknown;
  slug?: unknown;
};

export async function onRequestPost(context: any) {
  if (!communityGateConfigured(context.env)) return communityGateNotConfigured(context.env);

  const body = await context.request.json().catch(() => null) as VerifyBody | null;
  const code = parseInviteCode(body?.code ?? body?.token);
  const slug = parseSlug(body?.communitySlug ?? body?.slug ?? "fenrir");

  if (!code) return noStoreJson({ ok: false, error: "invite_code_required" }, { status: 400 });
  if (!slug) return noStoreJson({ ok: false, error: "community_slug_invalid" }, { status: 400 });

  try {
    const user = await requireCommunityGateUser(context.request, context.env);
    const sql = await communityGateSql(context.env);
    const [result] = await sql`
      select *
      from consume_invite_code(
        ${code},
        ${slug},
        ${user.authSubject}::uuid,
        ${user.email},
        ${clientIp(context.request)},
        ${userAgent(context.request)}
      )
    `;

    if (!result?.ok) {
      return noStoreJson({
        ok: false,
        decision: result?.decision ?? "denied",
        sessionId: result?.session_id ?? null
      }, { status: 403 });
    }

    return noStoreJson({
      ok: true,
      decision: result.decision,
      sessionId: result.session_id,
      communityId: result.community_id,
      profileId: result.profile_id
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
