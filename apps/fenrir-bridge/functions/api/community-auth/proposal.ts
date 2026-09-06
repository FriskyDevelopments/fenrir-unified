import { communityAuthConfigured, communityBrandConfigured, communitySessionCookie } from "../../_lib/community-auth";
import { communityGateAuthConfigured } from "../../_lib/community-gate";
import { noStoreJson } from "../../_lib/responses";

/**
 * Reports the community gate's authentication, configuration, isolation, environment, schema, and table details.
 *
 * @returns A no-store status object for the `fenrir-community-gate` product.
 */
export async function onRequestGet(context: any) {
  const brandConfigured = await communityBrandConfigured(context.env);
  return noStoreJson({
    ok: true,
    product: "fenrir-community-gate",
    auth: "fenrir_community_session",
    legacyFirebaseBearer: true,
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
      "FENRIR_COMMUNITY_AUTH_SECRET",
      "NEON_DATABASE_URL"
    ],
    optionalEnv: [
      "FIREBASE_PROJECT_ID",
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
