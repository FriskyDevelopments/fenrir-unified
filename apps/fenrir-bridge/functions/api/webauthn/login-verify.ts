import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createSessionPayload, sessionSetCookie, signSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { clearChallengeCookieHeader, readChallengePayload } from "../../_lib/webauthn-challenge";
import { webauthnRpConfig } from "../../_lib/webauthn-config";
import { getCredentialById, rowToWebAuthnCredential, updateCredentialCounter } from "../../_lib/webauthn-repo";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  if (!context.env.DB) return dbNotConfiguredResponse();

  const challengePayload = await readChallengePayload(context.request, context.env);
  if (!challengePayload || challengePayload.flow !== "authentication") {
    return Response.json({ ok: false, error: "webauthn_challenge_invalid" }, { status: 400 });
  }

  let body: { id: string } & Record<string, unknown>;
  try {
    body = (await context.request.json()) as { id: string } & Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const row = await getCredentialById(context.env.DB, body.id);
  if (!row) {
    const headers = new Headers({ "Set-Cookie": clearChallengeCookieHeader() });
    return Response.json({ ok: false, error: "webauthn_unknown_credential" }, { status: 400, headers });
  }

  const credential = rowToWebAuthnCredential(row);

  try {
    const cfg = webauthnRpConfig(context.request, context.env);
    const verification = await verifyAuthenticationResponse({
      response: body as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      credential,
      requireUserVerification: false
    });

    if (!verification.verified) {
      const headers = new Headers({ "Set-Cookie": clearChallengeCookieHeader() });
      return Response.json({ ok: false, error: "webauthn_authentication_failed" }, { status: 400, headers });
    }

    await updateCredentialCounter(context.env.DB, verification.authenticationInfo.credentialID, verification.authenticationInfo.newCounter);

    const sessionPayload = createSessionPayload({
      email: row.email,
      name: row.display_name,
      provider: "passkey",
      identityId: `passkey:${row.frisky_user_id}`,
      friskyUserId: row.frisky_user_id,
      friskyOrgId: row.frisky_org_id
    });
    const token = await signSession(sessionPayload, context.env);
    const headers = new Headers();
    headers.append("Set-Cookie", sessionSetCookie(token));
    headers.append("Set-Cookie", clearChallengeCookieHeader());
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const headers = new Headers({ "Set-Cookie": clearChallengeCookieHeader() });
    const message = error instanceof Error ? error.message : "webauthn_login_verify_failed";
    return Response.json({ ok: false, error: message }, { status: 400, headers });
  }
}
