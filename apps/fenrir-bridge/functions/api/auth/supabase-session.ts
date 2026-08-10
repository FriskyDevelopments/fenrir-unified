import { sessionSetCookie, signSession } from "../../_lib/auth";
import { noStoreJson } from "../../_lib/responses";
import { createSessionFromSupabaseToken } from "../../_lib/supabase";

export async function onRequestPost(context: any) {
  const body = await context.request.json().catch(() => null) as { accessToken?: string } | null;
  if (!body?.accessToken) {
    return noStoreJson({ ok: false, error: "missing_supabase_access_token" }, { status: 400 });
  }

  try {
    const payload = await createSessionFromSupabaseToken(body.accessToken, context.env);
    const token = await signSession(payload, context.env);
    return noStoreJson(
      { ok: true },
      {
        headers: {
          "Set-Cookie": sessionSetCookie(token)
        }
      }
    );
  } catch (error) {
    return noStoreJson({ ok: false, error: error instanceof Error ? error.message : "supabase_session_failed" }, { status: 401 });
  }
}
