import { communityAuthConfigured, communityBrandConfigured, communitySessionCookie } from "../../_lib/community-auth";
import { communityGateAuthConfigured } from "../../_lib/community-gate";
import { noStoreJson } from "../../_lib/responses";

export async function onRequestGet(context: any) {
  const brandConfigured = await communityBrandConfigured(context.env);
  return noStoreJson({
    ok: true,
    product: "fenrir-community-gate",
    auth: "firebase",
    database: "neon",
    configured: communityGateAuthConfigured(context.env),
    legacyMagicLinkConfigured: communityAuthConfigured(context.env),
    brandConfigured,
    isolatedFrom: {
      friskyClientPortal: true,
      friskySessionCookie: "fenrir_session",
      communitySessionCookie,
      sharedSupabaseAuth: false,
      sharedFriskyD1Tables: false
    },
    requiredEnv: [
      "FIREBASE_PROJECT_ID",
      "NEON_DATABASE_URL"
    ],
    optionalEnv: [
      "FENRIR_COMMUNITY_AUTH_SECRET",
      "FENRIR_COMMUNITY_AUTH_DEV_RETURN_LINK",
      "PUBLIC_SITE_URL"
    ],
    schemaFile: "docs/neon-community-gate-schema.sql",
    tables: [
      "profiles",
      "communities",
      "community_memberships",
      "invite_codes",
      "verification_sessions",
      "audit_logs"
    ]
  });
}
