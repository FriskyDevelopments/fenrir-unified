import { noStoreJson } from "../../_lib/responses";

/**
 * Indicates that the Supabase authentication proxy has been retired.
 *
 * @returns A non-cacheable JSON response with HTTP status `410`, directing clients to the Better Auth login endpoint.
 */
export async function onRequestPost() {
  return noStoreJson(
    {
      ok: false,
      error: "supabase_proxy_retired",
      detail: "Authentic/Supabase login is retired. Use https://myfenrir.com/login — Better Auth Worker on /auth/*."
    },
    { status: 410 }
  );
}
