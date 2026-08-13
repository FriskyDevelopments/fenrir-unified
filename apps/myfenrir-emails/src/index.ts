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
  const rows = Object.values(TEMPLATES)
    .map((t) => {
      const links = brands
        .map((b) => `<a href="/preview/${t.id}?brand=${b}" style="color:#00E5FF;margin-right:12px;text-decoration:none;">${b}</a>`)
        .join("");
      return `<tr><td style="padding:10px 14px;color:#ECEEFF;font-weight:600;">${t.label}<br><code style="color:#8B7CFF;font-size:12px;">${t.id}</code></td><td style="padding:10px 14px;">${links}</td></tr>`;
    })
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>MyFenrir Emails</title>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;padding:40px 20px;background:#05060B;color:#ECEEFF;">
  <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#4FD7E0;">MYFENRIR // THE PACK</div>
  <h1 style="letter-spacing:-.5px;margin:6px 0 0;">FENRIR<span style="color:#00E5FF;">.</span> · Email service</h1>
  <p style="color:#AEB5D0;">Provider: <b style="color:#00E5FF;">${env.EMAIL_PROVIDER || "cloudflare"}</b>
    · Fallback: <b>${env.EMAIL_FALLBACK || "none"}</b>
    · EMAIL binding: <b>${env.EMAIL ? "on" : "off"}</b></p>
  <table style="border-collapse:collapse;width:100%;border:1px solid rgba(150,166,224,.16);border-radius:12px;overflow:hidden;margin-top:16px;">
  <tr style="background:#0B0E1A;"><th align="left" style="padding:12px 14px;color:#AEB5D0;">Plantilla</th><th align="left" style="padding:12px 14px;color:#AEB5D0;">Previews por marca</th></tr>
  ${rows}</table>
  <p style="color:#858BA8;margin-top:24px;font-size:13px;">POST <code>/send</code> · GET <code>/health</code></p></body>`;
}
