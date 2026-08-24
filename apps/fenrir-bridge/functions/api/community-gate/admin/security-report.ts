import { neon } from "@neondatabase/serverless";
import { readSession } from "../../../_lib/auth";
import { noStoreJson } from "../../../_lib/responses";

import {
  assertCommunityStaff,
  authErrorResponse,
  communityGateConfigured,
  communityGateNotConfigured,
  communityGateSql,
  parseSlug,
  requireCommunityGateUser
} from "../../../_lib/community-gate";

// SECURITY REPORT — REAL DATA ONLY.
// No mock/fake data for go-live. Queries aligned to actual gate schema
// (profiles + community_memberships + verification_sessions + communities).
// Returns clear errors when Neon/schema is missing.
export async function onRequestGet(context: any) {
  let gateUser = null;
  try {
    gateUser = await requireCommunityGateUser(context.request, context.env);
  } catch {}

  const mainSession = await readSession(context.request, context.env);
  if (!gateUser && !mainSession) {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  const url = new URL(context.request.url);
  const communitySlug = parseSlug(url.searchParams.get("communitySlug") ?? "fenrir");
  if (!communitySlug) {
    return noStoreJson({ ok: false, error: "communitySlug_required" }, { status: 400 });
  }

  if (!communityGateConfigured(context.env)) {
    return communityGateNotConfigured(context.env);
  }

  let isStaff = false;
  try {
    const userForCheck = gateUser || (await requireCommunityGateUser(context.request, context.env));
    await assertCommunityStaff(context.env, userForCheck, communitySlug);
    isStaff = true;
  } catch {
    isStaff = false;
  }

  if (!isStaff && !mainSession) {
    return noStoreJson({ ok: false, error: "community_staff_required" }, { status: 403 });
  }

  try {
    const sql = await communityGateSql(context.env);

    const [community] = await sql`
      SELECT id, slug, name FROM communities WHERE slug = ${communitySlug} LIMIT 1
    `;
    if (!community) {
      return noStoreJson({ ok: false, error: "community_not_found" }, { status: 404 });
    }

    // Real stats from gate schema
    const membersRes = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE cm.status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE cm.status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE cm.status IN ('denied','paused'))::int AS blocked_or_paused,
        COUNT(*) FILTER (WHERE p.display_name IS NULL OR p.display_name = '')::int AS missing_display_name
      FROM community_memberships cm
      JOIN profiles p ON p.id = cm.profile_id
      JOIN communities c ON c.id = cm.community_id
      WHERE c.slug = ${communitySlug}
    `;

    const verifRes = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'granted')::int AS granted,
        COUNT(*) FILTER (WHERE status = 'denied')::int AS denied,
        COUNT(*) FILTER (WHERE status = 'flagged')::int AS flagged,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_review
      FROM verification_sessions vs
      JOIN communities c ON c.id = vs.community_id
      WHERE c.slug = ${communitySlug}
    `;

    const m = membersRes[0] || {};
    const v = verifRes[0] || {};

    const totalMembers = Number(m.total) || 0;
    const active = Number(m.active) || 0;
    const pendingM = Number(m.pending) || 0;
    const blocked = Number(m.blocked_or_paused) || 0;
    const missing = Number(m.missing_display_name) || 0;

    const totalV = Number(v.total) || 0;
    const granted = Number(v.granted) || 0;
    const denied = Number(v.denied) || 0;
    const flagged = Number(v.flagged) || 0;

    return noStoreJson({
      ok: true,
      data: {
        community: { id: community.id, slug: community.slug, name: community.name },
        users: {
          total: totalMembers,
          verified: active,
          blocked,
          pending: pendingM,
          missingDisplayName: missing
        },
        sessions: {
          total: totalV,
          successful: granted,
          failed: denied,
          blocked: flagged,
          expired: 0,
          pending: Number(v.pending_review) || 0
        },
        impact: {
          blockedAttempts: flagged + denied,
          usersNeedingProfileFixes: missing,
          fullyVerifiedUsers: active
        },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error("security-report query error:", error?.message || error);
    return authErrorResponse(error);
  }
}
