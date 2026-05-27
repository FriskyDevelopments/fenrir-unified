import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { clearChallengeCookieHeader, readChallengePayload } from "../../_lib/webauthn-challenge";
import { webauthnRpConfig } from "../../_lib/webauthn-config";
import { insertCredential } from "../../_lib/webauthn-repo";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return Response.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!context.env.DB) return dbNotConfiguredResponse();

  const challengePayload = await readChallengePayload(context.request, context.env);
  if (!challengePayload || challengePayload.flow !== "registration") {
    return Response.json({ ok: false, error: "webauthn_challenge_invalid" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const cfg = webauthnRpConfig(context.request, context.env);
    const verification = await verifyRegistrationResponse({
      response: body as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      requireUserVerification: false
    });

    if (!verification.verified) {
      const headers = new Headers({ "Set-Cookie": clearChallengeCookieHeader() });
      return Response.json({ ok: false, error: "webauthn_registration_failed" }, { status: 400, headers });
    }

    const { credential } = verification.registrationInfo;
    await insertCredential(context.env.DB, {
      credentialId: credential.id,
      friskyUserId: session.frisky_user_id,
      friskyOrgId: session.frisky_org_id,
      email: session.email,
      displayName: session.name,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports
    });

    const headers = new Headers({ "Set-Cookie": clearChallengeCookieHeader() });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const headers = new Headers({ "Set-Cookie": clearChallengeCookieHeader() });
    const message = error instanceof Error ? error.message : "webauthn_register_verify_failed";
    return Response.json({ ok: false, error: message }, { status: 400, headers });
  }
}
