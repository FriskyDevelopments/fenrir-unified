export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(request.url);

    // Telegram Mini App and /gate/app used to proxy the old Pages Gatekeeper
    // (fenrir-bridge.pages.dev). New Gate lives on communities.myfenrir.com.
    if (incoming.pathname === "/gate/app" || incoming.pathname === "/gate/miniapp") {
      const dest = new URL("https://communities.myfenrir.com/gate");
      dest.search = incoming.search;
      return Response.redirect(dest.toString(), 302);
    }

    // Keep the verification grant on the Pages implementation for now.
    if (incoming.pathname === "/api/verification/canonical-grant") {
      target.protocol = "https:";
      target.hostname = "fenrir-bridge.pages.dev";
      const routed = new Request(target.toString(), request);
      routed.headers.set("x-fenrir-gate-route", "myfenrir.com/gate/miniapp");
      return fetch(routed);
    }

    target.hostname = "fenrir-stars-payments.hrgrrtks2p.workers.dev";

    // /gate/* strips the /gate prefix; all other matched routes pass through as-is
    if (incoming.pathname.startsWith("/gate")) {
      target.pathname = incoming.pathname.replace(/^\/gate(?=\/|$)/, "") || "/";
    }

    const routed = new Request(target.toString(), request);
    routed.headers.set("x-fenrir-gate-route", "myfenrir.com/gate");
    return fetch(routed);
  }
};
