import { assertCommunityStaff, authErrorResponse, communityGateConfigured, communityGateNotConfigured, communityGateSql, parseSlug, requireCommunityGateUser } from "../../../_lib/community-gate";
import { noStoreJson } from "../../../_lib/responses";

type ReviewBody = {
  sessionId?: unknown;
  status?: unknown;
  reason?: unknown;
  communitySlug?: unknown;
};

export async function onRequestPost(context: any) {
  if (!communityGateConfigured(context.env)) return communityGateNotConfigured(context.env);

  const body = await context.request.json().catch(() => null) as ReviewBody | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const communitySlug = parseSlug(body?.communitySlug);

  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return noStoreJson({ ok: false, error: "session_id_invalid" }, { status: 400 });
  }
  if (!["granted", "denied", "flagged"].includes(status)) {
    return noStoreJson({ ok: false, error: "review_status_invalid" }, { status: 400 });
  }

  try {
    const user = await requireCommunityGateUser(context.request, context.env);
    const { profile } = await assertCommunityStaff(context.env, user, communitySlug);
    const sql = await communityGateSql(context.env);
    const [updated] = await sql`
      update verification_sessions
      set
        status = ${status},
        decision_reason = ${reason || null},
        updated_at = now()
      where id = ${sessionId}::uuid
      returning id, community_id, profile_id, status, decision_reason
    `;

    if (!updated) return noStoreJson({ ok: false, error: "session_not_found" }, { status: 404 });

    await sql`
      insert into audit_logs (event, actor_profile_id, community_id, target_id, metadata)
      values (
        'SESSION_REVIEWED',
        ${profile.id},
        ${updated.community_id},
        ${updated.id},
        ${JSON.stringify({ status, reason })}
      )
    `;

    return noStoreJson({ ok: true, data: updated });
  } catch (error) {
    return authErrorResponse(error);
  }
}
