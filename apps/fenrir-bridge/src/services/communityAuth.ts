export type CommunityAuthProposal = {
  ok: true;
  product: "fenrir-community-gate";
  database: "neon";
  configured: boolean;
  isolatedFrom: {
    friskyClientPortal: boolean;
    friskySessionCookie: string;
    communitySessionCookie: string;
    sharedSupabaseAuth: boolean;
    sharedFriskyD1Tables: boolean;
  };
  requiredEnv: string[];
  schemaFile: string;
  tables: string[];
};

export type DefaultAccessState = "provisional" | "open" | "invite_only" | "disabled";

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

export type CommunityBrandAuthorization = {
  allowed: true;
  reason: "internal_override" | "allowlisted_owner" | "owner";
};

type CommunityBrandResponse = {
  ok: boolean;
  brand?: CommunityBrandPayload;
  authorization?: CommunityBrandAuthorization;
  error?: string;
  detail?: unknown;
};

export class CommunityBrandRequestError extends Error {
  status: number;
  error?: string;
  detail?: unknown;

  constructor(status: number, error?: string, detail?: unknown) {
    super(error || `community_brand_request_failed_${status}`);
    this.name = "CommunityBrandRequestError";
    this.status = status;
    this.error = error;
    this.detail = detail;
  }
}

export async function getCommunityAuthProposal(): Promise<CommunityAuthProposal | null> {
  try {
    const response = await fetch("/api/community-auth/proposal", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const body = await response.json().catch(() => null) as CommunityAuthProposal | null;
    if (!response.ok || !body?.ok) return null;
    return body;
  } catch {
    return null;
  }
}

export async function getCommunityBrand(slug: string): Promise<CommunityBrandPayload | null> {
  try {
    const response = await fetch(`/api/community-auth/brand/${encodeURIComponent(slug)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const body = await response.json().catch(() => null) as CommunityBrandResponse | null;
    if (!response.ok || !body?.ok || !body.brand) return null;
    return body.brand;
  } catch {
    return null;
  }
}

export async function getCommunityAuthBrandForAdmin(slug: string): Promise<{
  brand: CommunityBrandPayload;
  authorization: CommunityBrandAuthorization;
}> {
  try {
    const response = await fetch(`/api/community-auth/admin/brands/${encodeURIComponent(slug)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const body = await response.json().catch(() => null) as CommunityBrandResponse | null;
    if (!response.ok || !body?.ok || !body.brand || !body.authorization) {
      throw new CommunityBrandRequestError(response.status, body?.error, body?.detail);
    }
    return { brand: body.brand, authorization: body.authorization };
  } catch (error) {
    if (error instanceof CommunityBrandRequestError) throw error;
    throw new CommunityBrandRequestError(0, "network_failure");
  }
}

export async function saveCommunityBrand(
  slug: string,
  payload: CommunityBrandUpdatePayload
): Promise<{ brand: CommunityBrandPayload; authorization: CommunityBrandAuthorization } | null> {
  try {
    const response = await fetch(`/api/community-auth/admin/brands/${encodeURIComponent(slug)}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => null) as CommunityBrandResponse | null;
    if (!response.ok || !body?.ok || !body.brand || !body.authorization) return null;
    return { brand: body.brand, authorization: body.authorization };
  } catch {
    return null;
  }
}
