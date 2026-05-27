import { noStoreJson } from "../../../_lib/responses";

function disabledResponse() {
  return noStoreJson(
    {
      ok: false,
      error: "direct_oauth_disabled",
      detail: "Register OAuth callbacks in Supabase and use the SPA callback route instead of /api/auth/callback/:provider."
    },
    { status: 410 }
  );
}

export function onRequestGet() {
  return disabledResponse();
}

export function onRequestPost() {
  return disabledResponse();
}
