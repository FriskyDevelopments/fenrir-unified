/**
 * fenrir-allowlist-check — standalone Worker for the Gatekeeper's internal
 * Neon allowlist contract (SPEC: worker/src/index.ts checkNeonAllowlist).
 *
 * Deliberately deployed as a zone-routed Worker on the exact path
 * `/api/internal/community/allowlist-check` instead of shipping a new Pages
 * deployment: Pages deploys are atomic (SPA + functions together) and the
 * branch's SPA is mid-refactor, so this route must not depend on it. The
 * equivalent Pages Function (functions/api/internal/community/allowlist-check.ts)
 * stays in the tree; when a full Pages deploy next ships it, retire this worker
 * and its routes deliberately.
 *
 * Secrets: FENRIR_GATEKEEPER_INTERNAL_SECRET (shared with the Gatekeeper
 * worker), NEON_DATABASE_URL (same value as the Pages project secret).
 */
import { neon } from "@neondatabase/serverless";

type Env = {
  FENRIR_GATEKEEPER_INTERNAL_SECRET?: string;
  NEON_DATABASE_URL?: string;
};

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function unauthorized() {
  return noStoreJson({ ok: false, error: "unauthorized" }, { status: 401 });
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return noStoreJson({ ok: false, error: "method_not_allowed" }, { status: 405 });
    }
    const configured = env.FENRIR_GATEKEEPER_INTERNAL_SECRET?.trim();
    const authorization = request.headers.get("authorization") || "";
    if (!configured || !timingSafeEqual(authorization, `Bearer ${configured}`)) return unauthorized();

    let body: { community_slug?: unknown; email?: unknown };
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const slug = typeof body.community_slug === "string" ? body.community_slug.trim().toLowerCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!slug || !email) return noStoreJson({ ok: false, error: "invalid_request" }, { status: 400 });
    if (!env.NEON_DATABASE_URL?.trim()) {
      return noStoreJson({ ok: false, error: "neon_not_configured" }, { status: 503 });
    }

    const sql = neon(env.NEON_DATABASE_URL.trim());
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
  }
};
