import { resolveBrand, BRANDS } from "./brands";
import type { Brand } from "./brands/types";
import { getTemplate, TEMPLATES, TEMPLATE_IDS } from "./templates";
import { dispatchSend, PROVIDERS } from "./providers";
import type { EmailBinding } from "./providers/types";
import { DEFAULT_LOCALE, LOCALES, resolveLocale } from "./locale";

export interface Env {
  EMAIL?: EmailBinding;        // Cloudflare Email Service send binding (default rail)
  EMAIL_PROVIDER?: string;     // "cloudflare" | "resend" | "mailersend"
  EMAIL_FALLBACK?: string;     // comma list, e.g. "resend,mailersend"
  DEFAULT_FROM_EMAIL?: string;
  DEFAULT_FROM_NAME?: string;
  DEFAULT_REPLY_TO?: string;
  ALLOWED_BRANDS?: string;
  REQUIRE_AUTH?: string;
  FORWARD_INBOUND_TO?: string; // optional: where email() forwards inbound mail
  SEND_AUTH_TOKEN?: string;    // secret — bearer that authorizes POST /send
  RESEND_API_KEY?: string;     // secret (fallback)
  MAILERSEND_API_KEY?: string; // secret (fallback)
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
}

// Constant-time-ish bearer check.
function authorized(req: Request, env: Env): boolean {
  if (env.REQUIRE_AUTH !== "1") return true;
  const expected = env.SEND_AUTH_TOKEN;
  if (!expected) return false;
  const got = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (path === "/health") {
      return json({
        status: "ok",
        service: "myfenrir-emails",
        provider: env.EMAIL_PROVIDER || "cloudflare",
        fallback: (env.EMAIL_FALLBACK ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        emailBinding: !!env.EMAIL,
        templates: TEMPLATE_IDS,
        brands: Object.keys(BRANDS),
        providers: PROVIDERS,
        locales: LOCALES,
        defaultLocale: DEFAULT_LOCALE,
      });
    }

    if (path === "/") return html(indexPage(env));

    // GET /preview/<template>?brand=<id>
    if (path.startsWith("/preview/") && req.method === "GET") {
      const id = decodeURIComponent(path.slice("/preview/".length));
      const tpl = getTemplate(id);
      if (!tpl) return json({ error: `Unknown template '${id}'`, templates: TEMPLATE_IDS }, 404);
      const brand = resolveBrand(url.searchParams.get("brand") || "myfenrir");
      const rendered = tpl.render(brand, tpl.sample, resolveLocale(url.searchParams.get("locale")));
      return html(rendered.html);
    }

    // POST /send
    if (path === "/send" && req.method === "POST") {
      if (!authorized(req, env)) return json({ ok: false, error: "Unauthorized" }, 401);
      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON body" }, 400);
      }
      return handleSend(body, env);
    }

    return json({ error: "Not found", try: ["/health", "/preview/<template>", "POST /send"] }, 404);
  },

  // Inbound (Cloudflare Email Routing). Forwards hola@/noreply@ to a verified
  // destination if FORWARD_INBOUND_TO is set; otherwise a safe no-op.
  async email(message: any, env: Env): Promise<void> {
    const to = env.FORWARD_INBOUND_TO;
    if (!to) return;
    try {
      await message.forward(to);
    } catch {
      /* destination not verified yet — drop silently */
    }
  },
} satisfies ExportedHandler<Env>;

async function handleSend(body: any, env: Env): Promise<Response> {
  const templateId = body?.template;
  const tpl = templateId ? getTemplate(templateId) : undefined;
  if (!tpl) return json({ ok: false, error: "Unknown or missing 'template'", templates: TEMPLATE_IDS }, 400);
  if (!body?.to) return json({ ok: false, error: "'to' is required" }, 400);

  const brand: Brand = resolveBrand(body.brand);
  if (env.ALLOWED_BRANDS && brand.id && !env.ALLOWED_BRANDS.split(",").map((s) => s.trim()).includes(brand.id)) {
    return json({ ok: false, error: `Brand '${brand.id}' not allowed` }, 403);
  }

  const locale = resolveLocale(body.locale ?? body.data?.locale ?? body.telegramLanguageCode);
  const rendered = tpl.render(brand, body.data || {}, locale);
  const provider = body.provider || env.EMAIL_PROVIDER || "cloudflare";

  const fromEmail = body?.from?.email || brand.sender.email || env.DEFAULT_FROM_EMAIL || "noreply@mail.myfenrir.com";
  const fromName = body?.from?.name || brand.sender.name || env.DEFAULT_FROM_NAME || "MyFenrir";
  const replyTo = body?.replyTo || brand.sender.replyTo || env.DEFAULT_REPLY_TO;

  const result = await dispatchSend(provider, env, {
    to: body.to,
    fromEmail,
    fromName,
    subject: body.subject || rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo,
    attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
    headers: body.headers,
  });

  return json(
    {
      ok: result.ok,
      provider: result.provider,
      fellBackFrom: (result as any).fellBackFrom,
      id: result.id,
      code: result.code,
      error: result.error,
      template: tpl.id,
      brand: brand.id,
      subject: body.subject || rendered.subject,
      locale,
    },
    result.ok ? 200 : result.status || 500,
  );
}

function indexPage(env: Env): string {
  const brands = Object.keys(BRANDS);
  const studioLogo = BRANDS.myfenrir.logoUrl || "https://www.myfenrir.com/fenrir-splash-icon-512.png";
  const cards = Object.values(TEMPLATES)
    .map((t) => {
      const links = brands
        .map((b) => `<div class="preview-row"><a class="preview" href="/preview/${t.id}?brand=${b}&locale=en">Open email <span>↗</span></a><span class="languages">${LOCALES.map((locale) => `<a href="/preview/${t.id}?brand=${b}&locale=${locale}" aria-label="Preview in ${locale}">${locale.toUpperCase()}</a>`).join("")}</span></div>`)
        .join("");
      return `<article class="template-card" data-tilt>
        <div class="card-shine"></div>
        <div class="card-orbit"></div>
        <div class="card-top"><span class="signal"></span><code>${t.id}</code><span class="rail">EDGE READY</span></div>
        <h2>${t.label}</h2>
        <p>Responsive HTML + texto plano. Renderizado en el edge con la identidad protectora de MyFenrir.</p>
        ${links}
      </article>`;
    })
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#05060b"><title>MyFenrir Signal — Email Studio</title>
  <style>
  :root{color-scheme:dark;--void:#05060b;--panel:#0b0e1a;--text:#eceeff;--muted:#929ab8;--cyan:#00e5ff;--violet:#8b7cff;--gold:#f1b75c}
  *{box-sizing:border-box}html{scroll-behavior:smooth;overflow-x:clip}body{margin:0;background:var(--void);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}
  ::selection{background:var(--cyan);color:#04121a}.spotlight{position:fixed;z-index:0;width:520px;height:520px;border-radius:50%;pointer-events:none;left:var(--mx,75vw);top:var(--my,12vh);transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(0,229,255,.105),rgba(139,124,255,.035) 38%,transparent 70%);filter:blur(4px);transition:opacity .3s}.noise{position:fixed;inset:0;z-index:20;pointer-events:none;opacity:.035;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.95' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E")}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 12% 4%,rgba(139,124,255,.18),transparent 32%),radial-gradient(circle at 88% 12%,rgba(0,229,255,.13),transparent 28%),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:auto,auto,72px 72px,72px 72px;mask-image:linear-gradient(to bottom,#000 0%,transparent 72%)}
  .shell{width:min(1180px,calc(100% - 40px));margin:auto;position:relative}.nav{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(150,166,224,.13)}
  .brand{display:inline-flex;align-items:center;gap:11px;font-weight:900;font-size:19px;letter-spacing:-.04em}.brand img{width:35px;height:35px;display:block;object-fit:contain;filter:drop-shadow(0 0 16px rgba(0,229,255,.22))}.brand i{font-style:normal;color:var(--cyan)}.eyebrow,.rail,code{font:700 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase}.eyebrow{color:#73eef7}.nav-status{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:12px}.pulse,.signal{display:inline-block;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 5px rgba(0,229,255,.1),0 0 24px rgba(0,229,255,.75)}.pulse{width:7px;height:7px}
  .hero{padding:106px 0 84px;display:grid;grid-template-columns:1.35fr .65fr;gap:70px;align-items:end}.hero-copy{position:relative;z-index:2}.hero h1{font-size:clamp(54px,8.7vw,118px);line-height:.84;letter-spacing:-.075em;margin:22px 0 32px;max-width:850px}.hero h1 span{display:block;color:transparent;-webkit-text-stroke:1px rgba(236,238,255,.42);filter:drop-shadow(0 0 28px rgba(139,124,255,.12))}.lede{font-size:clamp(17px,2vw,22px);line-height:1.55;color:#b7bdd4;max-width:680px}.hero-panel{position:relative;border:1px solid rgba(150,166,224,.14);padding:28px;border-radius:28px;background:linear-gradient(145deg,rgba(18,23,52,.6),rgba(5,6,11,.78));backdrop-filter:blur(18px);box-shadow:inset 0 1px rgba(255,255,255,.05),0 34px 100px rgba(0,0,0,.32)}.hero-panel:before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:linear-gradient(145deg,rgba(0,229,255,.42),transparent 30%,transparent 70%,rgba(139,124,255,.35));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}.metric{padding:18px 0;border-bottom:1px solid rgba(150,166,224,.12)}.metric:last-child{border-bottom:0}.metric b{font-size:32px;letter-spacing:-.05em;display:block}.metric span{color:var(--muted);font-size:12px}.cyan{color:var(--cyan)}
  .prism{position:absolute;width:390px;height:390px;right:13%;top:92px;pointer-events:none;opacity:.78;filter:drop-shadow(0 0 42px rgba(0,229,255,.16))}.prism-ring{position:absolute;inset:0;border:1px solid rgba(0,229,255,.18);border-radius:50%;animation:orbit 18s linear infinite}.prism-ring:before,.prism-ring:after{content:"";position:absolute;border-radius:50%;border:1px solid rgba(139,124,255,.2)}.prism-ring:before{inset:42px}.prism-ring:after{inset:92px}.prism-core{position:absolute;inset:105px;display:grid;place-items:center;clip-path:polygon(50% 0,92% 25%,92% 75%,50% 100%,8% 75%,8% 25%);background:linear-gradient(145deg,rgba(0,229,255,.18),rgba(139,124,255,.16));border:1px solid rgba(255,255,255,.25);box-shadow:inset 0 0 40px rgba(0,229,255,.12);animation:float 5s ease-in-out infinite}.prism-core img{width:116%;height:116%;object-fit:contain;filter:drop-shadow(0 0 24px rgba(0,229,255,.48))}.prism-dot{position:absolute;width:7px;height:7px;border-radius:50%;background:var(--cyan);box-shadow:0 0 18px var(--cyan);top:12px;left:50%;animation:orbit-dot 9s linear infinite;transform-origin:0 183px}@keyframes orbit{to{transform:rotate(360deg)}}@keyframes orbit-dot{to{transform:rotate(360deg)}}@keyframes float{50%{transform:translateY(-10px) rotate(2deg)}}
  .marquee{border-block:1px solid rgba(150,166,224,.13);overflow:hidden;white-space:nowrap}.marquee div{padding:15px 0;color:#707999;font:700 10px ui-monospace,monospace;letter-spacing:.22em;word-spacing:2em;animation:drift 28s linear infinite}@keyframes drift{to{transform:translateX(-45%)}}
  .section-head{display:flex;justify-content:space-between;align-items:end;padding:84px 0 28px}.section-head h2{font-size:clamp(34px,5vw,60px);letter-spacing:-.06em;margin:8px 0 0}.section-head p{max-width:390px;color:var(--muted);line-height:1.6}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding-bottom:100px;perspective:1200px}.template-card{--rx:0deg;--ry:0deg;--px:50%;--py:50%;position:relative;overflow:hidden;min-height:310px;padding:30px;border:1px solid rgba(150,166,224,.14);border-radius:24px;background:linear-gradient(145deg,rgba(18,23,52,.8),rgba(8,10,18,.94));transform:rotateX(var(--rx)) rotateY(var(--ry)) translateZ(0);transform-style:preserve-3d;transition:transform .16s ease,border-color .35s ease,box-shadow .35s ease;isolation:isolate}.template-card:before{content:"";position:absolute;inset:-1px;z-index:-1;border-radius:inherit;background:linear-gradient(125deg,rgba(0,229,255,.18),transparent 35%,rgba(139,124,255,.13) 65%,transparent)}.template-card:hover{border-color:rgba(0,229,255,.42);box-shadow:0 32px 90px rgba(0,0,0,.48),0 0 0 1px rgba(0,229,255,.08),0 0 44px rgba(0,229,255,.06)}.card-shine{position:absolute;inset:0;z-index:-1;background:radial-gradient(420px circle at var(--px) var(--py),rgba(255,255,255,.13),rgba(0,229,255,.055) 28%,transparent 62%);opacity:0;transition:opacity .3s}.template-card:hover .card-shine{opacity:1}.card-orbit{position:absolute;width:230px;height:230px;border:1px solid rgba(139,124,255,.17);border-radius:50%;right:-95px;top:-120px;box-shadow:0 0 80px rgba(139,124,255,.09);animation:orbit 24s linear infinite}.card-orbit:after{content:"";position:absolute;inset:24px;border-radius:50%;border:1px dashed rgba(0,229,255,.12)}.card-top{display:flex;align-items:center;gap:12px;transform:translateZ(26px)}.signal{width:5px;height:5px}.card-top code{color:#a9b2d0}.rail{margin-left:auto;color:#64708f}.template-card h2{font-size:31px;letter-spacing:-.04em;margin:58px 0 12px;transform:translateZ(34px)}.template-card p{color:#969fbc;line-height:1.65;max-width:440px;transform:translateZ(22px)}.preview{display:inline-flex;align-items:center;gap:12px;margin-top:22px;padding:12px 16px;border:1px solid rgba(0,229,255,.16);border-radius:999px;background:rgba(0,229,255,.04);color:var(--text);text-decoration:none;font-size:13px;font-weight:750;transform:translateZ(38px);transition:background .25s,border-color .25s,box-shadow .25s}.preview span{color:var(--cyan);transition:.25s}.preview:hover{background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.38);box-shadow:0 0 30px rgba(0,229,255,.09)}.preview:hover span{transform:translate(4px,-2px)}
  .preview-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.languages{display:flex;gap:5px;margin-top:22px}.languages a{padding:8px 7px;border:1px solid rgba(150,166,224,.15);border-radius:8px;color:#8f99ba;text-decoration:none;font:700 9px ui-monospace,monospace;letter-spacing:.08em}.languages a:hover{color:var(--cyan);border-color:rgba(0,229,255,.35)}
  footer{padding:32px 0 48px;border-top:1px solid rgba(150,166,224,.13);display:flex;justify-content:space-between;color:#68718f;font-size:11px}.api{font-family:ui-monospace,monospace;color:#8c95b1}
  @media(max-width:980px){.prism{opacity:.38;right:-90px}}
  @media(max-width:760px){.spotlight{display:none}.shell{width:calc(100% - 40px)}.hero{grid-template-columns:minmax(0,1fr);padding:72px 0 56px;gap:40px}.hero>div{min-width:0}.hero h1{font-size:clamp(44px,13vw,52px);line-height:.9;max-width:100%;overflow-wrap:normal}.lede{font-size:17px;max-width:100%;overflow-wrap:anywhere}.hero-panel{padding:18px 20px}.prism{width:230px;height:230px;right:-82px;top:116px;opacity:.22}.prism-core{inset:70px;font-size:34px}.prism-ring:before{inset:28px}.prism-ring:after{inset:55px}.prism-dot{transform-origin:0 108px}.grid{grid-template-columns:minmax(0,1fr)}.section-head{display:block}.section-head h2{font-size:42px}.template-card{min-height:290px;padding:24px;transform:none!important}.template-card h2{font-size:28px}.nav-status span:last-child{display:none}footer{display:block;line-height:2}}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.template-card{transform:none!important}.spotlight{display:none}}
  </style></head><body><div class="spotlight" aria-hidden="true"></div><div class="noise" aria-hidden="true"></div><main class="shell">
  <nav class="nav"><div class="brand"><img src="${studioLogo}" alt=""><span>FENRIR<i>.</i></span></div><div class="nav-status"><span class="pulse"></span><span>SIGNAL ONLINE · CLOUDFLARE EDGE</span></div></nav>
  <div class="prism" aria-hidden="true"><div class="prism-ring"><span class="prism-dot"></span></div><div class="prism-core"><img src="${studioLogo}" alt=""></div></div>
  <section class="hero"><div class="hero-copy"><div class="eyebrow">MYFENRIR // THE PACK // EMAIL SYSTEM</div><h1>Messages with <span>instinct.</span></h1><p class="lede">Un sistema transaccional que convierte cada acceso, vínculo y bienvenida en una señal inequívocamente MyFenrir.</p></div>
  <aside class="hero-panel"><div class="metric"><b>${TEMPLATE_IDS.length}</b><span>señales transaccionales</span></div><div class="metric"><b class="cyan">${env.EMAIL ? "LIVE" : "READY"}</b><span>Cloudflare Email binding</span></div><div class="metric"><b>2×</b><span>HTML responsivo + texto plano</span></div></aside></section>
  </main><div class="marquee"><div>IDENTITY VERIFIED · PASSWORDLESS ACCESS · TELEGRAM LINKED · PACK ACTIVATED · EDGE DELIVERED · IDENTITY VERIFIED · PASSWORDLESS ACCESS · TELEGRAM LINKED · PACK ACTIVATED · EDGE DELIVERED ·</div></div>
  <main class="shell"><section class="section-head"><div><div class="eyebrow">SIGNAL LIBRARY / 01—08</div><h2>Cada momento,<br>una señal propia.</h2></div><p>Previews reales generados por el mismo renderer que alimenta producción. Sin screenshots falsos, sin plantillas genéricas.</p></section><section class="grid">${cards}</section>
  <footer><span>© ${new Date().getFullYear()} MYFENRIR · FENRIR PROTOCOL</span><span class="api">GET /health · POST /send · EDGE NATIVE</span></footer></main>
  <script>
  (()=>{const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;if(reduce)return;
    addEventListener('pointermove',e=>{document.documentElement.style.setProperty('--mx',e.clientX+'px');document.documentElement.style.setProperty('--my',e.clientY+'px')},{passive:true});
    document.querySelectorAll('[data-tilt]').forEach(card=>{card.addEventListener('pointermove',e=>{if(innerWidth<761)return;const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;card.style.setProperty('--rx',((.5-y)*7).toFixed(2)+'deg');card.style.setProperty('--ry',((x-.5)*9).toFixed(2)+'deg');card.style.setProperty('--px',(x*100).toFixed(1)+'%');card.style.setProperty('--py',(y*100).toFixed(1)+'%')});card.addEventListener('pointerleave',()=>{card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg')})});
  })();
  </script></body></html>`;
}
