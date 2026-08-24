import type { BillingEnv } from "../../../_lib/billing-env";

/**
 * Public read for MyFenrir R2 media (binding: MEDIA -> myfenrir-media).
 * Serves objects written by /api/media/upload. GET only; nothing but the object
 * bytes is returned. The key is validated so a request can never escape the
 * bucket (no traversal, restricted charset).
 */
export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  if (!context.env.MEDIA) {
    return new Response("Not found", { status: 404 });
  }

  const parts = context.params.path;
  const key = Array.isArray(parts) ? parts.join("/") : String(parts ?? "");

  if (!key || key.includes("..") || !/^[A-Za-z0-9/_.-]{1,200}$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  const object = await context.env.MEDIA.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("x-content-type-options", "nosniff");
  if (object.httpEtag) headers.set("etag", object.httpEtag);

  return new Response(object.body, { headers });
};
