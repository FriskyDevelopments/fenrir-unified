import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  isAuthentikConfigured,
  parseCookies,
  verifyState,
  decodeOauthFlow,
  exchangeCode,
  validateIdToken,
  validateUserInfo,
  encodeSession,
  serializeCookie,
  resolveDestination,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type CommunityIdentity,
} from "@/lib/authentik.server";
import { resolveCommunityIdentityForLogin } from "@/lib/community-identity.server";
import type { ResolvedCommunityIdentity } from "@/lib/community-identity";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleCallback(request),
    },
  },
});

function redirect(location: string, setCookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function loginError(reason: string, reference?: string): Response {
  const params = new URLSearchParams({ error: reason });
  if (reference) params.set("ref", reference);
  return redirect(`/login?${params.toString()}`);
}

function safeCallbackFailure(error: unknown): "code_expired_or_reused" | "token_exchange_failed" | "token_validation_failed" | "callback_failed" {
  const message = error instanceof Error ? error.message : "";
  if (/authentik_token_exchange_failed:\s*invalid_grant/i.test(message)) return "code_expired_or_reused";
  if (message.startsWith("authentik_token_exchange_failed")) return "token_exchange_failed";
  if (/authentik_(invalid|jwks|no_signing|unsupported|missing|nonce)/.test(message)) return "token_validation_failed";
  return "callback_failed";
}

/** Always lands back on the exact Gate the visitor started from (see authentik.server). */

async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // IdP-reported failure (denied, etc.) — never render "Access confirmed".
  const idpError = url.searchParams.get("error");
  if (idpError) return loginError(`sign_in_${idpError}`);

  if (!isAuthentikConfigured()) return loginError("not_configured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return loginError("missing_code_or_state");

  const cookies = parseCookies(request.headers.get("cookie"));
  const flowRaw = cookies[OAUTH_COOKIE];
  if (!flowRaw) return loginError("missing_oauth_cookie");
  const flow = await decodeOauthFlow(flowRaw);
  if (!flow) return loginError("invalid_oauth_cookie");

  // The IdP must echo back exactly the state we issued; reject tampering and
  // any external redirect.
  if (flow.state !== state) return loginError("state_mismatch");
  const oidcState = await verifyState(state);
  if (!oidcState) return loginError("state_invalid_or_expired");
  if (oidcState.nonce !== flow.nonce) return loginError("nonce_mismatch");

  try {
    const { idToken, accessToken } = await exchangeCode(code, flow.code_verifier);
    const claims = idToken
      ? await validateIdToken(idToken, flow.nonce)
      : await validateUserInfo(accessToken!);

    // Map the validated Authentik subject onto the persistent Community
    // ownership key. Existing owners keep their existing user_id (and thus
    // their Gates, roles and account links); new members get a fresh one.
    // No Supabase session is fabricated to hide this migration.
    let resolved: ResolvedCommunityIdentity;
    try {
      resolved = await resolveCommunityIdentityForLogin({
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
      });
    } catch (error) {
      const reference = crypto.randomUUID().slice(0, 8);
      console.error(
        "authentik_identity_mapping_failed",
        reference,
        error instanceof Error ? error.message : "unknown",
      );
      return loginError("identity_mapping_failed", reference);
    }

    const identity: CommunityIdentity = {
      sub: claims.sub,
      user_id: resolved.user_id,
      email: claims.email,
      name: claims.name,
      iss: claims.iss,
      community_id: oidcState.community_id,
      brand_id: oidcState.brand_id,
      exp: claims.exp,
    };
    const session = await encodeSession(identity);

    return redirect(resolveDestination(oidcState), [
      serializeCookie(SESSION_COOKIE, session, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      }),
      serializeCookie(OAUTH_COOKIE, "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      }),
    ]);
  } catch (error) {
    // Never log the code, state, verifier or secrets — only the failure class.
    const reference = crypto.randomUUID().slice(0, 8);
    const reason = safeCallbackFailure(error);
    console.error("authentik_callback_failed", reference, reason);
    return loginError(reason, reference);
  }
}
