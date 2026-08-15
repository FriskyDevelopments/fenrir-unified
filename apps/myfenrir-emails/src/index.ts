import { resolveBrand, BRANDS } from "./brands";
import type { Brand } from "./brands/types";
import { getTemplate, TEMPLATES, TEMPLATE_IDS } from "./templates";
import { dispatchSend, PROVIDERS } from "./providers";
import type { EmailBinding } from "./providers/types";

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
      });
    }

    if (path === "/") return html(indexPage(env));

    // GET /preview/<template>?brand=<id>
    if (path.startsWith("/preview/") && req.method === "GET") {
      const id = decodeURIComponent(path.slice("/preview/".length));
      const tpl = getTemplate(id);
      if (!tpl) return json({ error: `Unknown template '${id}'`, templates: TEMPLATE_IDS }, 404);
      const brand = resolveBrand(url.searchParams.get("brand") || "myfenrir");
      const rendered = tpl.render(brand, tpl.sample);
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

  const rendered = tpl.render(brand, body.data || {});
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
    },
    result.ok ? 200 : result.status || 500,
  );
}

function indexPage(env: Env): string {
  const brands = Object.keys(BRANDS);
  const cards = Object.values(TEMPLATES)
    .map((t) => {
      const links = brands
        .map((b) => `<a class="preview" href="/preview/${t.id}?brand=${b}">Explorar correo <span>↗</span></a>`)
        .join("");
      return `<article class="template-card">
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
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--void);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 12% 4%,rgba(139,124,255,.18),transparent 32%),radial-gradient(circle at 88% 12%,rgba(0,229,255,.13),transparent 28%),linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:auto,auto,72px 72px,72px 72px;mask-image:linear-gradient(to bottom,#000 0%,transparent 72%)}
  .shell{width:min(1180px,calc(100% - 40px));margin:auto;position:relative}.nav{height:88px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(150,166,224,.13)}
  .brand{font-weight:900;font-size:19px;letter-spacing:-.04em}.brand i{font-style:normal;color:var(--cyan)}.eyebrow,.rail,code{font:700 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase}.eyebrow{color:#73eef7}.nav-status{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:12px}.pulse,.signal{display:inline-block;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 5px rgba(0,229,255,.1),0 0 24px rgba(0,229,255,.75)}.pulse{width:7px;height:7px}
  .hero{padding:106px 0 84px;display:grid;grid-template-columns:1.35fr .65fr;gap:70px;align-items:end}.hero h1{font-size:clamp(54px,8.7vw,118px);line-height:.84;letter-spacing:-.075em;margin:22px 0 32px;max-width:850px}.hero h1 span{display:block;color:transparent;-webkit-text-stroke:1px rgba(236,238,255,.42)}.lede{font-size:clamp(17px,2vw,22px);line-height:1.55;color:#b7bdd4;max-width:680px}.hero-panel{border-left:1px solid rgba(150,166,224,.18);padding-left:28px}.metric{padding:18px 0;border-bottom:1px solid rgba(150,166,224,.12)}.metric b{font-size:32px;letter-spacing:-.05em;display:block}.metric span{color:var(--muted);font-size:12px}.cyan{color:var(--cyan)}
  .marquee{border-block:1px solid rgba(150,166,224,.13);overflow:hidden;white-space:nowrap}.marquee div{padding:15px 0;color:#707999;font:700 10px ui-monospace,monospace;letter-spacing:.22em;word-spacing:2em;animation:drift 28s linear infinite}@keyframes drift{to{transform:translateX(-45%)}}
  .section-head{display:flex;justify-content:space-between;align-items:end;padding:84px 0 28px}.section-head h2{font-size:clamp(34px,5vw,60px);letter-spacing:-.06em;margin:8px 0 0}.section-head p{max-width:390px;color:var(--muted);line-height:1.6}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;padding-bottom:100px}.template-card{position:relative;overflow:hidden;min-height:300px;padding:30px;border:1px solid rgba(150,166,224,.14);border-radius:24px;background:linear-gradient(145deg,rgba(18,23,52,.76),rgba(8,10,18,.92));transition:.35s ease}.template-card:hover{transform:translateY(-5px);border-color:rgba(0,229,255,.35);box-shadow:0 28px 70px rgba(0,0,0,.35)}.card-orbit{position:absolute;width:210px;height:210px;border:1px solid rgba(139,124,255,.14);border-radius:50%;right:-90px;top:-110px;box-shadow:0 0 80px rgba(139,124,255,.08)}.card-top{display:flex;align-items:center;gap:12px}.signal{width:5px;height:5px}.card-top code{color:#9ca5c5}.rail{margin-left:auto;color:#64708f}.template-card h2{font-size:31px;letter-spacing:-.04em;margin:58px 0 12px}.template-card p{color:#969fbc;line-height:1.65;max-width:440px}.preview{display:inline-flex;align-items:center;gap:12px;margin-top:22px;color:var(--text);text-decoration:none;font-size:13px;font-weight:750}.preview span{color:var(--cyan);transition:.25s}.preview:hover span{transform:translate(4px,-2px)}
  footer{padding:32px 0 48px;border-top:1px solid rgba(150,166,224,.13);display:flex;justify-content:space-between;color:#68718f;font-size:11px}.api{font-family:ui-monospace,monospace;color:#8c95b1}
  @media(max-width:760px){.shell{width:calc(100% - 40px)}.hero{grid-template-columns:minmax(0,1fr);padding:72px 0 56px;gap:40px}.hero>div{min-width:0}.hero h1{font-size:clamp(44px,13vw,52px);line-height:.9;max-width:100%;overflow-wrap:normal}.lede{font-size:17px;max-width:100%;overflow-wrap:anywhere}.hero-panel{border-left:0;border-top:1px solid rgba(150,166,224,.18);padding:18px 0 0}.grid{grid-template-columns:minmax(0,1fr)}.section-head{display:block}.section-head h2{font-size:42px}.template-card{min-height:270px;padding:24px}.template-card h2{font-size:28px}.nav-status span:last-child{display:none}footer{display:block;line-height:2}}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style></head><body><main class="shell">
  <nav class="nav"><div class="brand">FENRIR<i>.</i></div><div class="nav-status"><span class="pulse"></span><span>SIGNAL ONLINE · CLOUDFLARE EDGE</span></div></nav>
  <section class="hero"><div><div class="eyebrow">MYFENRIR // THE PACK // EMAIL SYSTEM</div><h1>Messages with <span>instinct.</span></h1><p class="lede">Un sistema transaccional que convierte cada acceso, vínculo y bienvenida en una señal inequívocamente MyFenrir.</p></div>
  <aside class="hero-panel"><div class="metric"><b>${TEMPLATE_IDS.length}</b><span>señales transaccionales</span></div><div class="metric"><b class="cyan">${env.EMAIL ? "LIVE" : "READY"}</b><span>Cloudflare Email binding</span></div><div class="metric"><b>2×</b><span>HTML responsivo + texto plano</span></div></aside></section>
  </main><div class="marquee"><div>IDENTITY VERIFIED · PASSWORDLESS ACCESS · TELEGRAM LINKED · PACK ACTIVATED · EDGE DELIVERED · IDENTITY VERIFIED · PASSWORDLESS ACCESS · TELEGRAM LINKED · PACK ACTIVATED · EDGE DELIVERED ·</div></div>
  <main class="shell"><section class="section-head"><div><div class="eyebrow">SIGNAL LIBRARY / 01—08</div><h2>Cada momento,<br>una señal propia.</h2></div><p>Previews reales generados por el mismo renderer que alimenta producción. Sin screenshots falsos, sin plantillas genéricas.</p></section><section class="grid">${cards}</section>
  <footer><span>© ${new Date().getFullYear()} MYFENRIR · FENRIR PROTOCOL</span><span class="api">GET /health · POST /send · EDGE NATIVE</span></footer></main></body></html>`;
}
