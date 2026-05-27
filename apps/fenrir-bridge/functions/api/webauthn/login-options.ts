import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { createChallengeCookie } from "../../_lib/webauthn-challenge";
import { webauthnRpConfig } from "../../_lib/webauthn-config";

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  if (!context.env.DB) return dbNotConfiguredResponse();

  try {
    const cfg = webauthnRpConfig(context.request, context.env);
    const options = await generateAuthenticationOptions({
      rpID: cfg.rpID,
      userVerification: "preferred"
    });
    const headers = new Headers();
    headers.append("Set-Cookie", await createChallengeCookie(context.env, options.challenge, "authentication"));
    return Response.json({ ok: true, optionsJSON: options }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webauthn_login_options_failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
