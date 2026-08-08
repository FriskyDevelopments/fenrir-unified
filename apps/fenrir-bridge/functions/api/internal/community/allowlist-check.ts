import { communitySql } from "../../../_lib/community-auth";
import { noStoreJson } from "../../../_lib/responses";

type AllowlistRequest = { community_slug?: unknown; email?: unknown; telegram_user_id?: unknown };

function unauthorized() { return noStoreJson({ ok: false, error: "unauthorized" }, { status: 401 }); }

export async function onRequestPost(context: any) {
  const configured = context.env.FENRIR_GATEKEEPER_INTERNAL_SECRET?.trim();
  const authorization = context.request.headers.get("authorization") || "";
  if (!configured || authorization !== `Bearer ${configured}`) return unauthorized();
  let body: AllowlistRequest;
  try { body = await context.request.json(); } catch { return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const slug = typeof body.community_slug === "string" ? body.community_slug.trim().toLowerCase() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const telegramUserId = typeof body.telegram_user_id === "string" || typeof body.telegram_user_id === "number" ? String(body.telegram_user_id) : "";
  if (!slug || !email) return noStoreJson({ ok: false, error: "invalid_request" }, { status: 400 });
  if (!context.env.NEON_DATABASE_URL?.trim()) return noStoreJson({ ok: false, error: "neon_not_configured" }, { status: 503 });
  const sql = await communitySql(context.env);
  const [row] = await sql`
    select exists (
      select 1
      from fenrir_gate_communities gc
      join fenrir_community_orgs org on org.id = gc.org_id
      join fenrir_community_memberships membership on membership.org_id = org.id
      join fenrir_community_users user_record on user_record.id = membership.user_id
      where gc.slug = ${slug}
        and membership.status = 'active'
        and user_record.access_status = 'active'
        and (${email} = '' or lower(user_record.email) = ${email})
    ) as allowed
  `;
  return noStoreJson({ ok: true, allowed: Boolean(row?.allowed), community_slug: slug });
}
