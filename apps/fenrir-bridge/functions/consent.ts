import { betterAuthEnabled, betterAuthOrigin, type FriskyBetterAuthEnv } from "./_lib/better-auth";

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export const onRequestGet: PagesFunction<FriskyBetterAuthEnv> = async (context) => {
  if (!betterAuthEnabled(context.env)) {
    return new Response("Not found", { status: 404 });
  }
  const requestUrl = new URL(context.request.url);
  const authOrigin = betterAuthOrigin(context.env);
  if (requestUrl.origin !== authOrigin) {
    return Response.redirect(`${authOrigin}/consent${requestUrl.search}`, 302);
  }

  const oauthQuery = requestUrl.searchParams.get("oauth_query") ?? "";
  const scopes = (requestUrl.searchParams.get("scope") ?? "openid profile email")
    .split(/\s+/)
    .filter(Boolean);
  const nonce = crypto.randomUUID().replaceAll("-", "");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizar acceso</title>
  <style nonce="${nonce}">:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 10%,#33215f 0,transparent 42%),#08070d;color:#f7f5ff;font-family:Inter,system-ui,sans-serif}main{width:min(470px,calc(100vw - 32px));padding:30px;border:1px solid rgba(255,255,255,.14);border-radius:26px;background:rgba(19,16,29,.84);backdrop-filter:blur(24px);box-shadow:0 24px 90px #0009}h1{font-size:30px;letter-spacing:-.04em;margin:0 0 10px}p,li{color:#aaa4ba;line-height:1.5}.scopes{display:grid;gap:9px;margin:22px 0;padding:0;list-style:none}.scopes li{padding:11px 13px;border-radius:12px;background:#ffffff0d;border:1px solid #ffffff12}.actions{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}button{padding:13px;border-radius:13px;border:1px solid #ffffff20;background:#ffffff0b;color:#fff;font:inherit;font-weight:700;cursor:pointer}.allow{background:linear-gradient(120deg,#7457e8,#aa57cc,#287ea0);border:0}button:disabled{opacity:.5;cursor:wait}#status{min-height:20px;text-align:center;margin-top:14px;color:#aaa4ba;font-size:13px}</style></head>
  <body><main><h1>Autorizar aplicación</h1><p>La aplicación solicita estos permisos de identidad. No obtiene contraseñas ni acceso administrativo.</p><ul class="scopes">${scopes.map((scope) => `<li>${scope.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</li>`).join("")}</ul><div class="actions"><button data-accept="false">Cancelar</button><button class="allow" data-accept="true">Autorizar</button></div><div id="status" role="status"></div></main>
  <script nonce="${nonce}">const oauthQuery=${scriptJson(oauthQuery)};const statusEl=document.getElementById('status');async function decide(accept){document.querySelectorAll('button').forEach(b=>b.disabled=true);statusEl.textContent=accept?'Autorizando…':'Cancelando…';try{const response=await fetch('/api/auth/oauth2/consent',{method:'POST',credentials:'include',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({accept,oauth_query:oauthQuery||undefined})});const data=await response.json().catch(()=>({}));const destination=data.url||data.redirect_uri||data.redirectURI||response.headers.get('location');if(!response.ok||!destination)throw new Error(data.error||'consent_failed');location.assign(destination)}catch(error){document.querySelectorAll('button').forEach(b=>b.disabled=false);statusEl.textContent='No se pudo completar. Intenta otra vez.'}}document.querySelectorAll('[data-accept]').forEach(b=>b.addEventListener('click',()=>decide(b.dataset.accept==='true')))</script></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; connect-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
