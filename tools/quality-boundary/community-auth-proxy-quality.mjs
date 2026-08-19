// community-auth-proxy-quality.mjs
//
// QUALITY-ONLY boundary proxy. Forwards Community Bridge Quality
// /api/auth/{me,logout} to MyFenrir QUALITY (quality.myfenrir.com) so the
// `.myfenrir.com` session cookie is read from the Quality surface — NEVER prod.
//
// This is a NEW worker (community-bridge-auth-proxy-quality). It does NOT modify
// the existing shared `community-bridge-auth-proxy` (whose UPSTREAM is prod
// www.myfenrir.com). Deploy + route only once communities-quality.myfenrir.com
// is bound to community-bridge-quality.
const UPSTREAM = "https://quality.myfenrir.com";
const ALLOWED_PATHS = new Set(["/api/auth/me", "/api/auth/logout"]);

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!ALLOWED_PATHS.has(incoming.pathname)) {
      return new Response("Not found", { status: 404 });
    }
    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);
    const headers = new Headers(request.headers);
    headers.set("host", target.host);
    const upstream = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      }),
    );
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("x-fenrir-edge", "community-auth-proxy-quality");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  },
};
