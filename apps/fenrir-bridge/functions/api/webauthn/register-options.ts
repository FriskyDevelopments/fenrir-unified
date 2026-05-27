import { generateRegistrationOptions } from "@simplewebauthn/server";
import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { createChallengeCookie } from "../../_lib/webauthn-challenge";
import { webauthnRpConfig } from "../../_lib/webauthn-config";
import { listExcludeCredentials } from "../../_lib/webauthn-repo";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return Response.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!context.env.DB) return dbNotConfiguredResponse();

  try {
    const cfg = webauthnRpConfig(context.request, context.env);
    const excludeCredentials = await listExcludeCredentials(context.env.DB, session.frisky_user_id);
    const options = await generateRegistrationOptions({
      rpName: cfg.rpName,
      rpID: cfg.rpID,
      userName: session.email,
      userDisplayName: session.name,
      userID: new TextEncoder().encode(session.frisky_user_id),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred"
      },
      excludeCredentials
    });

    const headers = new Headers();
    headers.append("Set-Cookie", await createChallengeCookie(context.env, options.challenge, "registration"));
    return Response.json({ ok: true, optionsJSON: options }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webauthn_register_options_failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
