export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(request.url);

    // Keep the Telegram Mini App on the canonical MyFenrir URL while serving
    // the Pages build as an implementation detail.
    if (incoming.pathname === "/gate/app" || incoming.pathname === "/gate/miniapp" || incoming.pathname === "/api/verification/canonical-grant") {
      target.protocol = "https:";
      target.hostname = "26b313d5.fenrir-bridge.pages.dev";
      target.pathname = incoming.pathname === "/api/verification/canonical-grant" ? incoming.pathname : "/gate/app";
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
