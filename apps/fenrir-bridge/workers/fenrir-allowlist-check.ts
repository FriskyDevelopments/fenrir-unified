/**
 * fenrir-allowlist-check — standalone Worker for the Gatekeeper's internal
 * Neon contracts (SPEC: worker/src/index.ts checkNeonAllowlist).
 *
 * Deliberately deployed as a zone-routed Worker on exact paths instead of
 * shipping a new Pages deployment: Pages deploys are atomic (SPA + functions
 * together) and the branch's SPA is mid-refactor, so these routes must not
 * depend on it. The equivalent Pages Function
 * (functions/api/internal/community/allowlist-check.ts) stays in the tree; when
 * a full Pages deploy next ships it, retire this worker and its routes
 * deliberately.
 *
 * Paths served:
 *   POST /api/internal/community/allowlist-check  → membership allowlist read
 *   POST /api/internal/community/gate-create      → create one public Gate row
 *
 * Secrets: FENRIR_GATEKEEPER_INTERNAL_SECRET (shared with the Gatekeeper
 * worker), NEON_DATABASE_URL (same value as the Pages project secret).
 */
import { neon } from "@neondatabase/serverless";

type Env = {
  FENRIR_GATEKEEPER_INTERNAL_SECRET?: string;
  NEON_DATABASE_URL?: string;
};

/**
 * Free tier: five Gates to build and test. Mirrors
 * apps/community-bridge/src/lib/gate-limits.ts — if one moves, move both.
 * Linking a Gate to a live community is what costs money, not owning one.
 */
const FREE_GATE_LIMIT = 5;

/** Public origin that serves /g/<slug>. */
const PUBLIC_GATE_ORIGIN = "https://communities.myfenrir.com";

/** Tenant every Gate created from Telegram belongs to today. */
const DEFAULT_BRAND_ID = "myfenrir";
const DEFAULT_PRESET = "fenrir-dark";

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

type Sql = ReturnType<typeof neon>;

/** Same shape the public page and the bot both accept: 3–40 [a-z0-9-]. */
function slugifyGateName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug);
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "23505";
}

function errorText(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return String(typeof message === "string" ? message : error).slice(0, 300);
}

/**
 * Resolves the durable owner row for a Telegram account. A Gate created from
 * Telegram is owned by a stable uuid recorded here, so when the operator later
 * links their MyFenrir account a single UPDATE re-points every Gate they made.
 * `linked_supabase` states plainly whether that link already happened — the bot
 * repeats that status to the operator instead of implying a dashboard row that
 * does not exist yet.
 */
async function resolveGateOwner(
  sql: Sql,
  telegramUserId: number,
): Promise<{ userId: string; linkedSupabase: boolean }> {
  const existing = (await sql`
    select user_id, linked_supabase
    from cb_gate_bot_owners
    where telegram_user_id = ${telegramUserId}
    limit 1
  `) as Array<{ user_id: string; linked_supabase: boolean }>;
  if (existing[0]) {
    return { userId: existing[0].user_id, linkedSupabase: Boolean(existing[0].linked_supabase) };
  }

  // Race-safe: another concurrent /gate for the same operator must not mint a
  // second identity. On conflict we re-read the winner rather than guessing.
  const inserted = (await sql`
    insert into cb_gate_bot_owners (telegram_user_id, user_id)
    values (${telegramUserId}, gen_random_uuid())
    on conflict (telegram_user_id) do nothing
    returning user_id, linked_supabase
  `) as Array<{ user_id: string; linked_supabase: boolean }>;
  if (inserted[0]) {
    return { userId: inserted[0].user_id, linkedSupabase: Boolean(inserted[0].linked_supabase) };
  }

  const winner = (await sql`
    select user_id, linked_supabase
    from cb_gate_bot_owners
    where telegram_user_id = ${telegramUserId}
    limit 1
  `) as Array<{ user_id: string; linked_supabase: boolean }>;
  if (!winner[0]) throw new Error("gate_owner_row_missing_after_insert");
  return { userId: winner[0].user_id, linkedSupabase: Boolean(winner[0].linked_supabase) };
}

/**
 * Creates one Gate row and returns the slug it actually wrote.
 *
 * `community_id` is written to the same value as `slug` on purpose. The bot and
 * the Gatekeeper address a community by its slug; the public page reads
 * cb_gate_configs.slug. Writing both from one source is what stops those two
 * namespaces drifting apart for every Gate created from here on.
 */
async function insertGate(
  sql: Sql,
  input: { userId: string; baseSlug: string; headline: string },
): Promise<string> {
  const candidates = [input.baseSlug];
  for (let suffix = 2; suffix <= 9; suffix += 1) {
    const candidate = `${input.baseSlug.slice(0, 38)}-${suffix}`.replace(/^-+|-+$/g, "");
    if (isValidSlug(candidate)) candidates.push(candidate);
  }
  const randomTail = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
  const randomCandidate = `${input.baseSlug.slice(0, 33)}-${randomTail}`.replace(/^-+|-+$/g, "");
  if (isValidSlug(randomCandidate)) candidates.push(randomCandidate);

  for (const candidate of candidates) {
    try {
      const rows = (await sql`
        insert into cb_gate_configs (user_id, brand_id, community_id, slug, preset, headline, subheadline)
        values (
          ${input.userId}::uuid, ${DEFAULT_BRAND_ID}, ${candidate}, ${candidate},
          ${DEFAULT_PRESET}, ${input.headline}, ''
        )
        returning slug
      `) as Array<{ slug: string }>;
      if (!rows[0]?.slug) throw new Error("gate_insert_returned_no_row");
      return rows[0].slug;
    } catch (error) {
      // Only a slug collision is retryable. Anything else is a real failure and
      // must surface — swallowing it here is exactly how a Gate gets reported
      // as created while nothing was written.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("gate_slug_exhausted");
}

async function handleAllowlistCheck(request: Request, env: Env): Promise<Response> {
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

async function handleGateCreate(request: Request, env: Env): Promise<Response> {
  let body: { telegram_user_id?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = Number(body.telegram_user_id);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    return noStoreJson({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }
  const rawName = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!rawName || rawName.length > 60) {
    return noStoreJson({ ok: false, error: "invalid_name" }, { status: 400 });
  }
  const baseSlug = slugifyGateName(rawName);
  if (!isValidSlug(baseSlug)) {
    return noStoreJson({ ok: false, error: "name_not_slugifiable", name: rawName }, { status: 422 });
  }
  if (!env.NEON_DATABASE_URL?.trim()) {
    return noStoreJson({ ok: false, error: "neon_not_configured" }, { status: 503 });
  }

  const sql = neon(env.NEON_DATABASE_URL.trim());
  let owner: { userId: string; linkedSupabase: boolean };
  try {
    owner = await resolveGateOwner(sql, telegramUserId);
  } catch (error) {
    console.error("gate_create_owner_failed", errorText(error));
    return noStoreJson({ ok: false, error: "owner_resolve_failed", detail: errorText(error) }, { status: 503 });
  }

  let used: number;
  try {
    const rows = (await sql`
      select count(*)::int as used from cb_gate_configs where user_id = ${owner.userId}::uuid
    `) as Array<{ used: number }>;
    used = Number(rows[0]?.used ?? 0);
  } catch (error) {
    console.error("gate_create_quota_failed", errorText(error));
    return noStoreJson({ ok: false, error: "quota_read_failed", detail: errorText(error) }, { status: 503 });
  }
  if (used >= FREE_GATE_LIMIT) {
    return noStoreJson(
      { ok: false, error: "gate_limit_reached", used, limit: FREE_GATE_LIMIT },
      { status: 409 },
    );
  }

  let slug: string;
  try {
    slug = await insertGate(sql, { userId: owner.userId, baseSlug, headline: rawName });
  } catch (error) {
    console.error("gate_create_insert_failed", errorText(error));
    return noStoreJson({ ok: false, error: "gate_insert_failed", detail: errorText(error) }, { status: 503 });
  }

  return noStoreJson({
    ok: true,
    slug,
    community_id: slug,
    name: rawName,
    url: `${PUBLIC_GATE_ORIGIN}/g/${slug}`,
    used: used + 1,
    limit: FREE_GATE_LIMIT,
    owner_linked_to_dashboard: owner.linkedSupabase,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return noStoreJson({ ok: false, error: "method_not_allowed" }, { status: 405 });
    }
    const configured = env.FENRIR_GATEKEEPER_INTERNAL_SECRET?.trim();
    const authorization = request.headers.get("authorization") || "";
    if (!configured || !timingSafeEqual(authorization, `Bearer ${configured}`)) return unauthorized();

    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith("/gate-create")) return handleGateCreate(request, env);
    return handleAllowlistCheck(request, env);
  },
};
