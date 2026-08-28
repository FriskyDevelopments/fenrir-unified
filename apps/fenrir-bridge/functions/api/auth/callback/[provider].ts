import { noStoreJson } from "../../../_lib/responses";

/**
 * Reports that direct OAuth callbacks are retired and directs login through the Better Auth Worker.
 *
 * @returns A cache-disabled response with HTTP status 410 and details for the replacement callback.
 */
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
