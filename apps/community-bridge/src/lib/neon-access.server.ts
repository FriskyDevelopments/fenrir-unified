/**
 * Neon-based access: the source of truth for who may enter a community is the
 * Neon database behind myfenrir.com (fenrir_community_* tables). This module
 * talks to the bridge's internal allowlist contract —
 * POST /api/internal/community/allowlist-check, documented in
 * apps/fenrir-bridge/docs/NEON_GATEKEEPER_INTERNAL_CONTRACT.md — the same
 * endpoint the fenrir-gatekeeper Worker uses.
 *
 * Server-side only. Required env:
 *   FENRIR_GATEKEEPER_INTERNAL_SECRET  — shared bearer for the internal API
 *   FENRIR_INTERNAL_ALLOWLIST_URL      — optional endpoint override
 */

const DEFAULT_ENDPOINT = "https://myfenrir.com/api/internal/community/allowlist-check";

export interface NeonAllowlistResult {
  /** False when the deployment has no internal secret configured. */
  configured: boolean;
  /** True/false from Neon; null when unconfigured or the check failed. */
  allowed: boolean | null;
}

export async function checkNeonAllowlist(
  communitySlug: string,
  email: string,
): Promise<NeonAllowlistResult> {
  const secret = process.env["FENRIR_GATEKEEPER_INTERNAL_SECRET"]?.trim();
  if (!secret) return { configured: false, allowed: null };

  const endpoint = process.env["FENRIR_INTERNAL_ALLOWLIST_URL"]?.trim() || DEFAULT_ENDPOINT;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ community_slug: communitySlug, email }),
    });
    if (!res.ok) throw new Error(`allowlist-check returned ${res.status}`);
    const body = (await res.json()) as { ok?: boolean; allowed?: boolean };
    if (!body.ok) throw new Error("allowlist-check returned ok=false");
    return { configured: true, allowed: Boolean(body.allowed) };
  } catch (err) {
    console.error("[neon-access] allowlist check failed:", err);
    return { configured: true, allowed: null };
  }
}
