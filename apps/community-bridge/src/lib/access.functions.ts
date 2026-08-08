import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CommunityAccessStatus {
  source: "neon";
  /** False when this deployment has no internal allowlist secret. */
  configured: boolean;
  /** True/false per Neon; null when unconfigured or the check failed. */
  allowed: boolean | null;
}

/**
 * Whether the signed-in user has an active membership in the community,
 * according to the Neon-based gatekeeper (the same allowlist the Telegram
 * bot consults). Supabase stays the identity layer; Neon decides access.
 */
export const checkMyCommunityAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ communitySlug: z.string().min(1).max(100) }).parse(data))
  .handler(async ({ context, data }): Promise<CommunityAccessStatus> => {
    const email = typeof context.claims.email === "string" ? context.claims.email : null;
    if (!email) return { source: "neon", configured: true, allowed: null };
    const { checkNeonAllowlist } = await import("@/lib/neon-access.server");
    const result = await checkNeonAllowlist(data.communitySlug, email);
    return { source: "neon", ...result };
  });
