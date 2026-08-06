export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(request.url);
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
