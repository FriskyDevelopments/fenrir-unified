import { clearCookieHeader, sessionCookieName } from "../../_lib/auth";

export async function onRequestPost() {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearCookieHeader(sessionCookieName())
      }
    }
  );
}
