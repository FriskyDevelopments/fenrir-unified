export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(request.url);
    target.hostname = 'fenrir-stars-payments.hrgrrtks2p.workers.dev';
    target.pathname = incoming.pathname.replace(/^\/gate(?=\/|$)/, '') || '/';

    const routed = new Request(target.toString(), request);
    routed.headers.set('x-fenrir-gate-route', 'myfenrir.com/gate');
    return fetch(routed);
  },
};
