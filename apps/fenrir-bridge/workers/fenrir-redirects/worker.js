// fenrir-redirects — edge canonicalization Worker for myfenrir.com
//
// Bound to BOTH hostnames so it runs BEFORE Pages/origin for unmatched paths:
//   1) Force HTTPS  (http -> https, 301, preserves path + query)
//   2) www -> apex  (www.myfenrir.com -> myfenrir.com, 301)
//   3) Everything else passes through untouched to the Pages origin.
//
// Cookie domain and Better Auth callbacks are apex (`myfenrir.com`). Folios#29
// proved www-without-a-Worker-route looks like a broken login; canonicalizing
// to apex keeps /login and /auth/me on the same host as fenrir_session.
//
// More-specific Workers still win at the routing layer:
//   - fenrir-auth-worker: myfenrir.com/auth/* and www.myfenrir.com/auth/*
//   - fenrir-gate-router: www.myfenrir.com/gate/* (Telegram Mini App stays on www)
// This catch-all must stay `/*` so it does not steal those routes.
//
// ⚠️ Deploy is a manual step. See ./README.md.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    let changed = false;
    if (url.protocol === "http:") {
      url.protocol = "https:";
      changed = true;
    }
    if (url.hostname === "www.myfenrir.com") {
      url.hostname = "myfenrir.com";
      changed = true;
    }
    if (changed) return Response.redirect(url.toString(), 301);
    return fetch(request);
  },
};
