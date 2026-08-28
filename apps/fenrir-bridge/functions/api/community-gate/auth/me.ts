import {
  authErrorResponse,
  communityGateAuthConfigured,
  communityGateDataConfigured,
  communityGateNotConfigured,
  loadOrCreateProfile,
  requireCommunityGateUser
} from "../../../_lib/community-gate";
import { noStoreJson } from "../../../_lib/responses";

export async function onRequestGet(context: any) {
  if (!communityGateAuthConfigured(context.env)) return communityGateNotConfigured(context.env);

  try {
    const user = await requireCommunityGateUser(context.request, context.env);
    if (!communityGateDataConfigured(context.env)) {
      return noStoreJson({
        ok: false,
        authenticated: true,
        product: "fenrir-community-gate",
        error: "community_gate_data_not_configured",
        detail: {
          message: "Community Gate accepted the member, but the Neon data plane still needs NEON_DATABASE_URL and docs/neon-community-gate-schema.sql.",
          missing: ["NEON_DATABASE_URL"]
        },
        user: {
          authSubject: user.authSubject,
          authProvider: user.authProvider,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          accessStatus: user.accessStatus
        }
      }, { status: 503 });
    }
    const profile = await loadOrCreateProfile(context.env, user);
    return noStoreJson({
      ok: true,
      authenticated: true,
      product: "fenrir-community-gate",
      user: {
        id: profile.id,
        authSubject: profile.auth_subject,
        authProvider: profile.auth_provider,
        email: profile.email,
        displayName: profile.display_name,
        role: profile.role,
        status: profile.status,
        accessStatus: user.accessStatus
      },
      communitySlug: user.communitySlug,
      communityOrgId: user.communityOrgId
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
