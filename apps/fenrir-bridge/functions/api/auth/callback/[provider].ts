import { noStoreJson } from "../../../_lib/responses";
import { clearTransactionCookie } from "../../../_lib/oauth";

// Retired: the direct Google/Microsoft/Apple callback for the MyFenrir login.
//
// MyFenrir sign-in is Supabase-only: the provider redirects back to the
// Supabase project's /auth/v1/callback, and the client exchanges the resulting
// session for the Fenrir cookie via /api/auth/supabase-session. This handler
// must never mint a session again.
//
// The route stays reachable (instead of 404-ing through the API catch-all) so
// that a stale provider console still holding this redirect URI gets an
// unambiguous, greppable answer instead of a generic not-found, and so the
// stale transaction cookie from any in-flight legacy attempt is cleared.
async function retiredCallback() {
  return noStoreJson(
    {
      ok: false,
      error: "direct_oauth_retired",
      detail:
        "MyFenrir sign-in is Supabase-only. Direct per-provider OAuth was removed; sign in from /login."
    },
    {
      status: 410,
      headers: { "Set-Cookie": clearTransactionCookie() }
    }
  );
}

export const onRequestGet: PagesFunction = retiredCallback;
export const onRequestPost: PagesFunction = retiredCallback;
