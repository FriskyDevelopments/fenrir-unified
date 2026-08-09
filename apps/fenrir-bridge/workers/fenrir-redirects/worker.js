// fenrir-redirects — edge canonicalization Worker for myfenrir.com
//
// Provided by Francisco. Bound to BOTH hostnames so it runs BEFORE Pages/origin:
//   1) Force HTTPS  (http -> https, 301, preserves path + query via URL)
//   2) Apex -> www  (myfenrir.com -> www.myfenrir.com, 301)
//   3) Everything else passes through untouched to the Pages origin.
//
// ⚠️ Do NOT deploy without reading ./README.md — this intercepts 100% of prod
// traffic on both hostnames. Confirm www.myfenrir.com already serves the Pages
// origin, and confirm the canonical direction (the repo currently canonicalizes
// on the APEX — see README), before activating apex->www.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    if (url.hostname === "myfenrir.com") {
      url.hostname = "www.myfenrir.com";
      return Response.redirect(url.toString(), 301);
    }
    return fetch(request);
  },
};
