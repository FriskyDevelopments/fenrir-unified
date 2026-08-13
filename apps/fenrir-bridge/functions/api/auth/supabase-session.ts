import { sessionSetCookie, signSession } from "../../_lib/auth";
import { noStoreJson } from "../../_lib/responses";
import { createSessionFromSupabaseToken } from "../../_lib/supabase";
import { cookieDomain } from "../../_lib/billing-env";
import { hasHumanVerification, verificationClearCookie } from "../../_lib/verification";

export async function onRequestPost(context: any) {
  if (!await hasHumanVerification(context.request, context.env)) {
    return noStoreJson({ ok: false, error: "human_verification_required" }, { status: 403 });
  }

  const body = await context.request.json().catch(() => null) as { accessToken?: string } | null;
  if (!body?.accessToken) {
    return noStoreJson({ ok: false, error: "missing_supabase_access_token" }, { status: 400 });
  }

  try {
    const payload = await createSessionFromSupabaseToken(body.accessToken, context.env);
    const session = await signSession(payload, context.env);
    const headers = new Headers();
    headers.append("Set-Cookie", sessionSetCookie(session));
    headers.append("Set-Cookie", verificationClearCookie(cookieDomain(context.request, context.env)));
    return noStoreJson({ ok: true }, { headers });
  } catch (error) {
    return noStoreJson({ ok: false, error: error instanceof Error ? error.message : "supabase_session_failed" }, { status: 401 });
  }
}
