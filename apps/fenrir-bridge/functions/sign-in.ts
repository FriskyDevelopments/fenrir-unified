import {
  betterAuthOrigin,
  betterAuthEnabled,
  configuredBetterAuthProviders,
  isFriskySocialProvider,
  type FriskyBetterAuthEnv,
} from "./_lib/better-auth";
import { safeReturnPath } from "./_lib/oauth";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export const onRequestGet: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  if (!betterAuthEnabled(context.env)) {
    return Response.redirect("https://www.myfenrir.com/login", 302);
  }
  const requestUrl = new URL(context.request.url);
  const authOrigin = betterAuthOrigin(context.env);
  if (requestUrl.origin !== authOrigin) {
    return Response.redirect(`${authOrigin}/sign-in${requestUrl.search}`, 302);
  }

  const providers = configuredBetterAuthProviders(context.env);
  const requestedProvider = requestUrl.searchParams.get("provider");
  const autoProvider = isFriskySocialProvider(requestedProvider) && providers.includes(requestedProvider)
    ? requestedProvider
    : null;
  const returnTo = safeReturnPath(requestUrl.searchParams.get("return_to"));
  const oauthFlow = Boolean(
    requestUrl.searchParams.get("client_id") &&
      requestUrl.searchParams.get("sig"),
  );
  const nonce = crypto.randomUUID().replaceAll("-", "");

  const labels: Record<string, string> = {
    google: "Continuar con Google",
    microsoft: "Continuar con Microsoft",
    apple: "Continuar con Apple",
  };

  const buttons = providers.length
    ? providers
        .map(
          (provider) =>
            `<button type="button" data-provider="${provider}"><span class="provider-mark ${provider}"></span>${escapeHtml(labels[provider])}</button>`,
        )
        .join("")
    : '<p class="empty">No hay proveedores sociales configurados en este momento.</p>';

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Frisky Developments — Acceso</title>
  <style nonce="${nonce}">
    :root{color-scheme:dark;--ink:#f6f4ff;--muted:#a7a1bd;--line:rgba(255,255,255,.13);--violet:#9b7cff;--cyan:#63e6ff;--pink:#ff77bc}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:var(--ink);background:radial-gradient(circle at 15% 10%,rgba(111,66,193,.38),transparent 38%),radial-gradient(circle at 88% 82%,rgba(15,151,188,.28),transparent 34%),#07060c;overflow:hidden}
    body:before{content:"";position:fixed;inset:-40%;background:conic-gradient(from 90deg,transparent,rgba(155,124,255,.12),transparent,rgba(99,230,255,.09),transparent);filter:blur(70px);animation:turn 24s linear infinite}@keyframes turn{to{transform:rotate(1turn)}}
    main{position:relative;width:min(430px,calc(100vw - 32px));padding:30px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(145deg,rgba(25,22,38,.88),rgba(11,10,17,.76));box-shadow:0 30px 100px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.09);backdrop-filter:blur(26px)}
    .eyebrow{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.15em}.pulse{width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 18px var(--cyan)}
    h1{margin:20px 0 8px;font-size:34px;letter-spacing:-.045em;line-height:1.02}.gradient{background:linear-gradient(90deg,var(--violet),var(--pink),var(--cyan));-webkit-background-clip:text;color:transparent}p{color:var(--muted);line-height:1.55;margin:0 0 24px}
    .stack{display:grid;gap:11px}button{width:100%;border:1px solid var(--line);border-radius:15px;padding:14px 16px;background:rgba(255,255,255,.055);color:var(--ink);font:inherit;font-weight:650;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;transition:.2s transform,.2s border-color,.2s background}button:hover{transform:translateY(-1px);border-color:rgba(155,124,255,.7);background:rgba(155,124,255,.12)}button:disabled{opacity:.55;cursor:wait;transform:none}
    .provider-mark{width:17px;height:17px;border-radius:5px;background:linear-gradient(135deg,var(--violet),var(--cyan))}.provider-mark.google{background:conic-gradient(#4285f4 0 25%,#34a853 0 50%,#fbbc05 0 75%,#ea4335 0)}.provider-mark.microsoft{border-radius:2px;background:conic-gradient(#7fba00 0 25%,#00a4ef 0 50%,#ffb900 0 75%,#f25022 0)}.provider-mark.apple{border-radius:50%;background:#fff}
    #status{min-height:22px;margin:16px 0 0;font-size:13px;color:var(--muted);text-align:center}.foot{margin-top:20px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:#77718d;text-align:center}.empty{text-align:center;margin:0}.brand{font-weight:800;letter-spacing:-.02em}
    @media (prefers-reduced-motion:reduce){body:before{animation:none}button{transition:none}}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow"><span class="pulse"></span><span>Identidad Frisky segura</span></div>
    <h1>Una cuenta.<br><span class="gradient">Todo el ecosistema.</span></h1>
    <p>Accede con tu proveedor de confianza. Better Auth mantiene la sesión; cada producto conserva sus propios permisos.</p>
    <div class="stack">${buttons}</div>
    <div id="status" role="status" aria-live="polite"></div>
    <div class="foot"><span class="brand">FRISKY DEVELOPMENTS</span> · Acceso cifrado · Sin Authentik</div>
  </main>
  <script nonce="${nonce}">
    const providers = ${scriptJson(providers)};
    const autoProvider = ${scriptJson(autoProvider)};
    const returnTo = ${scriptJson(returnTo)};
    const oauthFlow = ${scriptJson(oauthFlow)};
    const statusEl = document.getElementById('status');
    let started = false;
    function callbackURL(provider) {
      if (oauthFlow) return location.href;
      const url = new URL('https://www.myfenrir.com/api/auth/better-complete');
      url.searchParams.set('provider', provider);
      url.searchParams.set('return_to', returnTo);
      return url.toString();
    }
    async function signIn(provider) {
      if (started || !providers.includes(provider)) return;
      started = true;
      document.querySelectorAll('button').forEach((button) => button.disabled = true);
      statusEl.textContent = 'Abriendo el proveedor seguro…';
      try {
        const response = await fetch('/api/auth/sign-in/social', {
          method: 'POST',
          credentials: 'include',
          headers: {'content-type':'application/json','accept':'application/json'},
          body: JSON.stringify({provider, callbackURL: callbackURL(provider), errorCallbackURL: location.href})
        });
        const data = await response.json().catch(() => ({}));
        const destination = data.url || data.redirectURI || response.headers.get('location');
        if (!response.ok || !destination) throw new Error(data.message || data.error || 'provider_start_failed');
        location.assign(destination);
      } catch (error) {
        started = false;
        document.querySelectorAll('button').forEach((button) => button.disabled = false);
        statusEl.textContent = 'No se pudo abrir el proveedor. Intenta otra vez.';
      }
    }
    document.querySelectorAll('[data-provider]').forEach((button) => button.addEventListener('click', () => signIn(button.dataset.provider)));
    if (autoProvider) queueMicrotask(() => signIn(autoProvider));
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; connect-src 'self'; img-src 'self' data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
