import { noStoreJson } from "./responses";
import {
  readCommunitySession,
  type CommunityAuthEnv,
  type CommunitySessionPayload
} from "./community-auth";

export type CommunityGateEnv = CommunityAuthEnv & {
  NEON_DATABASE_URL?: string;
  FENRIR_COMMUNITY_AUTH_SECRET?: string;
  FIREBASE_PROJECT_ID?: string;
};

export type CommunityGateUser = {
  authSubject: string;
  authProvider: "firebase" | "fenrir_community_session";
  email: string;
  displayName: string;
  role: CommunitySessionPayload["role"];
  accessStatus: CommunitySessionPayload["access_status"];
  communitySlug: string | null;
  communityOrgId: string | null;
};

export function communityGateConfigured(env: CommunityGateEnv) {
  return communityGateAuthConfigured(env) && communityGateDataConfigured(env);
}

export function communityGateAuthConfigured(env: CommunityGateEnv) {
  return Boolean(env.FIREBASE_PROJECT_ID?.trim() || env.FENRIR_COMMUNITY_AUTH_SECRET?.trim());
}

export function communityGateDataConfigured(env: CommunityGateEnv) {
  return Boolean(env.NEON_DATABASE_URL?.trim());
}

export function communityGateNotConfigured(env: CommunityGateEnv = {}) {
  const missing = [] as string[];
  if (!env.FIREBASE_PROJECT_ID?.trim() && !env.FENRIR_COMMUNITY_AUTH_SECRET?.trim()) missing.push("FIREBASE_PROJECT_ID");
  if (!env.NEON_DATABASE_URL?.trim()) missing.push("NEON_DATABASE_URL");

  return noStoreJson({
    ok: false,
    error: "community_gate_not_configured",
    detail: {
      message: "Community Gate member auth uses Firebase Auth. Set FIREBASE_PROJECT_ID for token verification and NEON_DATABASE_URL for the gate data plane, then apply docs/neon-community-gate-schema.sql in Neon.",
      missing
    }
  }, { status: 503 });
}

export async function communityGateSql(env: CommunityGateEnv) {
  if (!env.NEON_DATABASE_URL?.trim()) throw new Error("missing_env:NEON_DATABASE_URL");
  const { neon } = await import("@neondatabase/serverless");
  return neon(env.NEON_DATABASE_URL.trim());
}

export async function requireCommunityGateUser(request: Request, env: CommunityGateEnv): Promise<CommunityGateUser> {
  const firebaseUser = await readFirebaseBearerUser(request, env);
  if (firebaseUser) return firebaseUser;

  const session = await readCommunitySession(request, env);
  if (!session) throw new Error("missing_community_session");

  return {
    authSubject: session.user_id,
    authProvider: "fenrir_community_session",
    email: session.email.toLowerCase(),
    displayName: session.email.split("@")[0] || session.email,
    role: session.role,
    accessStatus: session.access_status,
    communitySlug: session.community_slug ?? null,
    communityOrgId: session.community_org_id ?? null
  };
}

export async function loadOrCreateProfile(env: CommunityGateEnv, user: CommunityGateUser) {
  const sql = await communityGateSql(env);
  const [profile] = await sql`
    insert into profiles (auth_provider, auth_subject, email, display_name)
    values (${user.authProvider}, ${user.authSubject}::uuid, ${user.email}, ${user.displayName})
    on conflict (auth_subject)
    do update set
      auth_provider = excluded.auth_provider,
      email = excluded.email,
      display_name = coalesce(excluded.display_name, profiles.display_name),
      updated_at = now()
    returning id, auth_subject, email, display_name, role, status
  `;
  return profile;
}

export async function assertCommunityStaff(env: CommunityGateEnv, user: CommunityGateUser, communitySlug?: string) {
  const sql = await communityGateSql(env);
  const profile = await loadOrCreateProfile(env, user);
  if (profile.role === "platform_admin") return { profile, community: null };

  if (!communitySlug) throw new Error("community_slug_required");
  const [membership] = await sql`
    select
      cm.role,
      cm.status,
      c.id as community_id,
      c.slug as community_slug
    from community_memberships cm
    join communities c on c.id = cm.community_id
    where cm.profile_id = ${profile.id}
      and c.slug = ${communitySlug}
      and cm.status = 'active'
      and cm.role in ('community_owner', 'community_staff')
    limit 1
  `;

  if (!membership) throw new Error("community_staff_required");
  return { profile, community: membership };
}

export function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function userAgent(request: Request) {
  return request.headers.get("user-agent") || null;
}

type FirebaseIdTokenPayload = {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
  iat?: number;
  email_verified?: boolean;
};

async function readFirebaseBearerUser(request: Request, env: CommunityGateEnv): Promise<CommunityGateUser | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error("missing_env:FIREBASE_PROJECT_ID");

  const payload = await verifyFirebaseIdToken(match[1], projectId);
  const uid = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!uid || !email) throw new Error("firebase_token_missing_identity");

  return {
    authSubject: stableUuidFromString(`firebase:${projectId}:${uid}`),
    authProvider: "firebase",
    email,
    displayName: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email.split("@")[0],
    role: "member",
    accessStatus: "active",
    communitySlug: null,
    communityOrgId: null
  };
}

async function verifyFirebaseIdToken(token: string, projectId: string): Promise<FirebaseIdTokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("firebase_token_invalid");

  const header = parseJwtPart(parts[0]) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("firebase_token_invalid_header");

  const payload = parseJwtPart(parts[1]) as FirebaseIdTokenPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error("firebase_token_invalid_audience");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("firebase_token_invalid_issuer");
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("firebase_token_missing_subject");
  if (!payload.exp || payload.exp <= now) throw new Error("firebase_token_expired");
  if (!payload.iat || payload.iat > now + 300) throw new Error("firebase_token_invalid_iat");

  const jwks = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", {
    headers: { accept: "application/json" }
  });
  if (!jwks.ok) throw new Error("firebase_jwks_unavailable");

  const body = await jwks.json() as { keys?: JsonWebKey[] };
  const jwk = body.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("firebase_jwk_not_found");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error("firebase_token_bad_signature");

  return payload;
}

function parseJwtPart(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function stableUuidFromString(value: string) {
  const bytes = new TextEncoder().encode(value);
  let hash = 2166136261;
  const out = new Uint8Array(16);
  for (let index = 0; index < out.length; index += 1) {
    for (const byte of bytes) {
      hash ^= byte + index;
      hash = Math.imul(hash, 16777619);
    }
    out[index] = hash & 0xff;
  }
  out[6] = (out[6] & 0x0f) | 0x40;
  out[8] = (out[8] & 0x3f) | 0x80;
  const hex = [...out].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function authErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "authentication_failed";
  if (message === "missing_community_session") {
    return noStoreJson({ ok: true, authenticated: false, product: "fenrir-community-gate" });
  }
  if (message.includes("missing_env:")) return communityGateNotConfigured();
  if (message.includes("relation") && message.includes("does not exist")) {
    return noStoreJson({
      ok: false,
      error: "community_gate_schema_missing",
      detail: "Apply docs/neon-community-auth-schema.sql and docs/neon-community-gate-schema.sql in Neon."
    }, { status: 503 });
  }
  return noStoreJson({ ok: false, error: "authentication_failed" }, { status: 401 });
}

export function parseSlug(value: unknown) {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) return "";
  return slug;
}

export function parseInviteCode(value: unknown) {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(code)) return "";
  return code;
}
