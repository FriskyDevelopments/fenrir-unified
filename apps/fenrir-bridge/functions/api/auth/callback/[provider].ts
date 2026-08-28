import { noStoreJson } from "../../../_lib/responses";

export async function onRequestGet() {
  return noStoreJson(
    {
      ok: false,
      error: "direct_oauth_retired",
      detail: "Fenrir login is the Better Auth Worker at /auth/{provider}/callback on myfenrir.com."
    },
    { status: 410 }
  );
}

export const onRequestPost = onRequestGet;
