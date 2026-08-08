import { communitySql, type CommunityAuthEnv } from "../../../_lib/community-auth";
import { noStoreJson } from "../../../_lib/responses";

type AllowlistRequest = { community_slug?: unknown; email?: unknown };
type GatekeeperInternalEnv = CommunityAuthEnv & { FENRIR_GATEKEEPER_INTERNAL_SECRET?: string };

function unauthorized() { return noStoreJson({ ok: false, error: "unauthorized" }, { status: 401 }); }

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export const onRequestPost: PagesFunction<GatekeeperInternalEnv> = async (context) => {
  const configured = context.env.FENRIR_GATEKEEPER_INTERNAL_SECRET?.trim();
  const authorization = context.request.headers.get("authorization") || "";
  if (!configured || !timingSafeEqual(authorization, `Bearer ${configured}`)) return unauthorized();
  let body: AllowlistRequest;
  try { body = await context.request.json(); } catch { return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const slug = typeof body.community_slug === "string" ? body.community_slug.trim().toLowerCase() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
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
        and lower(user_record.email) = ${email}
    ) as allowed
  `;
  return noStoreJson({ ok: true, allowed: Boolean(row?.allowed), community_slug: slug });
};
