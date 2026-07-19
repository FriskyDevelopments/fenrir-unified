import { readSession, type SessionPayload } from "./auth";
import { noStoreJson } from "./responses";

export type CommunityAuthEnv = {
  NEON_DATABASE_URL?: string;
  FENRIR_COMMUNITY_AUTH_SECRET?: string;
  FENRIR_COMMUNITY_AUTH_DEV_RETURN_LINK?: string;
  PUBLIC_SITE_URL?: string;
  FENRIR_BRAND_ADMIN_MODE?: string;
  SUPABASE_ADMIN_EMAILS?: string;
  FENRIR_BRAND_ADMIN_ALLOWLIST?: string;
};

export const COMMUNITY_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$/;
const COMMUNITY_NAME = "Community";

export type CommunityAuthMode = "internal_only" | "allowlisted_owners" | "owner_self_service";
export type DefaultAccessState = "provisional" | "open" | "invite_only" | "disabled";

const DEFAULT_AUTH_PROVIDERS = ["magic_link"] as const;
const SUPPORTED_AUTH_PROVIDERS = new Set(["magic_link", "google", "apple", "microsoft"]);
const DEFAULT_FALLBACK_BRAND_PRIMARY_COLOR = "#22c7a8";
const DEFAULT_FALLBACK_BRAND_SECONDARY_COLOR = "#8cb9ff";
const DEFAULT_FALLBACK_BRAND_ACCENT_COLOR = "#9b8cff";
const DEFAULT_FALLBACK_BRAND_HEADLINE = "Community Access";
const DEFAULT_FALLBACK_BRAND_SUBHEADLINE = "Enter your email to continue into this Fenrir community.";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_USER_AGENT = "unknown";

type DbDefaultAccessState = "pending" | "active" | "denied";

type DbCommunityBrandPayload = {
  id: string;
  org_id: string | null;
  slug: string;
  name: string;
  logo_url: string | null;
  mascot_url: string | null;
  background_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  headline: string;
  subheadline: string;
  invite_prefix: string;
  enabled_auth_providers: unknown;
  default_access_state: DbDefaultAccessState;
};

export type CommunitySessionPayload = {
  user_id: string;
  email: string;
  role: "platform_admin" | "community_owner" | "community_staff" | "member";
  access_status: "pending" | "active" | "paused" | "denied";
  community_slug?: string | null;
  community_org_id?: string | null;
  iat: number;
  exp: number;
};

export type CommunityBrandPayload = {
  slug: string;
  name: string;
  logo_url: string | null;
  mascot_url: string | null;
  background_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  headline: string;
  subheadline: string;
  invite_prefix: string;
  enabled_auth_providers: string[];
  default_access_state: DefaultAccessState;
  communityOrgId: string | null;
  communityId: string;
  fallbackUsed: boolean;
};

export type CommunityBrandUpdatePayload = {
  name?: string | null;
  logo_url?: string | null;
  mascot_url?: string | null;
  background_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  invite_prefix?: string | null;
  enabled_auth_providers?: unknown;
  default_access_state?: DefaultAccessState | null;
};

export type CommunityBrandOwnershipRequest = {
  slug: string;
  reason: "internal_override" | "allowlisted_owner" | "owner";
};

export type CommunityAuthPermission = {
  allowed: true;
  reason: CommunityBrandOwnershipRequest["reason"];
};

export const communitySessionCookie = "fenrir_community_session";

export function communityAuthConfigured(env: CommunityAuthEnv) {
  return Boolean(env.NEON_DATABASE_URL?.trim() && env.FENRIR_COMMUNITY_AUTH_SECRET?.trim());
}

export async function communityBrandConfigured(env: CommunityAuthEnv) {
  if (!communityAuthConfigured(env)) return false;
  try {
    const sql = await communitySql(env);
    const [row] = await sql`
      select to_regclass('public.fenrir_gate_communities') as exists
    `;
    return Boolean((row as { exists: string | null } | undefined)?.exists);
  } catch {
    return false;
  }
}

export function communityAuthNotConfigured(env: CommunityAuthEnv = {}) {
  const missing = [] as string[];
  if (!env?.NEON_DATABASE_URL?.trim()) missing.push("NEON_DATABASE_URL");
  if (!env?.FENRIR_COMMUNITY_AUTH_SECRET?.trim()) missing.push("FENRIR_COMMUNITY_AUTH_SECRET");

  return noStoreJson({
    ok: false,
    error: "community_auth_not_configured",
    configured: false,
    detail: {
      message: "Fenrir Community Gate auth uses a separate Neon database. Set NEON_DATABASE_URL and FENRIR_COMMUNITY_AUTH_SECRET, then apply docs/neon-community-auth-schema.sql.",
      missing
    }
  }, { status: 503 });
}

export function communityAuthBrandAdminMode(env: CommunityAuthEnv): CommunityAuthMode {
  const raw = (env.FENRIR_BRAND_ADMIN_MODE ?? "internal_only").trim().toLowerCase();
  if (raw === "allowlisted_owners") return "allowlisted_owners";
  if (raw === "owner_self_service") return "owner_self_service";
  return "internal_only";
}

export async function communitySql(env: CommunityAuthEnv) {
  if (!env.NEON_DATABASE_URL?.trim()) throw new Error("missing_env:NEON_DATABASE_URL");
  const { neon } = await import("@neondatabase/serverless");
  return neon(env.NEON_DATABASE_URL.trim());
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

export async function signCommunitySession(payload: CommunitySessionPayload, env: CommunityAuthEnv) {
  const secret = requireSecret(env.FENRIR_COMMUNITY_AUTH_SECRET, "FENRIR_COMMUNITY_AUTH_SECRET");
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(secret, encoded);
  return `${encoded}.${signature}`;
}

export async function readCommunitySession(request: Request, env: CommunityAuthEnv) {
  const token = readCookie(request, communitySessionCookie);
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmac(requireSecret(env.FENRIR_COMMUNITY_AUTH_SECRET, "FENRIR_COMMUNITY_AUTH_SECRET"), encoded);
  if (!timingSafeEqual(signature, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
  } catch {
    return null;
  }

  if (!isCommunitySessionPayload(payload)) return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function communitySessionSetCookie(token: string) {
  return cookieHeader(communitySessionCookie, token, SESSION_TTL_SECONDS);
}

export function communitySessionClearCookie() {
  return clearCookieHeader(communitySessionCookie);
}

export function createCommunitySessionPayload(input: {
  userId: string;
  email: string;
  role?: CommunitySessionPayload["role"];
  accessStatus?: CommunitySessionPayload["access_status"];
  communitySlug?: string | null;
  communityOrgId?: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    user_id: input.userId,
    email: input.email,
    role: input.role ?? "member",
    access_status: input.accessStatus ?? "pending",
    community_slug: input.communitySlug ?? null,
    community_org_id: input.communityOrgId ?? null,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
}

export function normalizeCommunitySlug(value: unknown) {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!COMMUNITY_SLUG_RE.test(slug)) return null;
  return slug;
}

export function normalizeCommunitySlugOrThrow(value: unknown) {
  const slug = normalizeCommunitySlug(value);
  if (!slug) {
    throw new Error("invalid_community_slug");
  }
  return slug;
}

export function communityNameFromSlug(slug: string) {
  const spaced = slug
    .split("-")
    .filter(Boolean)
    .map((piece) => piece[0]?.toUpperCase() + piece.slice(1))
    .join(" ");
  return spaced || COMMUNITY_NAME;
}

export function siteOrigin(request: Request, env: CommunityAuthEnv) {
  const configured = env.PUBLIC_SITE_URL?.trim();
  const raw = configured
    ? configured.replace(/\/$/, "")
    : (() => {
        const url = new URL(request.url);
        return `${url.protocol}//${url.host}`;
      })();
  try {
    const url = new URL(raw);
    if (url.hostname === "myfenrir.com") {
      url.hostname = "www.myfenrir.com";
      return url.origin;
    }
    return url.origin;
  } catch {
    return raw;
  }
}

export function defaultBrandForSlug(slug: string) {
  const name = communityNameFromSlug(slug);
  return {
    slug,
    name,
    logo_url: null as string | null,
    mascot_url: null as string | null,
    background_url: null as string | null,
    primary_color: DEFAULT_FALLBACK_BRAND_PRIMARY_COLOR,
    secondary_color: DEFAULT_FALLBACK_BRAND_SECONDARY_COLOR,
    accent_color: DEFAULT_FALLBACK_BRAND_ACCENT_COLOR,
    headline: `Join ${name}`,
    subheadline: DEFAULT_FALLBACK_BRAND_SUBHEADLINE,
    invite_prefix: slug,
    enabled_auth_providers: [...DEFAULT_AUTH_PROVIDERS],
    default_access_state: "provisional" as DefaultAccessState,
    communityId: "",
    communityOrgId: null as string | null
  };
}

export async function ensureCommunityBrandPayload(env: CommunityAuthEnv, rawSlug: string): Promise<CommunityBrandPayload> {
  const slug = normalizeCommunitySlugOrThrow(rawSlug);
  const sql = await communitySql(env);
  const defaults = defaultBrandForSlug(slug);

  const [existing] = await sql`
    select
      c.id,
      c.org_id,
      c.slug,
      c.name,
      c.logo_url,
      c.mascot_url,
      c.background_url,
      c.primary_color,
      c.secondary_color,
      c.accent_color,
      c.headline,
      c.subheadline,
      c.invite_prefix,
      c.enabled_auth_providers,
      c.default_access_state
    from fenrir_gate_communities c
    where c.slug = ${slug}
    limit 1
  `;

  if (existing) {
    const sanitized = sanitizeBrandRow(existing as DbCommunityBrandPayload);
    return {
      ...sanitized,
      fallbackUsed: false
    };
  }

  const [fallbackOrg] = await sql`
    select
      id,
      name
    from fenrir_community_orgs
    where slug = ${slug}
      or lower(name) = ${slug}
    limit 1
  `;

  const fallbackOrgName = typeof fallbackOrg?.name === "string" && fallbackOrg.name.trim() ? fallbackOrg.name.trim() : defaults.name;
  let organizationId = typeof fallbackOrg?.id === "string" && fallbackOrg.id.trim() ? fallbackOrg.id : null;

  if (!organizationId) {
    const [createdOrg] = await sql`
      insert into fenrir_community_orgs (slug, name)
      values (${slug}, ${fallbackOrgName})
      on conflict (slug) do update
        set name = coalesce(fenrir_community_orgs.name, excluded.name),
            updated_at = now()
      returning id
    `;
    if (createdOrg?.id) organizationId = createdOrg.id;
  }

  const [brand] = await sql`
    insert into fenrir_gate_communities (
      org_id,
      slug,
      name,
      logo_url,
      mascot_url,
      background_url,
      primary_color,
      secondary_color,
      accent_color,
      headline,
      subheadline,
      invite_prefix,
      enabled_auth_providers,
      default_access_state
    ) values (
      ${organizationId},
      ${defaults.slug},
      ${fallbackOrgName},
      ${defaults.logo_url},
      ${defaults.mascot_url},
      ${defaults.background_url},
      ${defaults.primary_color},
      ${defaults.secondary_color},
      ${defaults.accent_color},
      ${defaults.headline},
      ${defaults.subheadline},
      ${defaults.invite_prefix},
      ${enabledAuthProvidersToDb(defaults.enabled_auth_providers)},
      ${uiToDbDefaultAccessState(defaults.default_access_state)}
    )
    on conflict (slug) do update
      set name = excluded.name,
          org_id = coalesce(fenrir_gate_communities.org_id, excluded.org_id),
          updated_at = now()
    returning
      id,
      org_id,
      slug,
      name,
      logo_url,
      mascot_url,
      background_url,
      primary_color,
      secondary_color,
      accent_color,
      headline,
      subheadline,
      invite_prefix,
      enabled_auth_providers,
      default_access_state
  `;

  const fallback = sanitizeBrandRow((brand ?? existing ?? {}) as DbCommunityBrandPayload);
  return {
    ...fallback,
    communityId: brand?.id ? String(brand.id) : fallback.communityId,
    communityOrgId: organizationId ?? null,
    fallbackUsed: true
  };
}

export function validateCommunityBrandUpdate(raw: CommunityBrandUpdatePayload) {
  const errors: string[] = [];
  const next = {
    name: raw.name === undefined ? undefined : normalizeStringOrNull(raw.name),
    logo_url: raw.logo_url === undefined ? undefined : normalizeStringOrNull(raw.logo_url),
    mascot_url: raw.mascot_url === undefined ? undefined : normalizeStringOrNull(raw.mascot_url),
    background_url: raw.background_url === undefined ? undefined : normalizeStringOrNull(raw.background_url),
    primary_color: raw.primary_color === undefined ? undefined : normalizeColor(raw.primary_color),
    secondary_color: raw.secondary_color === undefined ? undefined : normalizeColor(raw.secondary_color),
    accent_color: raw.accent_color === undefined ? undefined : normalizeColor(raw.accent_color),
    headline: raw.headline === undefined ? undefined : normalizeStringOrNull(raw.headline),
    subheadline: raw.subheadline === undefined ? undefined : normalizeStringOrNull(raw.subheadline),
    invite_prefix: raw.invite_prefix === undefined ? undefined : normalizeStringOrNull(raw.invite_prefix),
    enabled_auth_providers: raw.enabled_auth_providers,
    default_access_state: raw.default_access_state === undefined ? undefined : normalizeDefaultAccessState(raw.default_access_state)
  };

  if (raw.name !== undefined && !next.name) errors.push("name_invalid");
  if (raw.headline !== undefined && !next.headline) errors.push("headline_invalid");
  if (raw.subheadline !== undefined && !next.subheadline) errors.push("subheadline_invalid");
  if (raw.invite_prefix !== undefined && !next.invite_prefix) errors.push("invite_prefix_invalid");
  const hasDefaultAccessState = raw.default_access_state !== undefined;
  if (hasDefaultAccessState && next.default_access_state === "provisional" && typeof raw.default_access_state === "string" && raw.default_access_state.toLowerCase() !== "provisional") {
    errors.push("default_access_state_invalid");
  }
  if (raw.enabled_auth_providers !== undefined) {
    const providers = parseEnabledAuthProviders(raw.enabled_auth_providers);
    if (!providers.length) errors.push("enabled_auth_providers_invalid");
  }

  return { errors, next };
}

export function assertBrandPayload(raw: unknown): CommunityBrandUpdatePayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const body = raw as Record<string, unknown>;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  return {
    name: !has("name") ? undefined : body.name == null ? null : typeof body.name === "string" ? body.name : null,
    logo_url: !has("logo_url") ? undefined : body.logo_url == null ? null : typeof body.logo_url === "string" ? body.logo_url : undefined,
    mascot_url: !has("mascot_url") ? undefined : body.mascot_url == null ? null : typeof body.mascot_url === "string" ? body.mascot_url : undefined,
    background_url: !has("background_url") ? undefined : body.background_url == null ? null : typeof body.background_url === "string" ? body.background_url : undefined,
    primary_color: !has("primary_color") ? undefined : body.primary_color == null ? null : typeof body.primary_color === "string" ? body.primary_color : undefined,
    secondary_color: !has("secondary_color") ? undefined : body.secondary_color == null ? null : typeof body.secondary_color === "string" ? body.secondary_color : undefined,
    accent_color: !has("accent_color") ? undefined : body.accent_color == null ? null : typeof body.accent_color === "string" ? body.accent_color : undefined,
    headline: !has("headline") ? undefined : body.headline == null ? null : typeof body.headline === "string" ? body.headline : undefined,
    subheadline: !has("subheadline") ? undefined : body.subheadline == null ? null : typeof body.subheadline === "string" ? body.subheadline : undefined,
    invite_prefix: !has("invite_prefix") ? undefined : body.invite_prefix == null ? null : typeof body.invite_prefix === "string" ? body.invite_prefix : undefined,
    enabled_auth_providers: has("enabled_auth_providers") ? body.enabled_auth_providers : undefined,
    default_access_state: has("default_access_state") && typeof body.default_access_state === "string" ? normalizeDefaultAccessState(body.default_access_state) : undefined
  };
}

export async function upsertCommunityBrand(env: CommunityAuthEnv, slug: string, payload: CommunityBrandUpdatePayload): Promise<CommunityBrandPayload> {
  const normalizedSlug = normalizeCommunitySlugOrThrow(slug);
  const sql = await communitySql(env);
  const { errors, next } = validateCommunityBrandUpdate(payload);
  if (errors.length) {
    throw new Error("invalid_brand_payload");
  }

  const existing = await ensureCommunityBrandPayload(env, normalizedSlug);

  const final = {
    name: next.name ?? existing.name,
    logo_url: next.logo_url === undefined ? existing.logo_url : next.logo_url,
    mascot_url: next.mascot_url === undefined ? existing.mascot_url : next.mascot_url,
    background_url: next.background_url === undefined ? existing.background_url : next.background_url,
    primary_color: next.primary_color === undefined ? existing.primary_color : next.primary_color,
    secondary_color: next.secondary_color === undefined ? existing.secondary_color : next.secondary_color,
    accent_color: next.accent_color === undefined ? existing.accent_color : next.accent_color,
    headline: next.headline === undefined ? existing.headline : next.headline,
    subheadline: next.subheadline === undefined ? existing.subheadline : next.subheadline,
    invite_prefix: next.invite_prefix === undefined ? existing.invite_prefix : next.invite_prefix,
    enabled_auth_providers: next.enabled_auth_providers === undefined
      ? existing.enabled_auth_providers
      : parseEnabledAuthProviders(next.enabled_auth_providers),
    default_access_state: next.default_access_state || existing.default_access_state
  };

  const [row] = await sql`
    update fenrir_gate_communities
    set
      name = ${final.name},
      logo_url = ${final.logo_url},
      mascot_url = ${final.mascot_url},
      background_url = ${final.background_url},
      primary_color = ${final.primary_color},
      secondary_color = ${final.secondary_color},
      accent_color = ${final.accent_color},
      headline = ${final.headline},
      subheadline = ${final.subheadline},
      invite_prefix = ${final.invite_prefix},
      enabled_auth_providers = ${enabledAuthProvidersToDb(final.enabled_auth_providers)},
      default_access_state = ${uiToDbDefaultAccessState(final.default_access_state)},
      updated_at = now()
    where slug = ${normalizedSlug}
    returning
      id,
      org_id,
      slug,
      name,
      logo_url,
      mascot_url,
      background_url,
      primary_color,
      secondary_color,
      accent_color,
      headline,
      subheadline,
      invite_prefix,
      enabled_auth_providers,
      default_access_state
  `;

  if (!row) throw new Error("community_brand_not_found");
  return {
    ...sanitizeBrandRow(row as DbCommunityBrandPayload),
    communityId: String((row as DbCommunityBrandPayload).id),
    communityOrgId: typeof row.org_id === "string" && row.org_id?.trim() ? row.org_id : null,
    fallbackUsed: false
  };
}

export async function ensureCommunityMembershipForEmail(sql: Awaited<ReturnType<typeof communitySql>>, email: string, orgId: string | null) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !orgId) {
    throw new Error("community_org_required");
  }

  const [user] = await sql`
    insert into fenrir_community_users (email, display_name, role, access_status)
    values (${normalizedEmail}, ${normalizedEmail.split("@")[0]}, 'member', 'pending')
    on conflict (email) do update
      set display_name = coalesce(fenrir_community_users.display_name, excluded.display_name),
          updated_at = now()
    returning id, email, role, access_status
  `;
  if (!user) throw new Error("community_user_not_created");

  const [membership] = await sql`
    insert into fenrir_community_memberships (user_id, org_id, role, status)
    values (${user.id}, ${orgId}, 'member', 'pending')
    on conflict (user_id, org_id) do update
      set
        status = excluded.status,
        role = excluded.role,
        updated_at = now()
    returning id, role, status
  `;
  if (!membership) throw new Error("community_membership_not_created");

  return {
    user,
    membership
  };
}

export async function getCommunityMembershipForUser(sql: Awaited<ReturnType<typeof communitySql>>, userId: string, orgId: string | null) {
  if (!userId || !orgId) return null;
  const [membership] = await sql`
    select role, status
    from fenrir_community_memberships
    where user_id = ${userId} and org_id = ${orgId}
    limit 1
  `;
  return membership ?? null;
}

export async function createCommunitySessionRecord(
  env: CommunityAuthEnv,
  options: {
    userId: string;
    sessionHash: string;
    userAgent: string | null;
    ipHint: string | null;
    expiresAt: Date;
  }
) {
  const sql = await communitySql(env);
  const [row] = await sql`
    insert into fenrir_community_sessions (user_id, session_hash, user_agent, ip_hint, expires_at)
    values (${options.userId}, ${options.sessionHash}, ${options.userAgent}, ${options.ipHint}, ${options.expiresAt})
    returning id
  `;
  return row;
}

export async function verifyCommunityBrandWriteAuthorized(
  session: SessionPayload | null,
  env: CommunityAuthEnv,
  slug: string
): Promise<CommunityAuthPermission> {
  const normalizedSlug = normalizeCommunitySlugOrThrow(slug);
  if (!session?.email) {
    throw new Error("authentication_required");
  }

  const userEmail = session.email.toLowerCase();
  if (isEmailAdminOverride(env, userEmail)) {
    return { allowed: true, reason: "internal_override" };
  }

  const mode = communityAuthBrandAdminMode(env);
  if (mode === "internal_only") {
    throw new Error("forbidden");
  }

  if (isEmailAllowlisted(env, userEmail, normalizedSlug)) {
    return { allowed: true, reason: "allowlisted_owner" };
  }

  if (mode === "allowlisted_owners") {
    throw new Error("forbidden");
  }

  const sql = await communitySql(env);
  const [brand] = await sql`
    select org_id from fenrir_gate_communities where slug = ${normalizedSlug} limit 1
  `;
  if (!brand?.org_id) {
    throw new Error("forbidden");
  }

  const orgId = String(brand.org_id);
  const [membership] = await sql`
    select cm.id
    from fenrir_community_memberships cm
    join fenrir_community_users cu on cu.id = cm.user_id
    where cm.org_id = ${orgId}
      and lower(cu.email) = ${userEmail}
      and cm.role = 'community_owner'
      and cm.status = 'active'
    limit 1
  `;

  if (!membership?.id) {
    throw new Error("forbidden");
  }

  return { allowed: true, reason: "owner" };
}

export function resolveCommunityAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "community_auth_error";
  if (message === "invalid_community_slug") {
    return noStoreJson({ ok: false, error: "invalid_community_slug" }, { status: 400 });
  }
  if (message === "invalid_brand_payload") {
    return noStoreJson({ ok: false, error: "invalid_brand_payload" }, { status: 400 });
  }
  if (message === "authentication_required") {
    return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (message === "community_org_required") {
    return noStoreJson({ ok: false, error: "community_org_required" }, { status: 400 });
  }
  if (message === "forbidden") {
    return noStoreJson({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (message.startsWith("missing_env:")) {
    return communityAuthNotConfigured();
  }
  return noStoreJson({ ok: false, error: message }, { status: 400 });
}

export function requestClientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function requestUserAgent(request: Request) {
  return request.headers.get("user-agent") || DEFAULT_USER_AGENT;
}

function sanitizeBrandRow(row: DbCommunityBrandPayload): CommunityBrandPayload {
  const payload = {
    slug: String(row.slug || ""),
    name: normalizeStringOrNull(row.name) || COMMUNITY_NAME,
    logo_url: normalizeStringOrNull(row.logo_url),
    mascot_url: normalizeStringOrNull(row.mascot_url),
    background_url: normalizeStringOrNull(row.background_url),
    primary_color: normalizeColor(row.primary_color) || DEFAULT_FALLBACK_BRAND_PRIMARY_COLOR,
    secondary_color: normalizeColor(row.secondary_color) || DEFAULT_FALLBACK_BRAND_SECONDARY_COLOR,
    accent_color: normalizeColor(row.accent_color) || DEFAULT_FALLBACK_BRAND_ACCENT_COLOR,
    headline: normalizeStringOrNull(row.headline) || DEFAULT_FALLBACK_BRAND_HEADLINE,
    subheadline: normalizeStringOrNull(row.subheadline) || DEFAULT_FALLBACK_BRAND_SUBHEADLINE,
    invite_prefix: normalizeStringOrNull(row.invite_prefix) || normalizeStringOrNull(row.slug) || "",
    enabled_auth_providers: parseEnabledAuthProviders(row.enabled_auth_providers),
    default_access_state: dbToUiDefaultAccessState(row.default_access_state),
    communityId: String(row.id ?? ""),
    communityOrgId: typeof row.org_id === "string" && row.org_id.trim() ? row.org_id : null,
    fallbackUsed: false
  };

  return {
    ...payload,
    communityId: payload.communityId || String(row.id || "")
  };
}

function parseAdminAllowlist(value: string | undefined): { global: Set<string>; slugMap: Map<string, Set<string>> } {
  const raw = value?.trim();
  if (!raw) return { global: new Set(), slugMap: new Map() };

  const global = new Set<string>();
  const slugMap = new Map<string, Set<string>>();
  const push = (entries: string[] | undefined, slug?: string) => {
    if (!entries) return;
    for (const entry of entries.map((row) => row.trim().toLowerCase()).filter(Boolean)) {
      if (!slug) {
        global.add(entry);
      } else {
        const current = slugMap.get(slug) ?? new Set<string>();
        current.add(entry);
        slugMap.set(slug, current);
      }
    }
  };

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      push((parsed as unknown[]).filter((entry) => typeof entry === "string") as string[]);
      return { global, slugMap };
    }

    if (parsed && typeof parsed === "object") {
      for (const [key, rawEntry] of Object.entries(parsed)) {
        if (key === "*" || key === "all") {
          push(Array.isArray(rawEntry)
            ? rawEntry.filter((entry) => typeof entry === "string") as string[]
            : typeof rawEntry === "string"
              ? [rawEntry]
              : []
          );
          continue;
        }

        if (Array.isArray(rawEntry)) {
          push(rawEntry.filter((entry) => typeof entry === "string") as string[], key.toLowerCase());
        } else if (typeof rawEntry === "string") {
          push([rawEntry], key.toLowerCase());
        }
      }
      return { global, slugMap };
    }
  } catch {
    push(raw.split(","));
  }

  push(raw.split(","));
  return { global, slugMap };
}

function isEmailAdminOverride(env: CommunityAuthEnv, email: string) {
  const allowlist = parseAdminAllowlist(env.SUPABASE_ADMIN_EMAILS);
  return allowlist.global.has(email.toLowerCase());
}

function isEmailAllowlisted(env: CommunityAuthEnv, email: string, slug: string) {
  const allowlist = parseAdminAllowlist(env.FENRIR_BRAND_ADMIN_ALLOWLIST);
  if (allowlist.global.has(email)) return true;
  return !!allowlist.slugMap.get(slug)?.has(email);
}

/** Normalize UI/API input into a Postgres-compatible text[] value for Neon tagged templates. */
function enabledAuthProvidersToDb(raw: unknown): string[] {
  return parseEnabledAuthProviders(raw);
}

function parseEnabledAuthProviders(raw: unknown): string[] {
  const entries = normalizeEnabledAuthProvidersInput(raw);
  const providers = entries
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => SUPPORTED_AUTH_PROVIDERS.has(entry));

  return providers.length ? providers : [...DEFAULT_AUTH_PROVIDERS];
}

function normalizeEnabledAuthProvidersInput(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (item == null) return [];
      return [String(item)];
    });
  }

  if (typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return normalizeEnabledAuthProvidersInput(parsed);
    } catch {
      // Fall through to comma-separated parsing.
    }
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((entry) => entry.trim().replace(/^"|"$/g, ""));
  }

  return trimmed.split(",");
}

function normalizeStringOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeColor(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") || /^rgb\(/i.test(trimmed) || /^hsl\(/i.test(trimmed) ? trimmed : null;
}

function normalizeDefaultAccessState(value: unknown): DefaultAccessState {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "open") return "open";
  if (normalized === "invite_only") return "invite_only";
  if (normalized === "disabled") return "disabled";
  return "provisional";
}

function dbToUiDefaultAccessState(value: unknown): DefaultAccessState {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active") return "open";
  if (normalized === "denied") return "disabled";
  if (normalized === "invite_only") return "invite_only";
  return "provisional";
}

function uiToDbDefaultAccessState(value: DefaultAccessState): DbDefaultAccessState {
  if (value === "open") return "active";
  if (value === "disabled") return "denied";
  return "pending";
}

function requireSecret(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`missing_env:${name}`);
  return value.trim();
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
}

function cookieHeader(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookieHeader(name: string) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function hmac(secret: string, data: string) {
  return crypto.subtle
    .importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((key) => crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)).then((signature) => base64Url(new Uint8Array(signature))));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function isCommunitySessionPayload(value: unknown): value is CommunitySessionPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<CommunitySessionPayload>;

  return (
    typeof payload.user_id === "string" &&
    typeof payload.email === "string" &&
    typeof payload.role === "string" &&
    typeof payload.access_status === "string" &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number"
  );
}
