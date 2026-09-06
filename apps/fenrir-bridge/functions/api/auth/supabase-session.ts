import { noStoreJson } from "../../_lib/responses";

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
